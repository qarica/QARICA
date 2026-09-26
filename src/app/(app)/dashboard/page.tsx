import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { TQM_CHART_CSS, TqmDonut, TqmGantt, TqmHorizontalBars, TqmTrend } from "@/components/tqm-charts";
import { TqmSmartCommandCenter } from "@/components/tqm-smart-command-center";
import { TqmProcessMap } from "@/components/tqm-process-map";
import { TqmScorecard } from "@/components/tqm-scorecard";
import { TqmInterventionLoop } from "@/components/tqm-intervention-loop";
import { TqmPriorityBoard } from "@/components/tqm-priority-board";
import { requireUserContext } from "@/lib/auth";
import { buildIndicatorKpi, buildProjectActionKpi, isDueOnOrBeforeToday } from "@/lib/dashboard-kpi";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";
import { incidentHarmClassification, incidentDomainDistribution } from "@/lib/incident-dashboard";

const CLOSED = new Set(["CANCELLED", "ARCHIVED", "INACTIVE", "RETIRED"]);

function todayHcm() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()); }
function monthKey(value: string | null | undefined) { if (!value) return null; return String(value).slice(0, 7); }
function last9Months(today: string) {
  const [y, m] = today.split("-").map(Number);
  const out: string[] = [];
  for (let i = 8; i >= 0; i--) { const d = new Date(Date.UTC(y, m - 1 - i, 1)); out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`); }
  return out;
}
function monthLabel(key: string) { return `T${key.slice(5, 7)}`; }
function pctChange(current: number, previous: number): { text: string; tone: "up" | "down" | "flat" } {
  if (!previous) { if (current > 0) return { text: `+${current} so với tháng trước`, tone: "up" }; return { text: "Không thay đổi", tone: "flat" }; }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { text: "Không thay đổi", tone: "flat" };
  return { text: `${pct > 0 ? "+" : ""}${pct}% so với tháng trước`, tone: pct > 0 ? "up" : "down" };
}
const RISK_MED = new Set(["MEDIUM", "MODERATE"]);
const RISK_LOW = new Set(["LOW"]);
function riskTier(level: string | null | undefined) { const v = String(level || "").toUpperCase(); if (["VERY_HIGH", "CRITICAL", "EXTREME"].includes(v)) return "RAT_CAO"; if (v === "HIGH") return "CAO"; if (RISK_MED.has(v)) return "TRUNG_BINH"; if (RISK_LOW.has(v)) return "THAP"; return null; }

export default async function DashboardPage() {
  const { user } = await requireUserContext();
  const year = await getWorkYear();
  const supabase = await createClient();
  const today = todayHcm();
  const months = last9Months(today);

  const recordsRes = await supabase.from("records").select("id,record_type,record_code,title,work_year,lifecycle_status").eq("work_year",year);
  const records = ((recordsRes.data ?? []) as any[]).filter((r:any)=>!CLOSED.has(r.lifecycle_status));
  const recordIdList=records.map((r:any)=>r.id).filter(Boolean);
  const incidentRecordIds = new Set(records.filter((r: any) => r.record_type === "INCIDENT").map((r: any) => r.id));

  const [incidentsAllRes, capasRes, risksRes, auditsRes, indicatorsRes] = recordIdList.length ? await Promise.all([
    supabase.from("incidents").select("id,record_id,workflow_status,serious_event_flag,harm_status,reported_at").in("record_id",recordIdList),
    supabase.from("capas").select("id,record_id,workflow_status,effectiveness_due_date,priority").in("record_id",recordIdList),
    supabase.from("risks").select("id,record_id,workflow_status,next_review_date"),
    supabase.from("audits").select("id,record_id,workflow_status,start_date,end_date,closed_at,report_finalized_at"),
    supabase.from("indicator_measurements").select("id,record_id,workflow_status,result_level").in("record_id",recordIdList),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }];

  const incidentsAll = ((incidentsAllRes.data ?? []) as any[]).filter((x: any) => incidentRecordIds.has(x.record_id));
  const openIncidents = incidentsAll.filter((x: any) => !["CLOSED", "CANCELLED", "REJECTED"].includes(String(x.workflow_status)));
  const thisMonthNew = incidentsAll.filter((x: any) => monthKey(x.reported_at) === months[8]).length;
  const lastMonthNew = incidentsAll.filter((x: any) => monthKey(x.reported_at) === months[7]).length;
  const investigating = openIncidents.filter((x: any) => x.workflow_status === "INVESTIGATING").length;
  const investigatingLastMonth = incidentsAll.filter((x: any) => x.workflow_status === "INVESTIGATING" && monthKey(x.reported_at) === months[7]).length;

  const capas = (capasRes.data ?? []) as any[];
  const capaOverdue = capas.filter((x: any) => !["CLOSED", "CANCELLED", "EFFECTIVE"].includes(String(x.workflow_status)) && x.effectiveness_due_date && x.effectiveness_due_date < today);
  const capaOverdueLastMonth = capas.filter((x: any) => x.effectiveness_due_date && x.effectiveness_due_date < months[7] + "-28").length;
  const capaByStatus = { DONE: capas.filter((x: any) => x.workflow_status === "EFFECTIVE").length, IN_PROGRESS: capas.filter((x: any) => ["IN_PROGRESS", "EFFECTIVENESS_REVIEW"].includes(String(x.workflow_status))).length, OVERDUE: capaOverdue.length, NOT_STARTED: capas.filter((x: any) => x.workflow_status === "DRAFT").length };
  const capaTotal = capas.filter((x: any) => x.workflow_status !== "CANCELLED").length;

  const risks = (risksRes.data ?? []) as any[];
  const riskIds = risks.map((x: any) => x.id);
  const assessmentsRes = riskIds.length ? await supabase.from("risk_assessments").select("risk_id,calculated_level,assessment_date,created_at").in("risk_id", riskIds).order("assessment_date", { ascending: false }).order("created_at", { ascending: false }) : { data: [], error: null };
  const latestLevelByRisk = new Map<string, string>();
  for (const a of (assessmentsRes.data ?? []) as any[]) { if (!latestLevelByRisk.has(a.risk_id)) latestLevelByRisk.set(a.risk_id, a.calculated_level); }
  const activeRisks = risks.filter((x: any) => x.workflow_status !== "RETIRED");
  const riskTiers = { THAP: 0, TRUNG_BINH: 0, CAO: 0, RAT_CAO: 0 };
  for (const r of activeRisks) { const tier = riskTier(latestLevelByRisk.get(r.id)); if (tier) (riskTiers as any)[tier]++; }
  const highRiskCount = riskTiers.CAO + riskTiers.RAT_CAO;
  const riskAssessedTotal = riskTiers.THAP + riskTiers.TRUNG_BINH + riskTiers.CAO + riskTiers.RAT_CAO;

  const audits = (auditsRes.data ?? []) as any[];
  const auditInProgress = audits.filter((x: any) => ["IN_PROGRESS", "DRAFT_REPORT", "REPORT_REVIEW", "FOLLOW_UP"].includes(String(x.workflow_status))).length;
  const auditInProgressLastMonth = audits.filter((x: any) => ["IN_PROGRESS", "DRAFT_REPORT", "REPORT_REVIEW", "FOLLOW_UP"].includes(String(x.workflow_status)) && monthKey(x.start_date) === months[7]).length;
  const auditPlannedByMonth = new Map<string, number>(); const auditDoneByMonth = new Map<string, number>();
  for (const a of audits) { const pm = monthKey(a.start_date); if (pm) auditPlannedByMonth.set(pm, (auditPlannedByMonth.get(pm) || 0) + 1); const dm = monthKey(a.closed_at || a.report_finalized_at); if (dm && a.workflow_status === "CLOSED") auditDoneByMonth.set(dm, (auditDoneByMonth.get(dm) || 0) + 1); }
  const auditNearDue = audits.filter((x: any) => !["CLOSED", "CANCELLED"].includes(String(x.workflow_status)) && x.end_date && x.end_date >= today && x.end_date <= new Date(new Date(today).getTime() + 7 * 86400000).toISOString().slice(0, 10));

  const outTargetIndicators = ((indicatorsRes.data ?? []) as any[]).filter((x: any) => x.result_level === "OUT_OF_TARGET");

  const domainLinksRes = incidentRecordIds.size ? await supabase.from("record_quality_domain_links").select("record_id,domain_id").in("record_id", Array.from(incidentRecordIds)) : { data: [], error: null };
  const domainIds = Array.from(new Set(((domainLinksRes.data ?? []) as any[]).map((x: any) => String(x.domain_id || "")).filter(Boolean)));
  const domainsRes = domainIds.length ? await supabase.from("quality_domains").select("id,name,sort_order,is_active").in("id", domainIds).eq("is_active", true) : { data: [], error: null };
  const domainDistribution = incidentDomainDistribution(Array.from(incidentRecordIds) as string[], (domainLinksRes.data ?? []) as any[], (domainsRes.data ?? []) as any[]);
  const domainTotal = domainDistribution.rows.reduce((s: number, r: any) => s + r.value, 0);
  const domainSegments = domainDistribution.rows.slice(0, 6).map((r: any, i: number) => ({ label: r.label as string, value: r.value as number, tone: (["brand", "green", "amber", "red", "blue", "slate"] as const)[i % 6] }));

  const trendRows = months.map((m) => {
    const inMonth = incidentsAll.filter((x: any) => monthKey(x.reported_at) === m);
    let low = 0, high = 0, veryHigh = 0;
    for (const inc of inMonth) { const h = incidentHarmClassification(inc.harm_status); if (h?.classLabel?.includes("Tử vong")) veryHigh++; else if (h?.serious) high++; else low++; }
    return { month: m, low, high, veryHigh, total: inMonth.length };
  });
  const trendMax = Math.max(1, ...trendRows.map((r) => r.total));

  const JOURNEY_STAGES = [
    { key: "REPORTED", label: "Báo cáo", status: "Mới", statuses: ["REPORTED", "RETURNED"] },
    { key: "TRIAGED", label: "Sàng lọc", status: "Đang xử lý", statuses: ["TRIAGED", "INVESTIGATION_REQUIRED"] },
    { key: "INVESTIGATING", label: "RCA", status: "Đang thực hiện", statuses: ["INVESTIGATING"] },
    { key: "ACTION_FOLLOW_UP", label: "CAPA", status: "Đang triển khai", statuses: ["ACTION_FOLLOW_UP"] },
    { key: "AWAITING_CLOSURE", label: "Xác minh", status: "Chờ xác minh", statuses: ["AWAITING_CLOSURE"] },
    { key: "CLOSED", label: "Đóng", status: "Hoàn tất", statuses: ["CLOSED"] },
  ];
  const journeyCounts = JOURNEY_STAGES.map((stage) => ({ ...stage, count: incidentsAll.filter((x: any) => stage.statuses.includes(String(x.workflow_status))).length }));

  const alerts = [
    capaOverdue.length ? { icon: "clock", tone: "red", title: `${capaOverdue.length} CAPA đã quá hạn`, sub: "Cần phân công/đôn đốc thực hiện", when: "Hôm nay", href: "/capa" } : null,
    outTargetIndicators.length ? { icon: "chart-no-axes-column-increasing", tone: "amber", title: `${outTargetIndicators.length} chỉ số vượt ngưỡng`, sub: "Ngoài mục tiêu trong kỳ đo gần nhất", when: today, href: "/indicators" } : null,
    auditNearDue.length ? { icon: "calendar-days", tone: "purple", title: `${auditNearDue.length} Audit sắp đến hạn`, sub: auditNearDue[0]?.end_date ? `Dự kiến: ${auditNearDue[0].end_date}` : "", when: today, href: "/audits" } : null,
    investigating > 0 ? { icon: "file-text", tone: "blue", title: `${investigating} sự cố đang điều tra RCA`, sub: "Cần theo dõi tiến độ phân tích nguyên nhân", when: today, href: "/incidents" } : null,
  ].filter(Boolean) as { icon: string; tone: string; title: string; sub: string; when: string; href: string }[];

  // Legacy TQM operational sections (Plan/Indicator/Monitoring/Finding/Improvement) - kept
  // fully intact per "existing functionality must survive": this is a visual migration for
  // the new command-center sections above, not a rewrite of these modules' business logic.
  const [programProgressRes, departmentsRes, monitoringRes] = await Promise.all([
    supabase.from("vw_program_progress").select("program_id,record_id,record_code,title,work_year,required_actions,completed_actions,progress_pct,overdue_actions").eq("work_year", year),
    supabase.from("departments").select("id,name,short_name").eq("is_active", true).order("name"),
    supabase.from("monitoring_rounds").select("id,record_id,scheduled_date,target_department_id,workflow_status").eq("work_year", year).neq("workflow_status", "CANCELLED"),
  ]);
  const recordMap = new Map(records.map((r: any) => [r.id, r]));
  const activeRecordIds = new Set(recordIdList);
  const depMap = new Map(((departmentsRes.data ?? []) as any[]).map((d: any) => [d.id, d.short_name || d.name]));

  const plans = ((programProgressRes.data ?? []) as any[]).filter((x: any) => activeRecordIds.has(x.record_id));
  const planReq = plans.reduce((s: any, x: any) => s + Number(x.required_actions || 0), 0);
  const planDone = plans.reduce((s: any, x: any) => s + Number(x.completed_actions || 0), 0);
  const planOverdue = plans.reduce((s: any, x: any) => s + Number(x.overdue_actions || 0), 0);
  const planPct = planReq ? Math.round((planDone / planReq) * 100) : (plans.length ? Math.round(plans.reduce((s: any, x: any) => s + Number(x.progress_pct || 0), 0) / plans.length) : 0);

  const [legacyIndicatorsRes, projectsRes, legacyFindingsRes, evidenceLinksRes] = recordIdList.length ? await Promise.all([
    supabase.from("indicator_measurements").select("id,record_id,workflow_status,result_level,period_end").in("record_id",recordIdList),
    supabase.from("improvement_projects").select("id,record_id,workflow_status,start_date,target_end_date,actual_end_date,problem_statement").in("record_id",recordIdList),
    supabase.from("findings").select("id,record_id,workflow_status,due_date,severity").in("record_id",recordIdList),
    supabase.from("record_links").select("source_record_id,target_record_id").eq("relation_type", "HAS_ACTION"),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  const indicatorKpi = buildIndicatorKpi((legacyIndicatorsRes.data ?? []) as any[]);
  const legacyOutTarget = indicatorKpi.outTarget; const indicatorPct = indicatorKpi.percentage; const indicatorTrend = indicatorKpi.trend;

  const monitoring = ((monitoringRes.data ?? []) as any[]).filter((x: any) => activeRecordIds.has(x.record_id));
  const roundIds = monitoring.map((x: any) => x.id);
  const responsesRes = roundIds.length ? await supabase.from("checklist_responses").select("monitoring_round_id,result_status").in("monitoring_round_id", roundIds) : { data: [] as any[], error: null };
  const responseMap = new Map<string, { pass: number; fail: number }>();
  for (const x of (responsesRes.data ?? []) as any[]) { const a = responseMap.get(x.monitoring_round_id) ?? { pass: 0, fail: 0 }; if (String(x.result_status).toUpperCase() === "PASS") a.pass++; if (String(x.result_status).toUpperCase() === "FAIL") a.fail++; responseMap.set(x.monitoring_round_id, a); }
  let monitorPass = 0, monitorFail = 0; const deptAgg = new Map<string, { pass: number; fail: number }>();
  for (const r of monitoring) { const a = responseMap.get(r.id) ?? { pass: 0, fail: 0 }; monitorPass += a.pass; monitorFail += a.fail; const key = r.target_department_id || "none"; const d = deptAgg.get(key) ?? { pass: 0, fail: 0 }; d.pass += a.pass; d.fail += a.fail; deptAgg.set(key, d); }
  const monitoringPct = (monitorPass + monitorFail) ? Math.round((monitorPass / (monitorPass + monitorFail)) * 100) : 0;
  const deptBars = Array.from(deptAgg.entries()).map(([id, a]) => { const n = a.pass + a.fail; const pct = n ? Math.round((a.pass / n) * 100) : 0; return { label: String(depMap.get(id) || "Chưa xác định"), value: pct, tone: (pct >= 90 ? "green" : pct >= 75 ? "blue" : pct >= 60 ? "amber" : "red") as any, caption: `${n} mục đã chấm` }; }).filter((x) => x.caption !== "0 mục đã chấm").sort((a, b) => a.value - b.value).slice(0, 10);

  const legacyProjects = (projectsRes.data ?? []) as any[];
  const projectRecordIds = legacyProjects.map((x: any) => x.record_id);
  const links = ((evidenceLinksRes.data ?? []) as any[]).filter((l: any) => projectRecordIds.includes(l.source_record_id));
  const projectActionIds = Array.from(new Set(links.map((x: any) => x.target_record_id).filter(Boolean)));
  const projectActionsRes = projectActionIds.length ? await supabase.from("actions").select("record_id,workflow_status,due_date").in("record_id", projectActionIds) : { data: [] as any[], error: null };
  const projectActionMap = new Map(((projectActionsRes.data ?? []) as any[]).map((x: any) => [x.record_id, x]));
  const projectActionsByProject = new Map<string, any[]>();
  for (const l of links) { const a = projectActionMap.get(l.target_record_id); if (!a) continue; const arr = projectActionsByProject.get(l.source_record_id) ?? []; arr.push(a); projectActionsByProject.set(l.source_record_id, arr); }
  const projectRows = legacyProjects.map((p: any) => { const r: any = recordMap.get(p.record_id); const acts = (projectActionsByProject.get(p.record_id) ?? []).filter((a: any) => !["CANCELLED", "NOT_APPLICABLE"].includes(String(a.workflow_status))); const done = acts.filter((a: any) => a.workflow_status === "COMPLETED").length; const progress = acts.length ? Math.round((done / acts.length) * 100) : 0; const overdue = acts.filter((a: any) => a.workflow_status !== "COMPLETED" && a.due_date && a.due_date < today).length; return { ...p, title: r?.title || "Đề án cải tiến", record_code: r?.record_code || "—", actions: acts.length, completed: done, progress, overdue }; });
  const projectKpi = buildProjectActionKpi(projectRows); const projectPct = projectKpi.percentage;
  const ganttRows = projectRows.filter((x: any) => x.start_date && x.target_end_date).map((x: any) => ({ label: x.title, start: x.start_date, end: x.target_end_date, progress: x.progress, tone: (x.overdue ? "red" : x.progress >= 75 ? "green" : "blue") as any }));

  const legacyFindings = ((legacyFindingsRes.data ?? []) as any[]).filter((x: any) => !["CLOSED", "CANCELLED"].includes(String(x.workflow_status)));
  const legacyOverdueFindings = legacyFindings.filter((x: any) => x.due_date && x.due_date < today).length;
  const legacyCapaDue = capas.filter((x: any) => activeRecordIds.has(x.record_id) && (String(x.workflow_status) === "EFFECTIVENESS_REVIEW" || isDueOnOrBeforeToday(x.effectiveness_due_date, today))).length;
  const legacySeriousOpen = incidentsAll.filter((x: any) => activeRecordIds.has(x.record_id) && x.serious_event_flag && !["CLOSED", "CANCELLED", "REJECTED"].includes(String(x.workflow_status))).length;
  const legacyHotspots = [{ label: "Finding quá hạn", value: legacyOverdueFindings, href: "/findings", tone: "red" as const }, { label: "CAPA đến hạn đánh giá", value: legacyCapaDue, href: "/capa", tone: "amber" as const }, { label: "Sự cố nghiêm trọng đang mở", value: legacySeriousOpen, href: "/incidents", tone: "red" as const }, { label: "Chỉ số ngoài mục tiêu", value: legacyOutTarget, href: "/indicators", tone: "amber" as const }].sort((a, b) => b.value - a.value);

  const firstError = [recordsRes, incidentsAllRes, capasRes, risksRes, auditsRes, indicatorsRes, domainLinksRes, domainsRes, programProgressRes, departmentsRes, monitoringRes].find((x: any) => x.error)?.error;

  return <div className="page-stack qcc-dashboard">
    <style>{TQM_CHART_CSS + `
      .qcc-dashboard .breadcrumb{display:flex;align-items:center;gap:6px;color:#64748b;font-size:12px;margin-bottom:4px}
      .qcc-dashboard .page-header-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
      .qcc-dashboard .page-header-row .scope-controls{display:flex;gap:8px;flex-wrap:wrap}
      .qcc-dashboard .scope-controls .button{white-space:nowrap}
      .qcc-dashboard .title-with-icon{display:flex;align-items:center;gap:12px}
      .qcc-dashboard .title-with-icon .icon-badge{width:40px;height:40px;border-radius:12px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;flex:0 0 40px}
      .qcc-dashboard .kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
      .qcc-dashboard .kpi-card{background:#fff;border:1px solid #e5eaf2;border-radius:14px;padding:16px;box-shadow:0 1px 2px rgba(15,23,42,.03)}
      .qcc-dashboard .kpi-card-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
      .qcc-dashboard .kpi-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff}
      .qcc-dashboard .kpi-icon.blue{background:#3b82f6}.qcc-dashboard .kpi-icon.green{background:#22c55e}.qcc-dashboard .kpi-icon.amber{background:#f59e0b}.qcc-dashboard .kpi-icon.red{background:#ef4444}.qcc-dashboard .kpi-icon.purple{background:#8b5cf6}
      .qcc-dashboard .kpi-title{font-size:12.5px;color:#475569;font-weight:600}
      .qcc-dashboard .kpi-value{font-size:26px;font-weight:800;color:#0f172a}
      .qcc-dashboard .kpi-trend{font-size:11px;font-weight:700;margin-top:6px}
      .qcc-dashboard .kpi-trend.up{color:#16a34a}.qcc-dashboard .kpi-trend.down{color:#dc2626}.qcc-dashboard .kpi-trend.flat{color:#94a3b8}
      .qcc-dashboard .grid2{display:grid;grid-template-columns:1.3fr .9fr;gap:14px}
      .qcc-dashboard .grid3{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .qcc-dashboard .grid-bottom{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
      .qcc-dashboard .head{padding:16px 18px 4px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
      .qcc-dashboard .head h2{margin:0;font-size:15px}
      .qcc-dashboard .head p{margin:4px 0 0;color:#74838a;font-size:11px}
      .qcc-dashboard .stacked-trend{padding:8px 18px 18px;overflow-x:auto}
      .qcc-dashboard .stacked-trend-legend{display:flex;gap:14px;padding:0 18px;font-size:11px;color:#475569}
      .qcc-dashboard .stacked-trend-legend span{display:inline-flex;align-items:center;gap:5px}
      .qcc-dashboard .stacked-trend-legend i{width:9px;height:9px;border-radius:3px}
      .qcc-dashboard .stacked-bars{display:flex;align-items:flex-end;gap:14px;height:200px;min-width:480px;padding-top:10px}
      .qcc-dashboard .stacked-bar-col{display:flex;flex-direction:column;align-items:center;gap:8px;flex:1}
      .qcc-dashboard .stacked-bar{width:26px;display:flex;flex-direction:column-reverse;border-radius:4px 4px 0 0;overflow:hidden}
      .qcc-dashboard .stacked-bar-seg{width:100%}
      .qcc-dashboard .stacked-bar-label{font-size:10px;color:#94a3b8}
      .qcc-dashboard .journey{display:flex;align-items:center;padding:20px 22px 22px;overflow-x:auto;gap:0}
      .qcc-dashboard .journey-step{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:82px}
      .qcc-dashboard .journey-circle{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff}
      .qcc-dashboard .journey-title{font-size:12px;font-weight:700;color:#0f172a}
      .qcc-dashboard .journey-status{font-size:9.5px;font-weight:700;padding:2px 8px;border-radius:999px}
      .qcc-dashboard .journey-connector{flex:1;height:2px;background:#e2e8f0;min-width:24px}
      .qcc-dashboard .alerts{display:grid;gap:10px;padding:8px 16px 16px}
      .qcc-dashboard .alert-row{display:grid;grid-template-columns:auto 1fr auto auto;gap:12px;align-items:center;border:1px solid #eef2f7;border-radius:12px;padding:12px}
      .qcc-dashboard .alert-icon{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex:0 0 34px}
      .qcc-dashboard .alert-icon.red{background:#fef2f2;color:#dc2626}.qcc-dashboard .alert-icon.amber{background:#fffbeb;color:#d97706}.qcc-dashboard .alert-icon.purple{background:#f5f3ff;color:#7c3aed}.qcc-dashboard .alert-icon.blue{background:#eff6ff;color:#2563eb}
      .qcc-dashboard .alert-row strong{display:block;font-size:12.5px}
      .qcc-dashboard .alert-row small{color:#94a3b8;font-size:11px}
      .qcc-dashboard .alert-when{font-size:11px;color:#94a3b8;white-space:nowrap}
      @media(max-width:1100px){.qcc-dashboard .kpis{grid-template-columns:repeat(2,1fr)}.qcc-dashboard .grid2,.qcc-dashboard .grid3,.qcc-dashboard .grid-bottom{grid-template-columns:1fr}}
      .qcc-dashboard .qcc-legacy-divider{display:flex;align-items:center;gap:14px;margin:8px 0 2px;color:#94a3b8;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
      .qcc-dashboard .qcc-legacy-divider:before,.qcc-dashboard .qcc-legacy-divider:after{content:"";flex:1;height:1px;background:#e5eaf2}
      .qcc-dashboard .legacy-grid3{display:grid;grid-template-columns:1.15fr .85fr;gap:14px}
      .qcc-dashboard .hotspots{display:grid;gap:8px;padding:8px 16px 16px}
      .qcc-dashboard .hotspot{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:13px;border-radius:13px;border:1px solid #e4eaec;background:#fbfdfd}
      .qcc-dashboard .hotspot strong{font-size:12px}.qcc-dashboard .hotspot b{font-size:22px}
      .qcc-dashboard .hotspot.red b{color:#c84350}.qcc-dashboard .hotspot.amber b{color:#b86f1a}
      .qcc-dashboard .quick{display:flex;gap:8px;flex-wrap:wrap;padding:0 16px 16px}
      @media(max-width:920px){.qcc-dashboard .legacy-grid3{grid-template-columns:1fr}}
    `}</style>

    <div className="breadcrumb"><Link href="/dashboard">Tổng quan</Link></div>
    <div className="page-header-row">
      <div className="title-with-icon">
        <span className="icon-badge"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1" /></svg></span>
        <div><PageHeader title="Trung tâm Điều hành Chất lượng" description="Theo dõi, phân tích và quản lý tổng thể các hoạt động chất lượng, an toàn người bệnh" /></div>
      </div>
      <div className="scope-controls"><span className="button secondary" style={{ pointerEvents: "none" }}>{months[0]}-01 → {today}</span><span className="button secondary" style={{ pointerEvents: "none" }}>{user.scopeTypes.includes("HOSPITAL") ? "Toàn bệnh viện" : user.primaryDepartmentName || "Phạm vi được phân công"}</span></div>
    </div>

    {firstError ? <div className="alert error">Một phần dữ liệu chưa tải được: {firstError.message}</div> : null}

    <section className="kpis">
      <article className="kpi-card"><div className="kpi-card-top"><span className="kpi-icon blue"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></span></div><div className="kpi-title">Sự cố mới</div><div className="kpi-value">{thisMonthNew}</div><div className={`kpi-trend ${pctChange(thisMonthNew, lastMonthNew).tone}`}>{pctChange(thisMonthNew, lastMonthNew).tone === "up" ? "▲" : pctChange(thisMonthNew, lastMonthNew).tone === "down" ? "▼" : ""} {pctChange(thisMonthNew, lastMonthNew).text}</div></article>
      <article className="kpi-card"><div className="kpi-card-top"><span className="kpi-icon green"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span></div><div className="kpi-title">Đang phân tích RCA</div><div className="kpi-value">{investigating}</div><div className={`kpi-trend ${pctChange(investigating, investigatingLastMonth).tone}`}>{pctChange(investigating, investigatingLastMonth).tone === "up" ? "▲" : pctChange(investigating, investigatingLastMonth).tone === "down" ? "▼" : ""} {pctChange(investigating, investigatingLastMonth).text}</div></article>
      <article className="kpi-card"><div className="kpi-card-top"><span className="kpi-icon amber"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></span></div><div className="kpi-title">CAPA quá hạn</div><div className="kpi-value">{capaOverdue.length}</div><div className={`kpi-trend ${pctChange(capaOverdue.length, capaOverdueLastMonth).tone}`}>{pctChange(capaOverdue.length, capaOverdueLastMonth).tone === "up" ? "▲" : pctChange(capaOverdue.length, capaOverdueLastMonth).tone === "down" ? "▼" : ""} {pctChange(capaOverdue.length, capaOverdueLastMonth).text}</div></article>
      <article className="kpi-card"><div className="kpi-card-top"><span className="kpi-icon red"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg></span></div><div className="kpi-title">Rủi ro mức cao</div><div className="kpi-value">{highRiskCount}</div><div className="kpi-trend flat">Không thay đổi</div></article>
      <article className="kpi-card"><div className="kpi-card-top"><span className="kpi-icon purple"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></span></div><div className="kpi-title">Audit đang thực hiện</div><div className="kpi-value">{auditInProgress}</div><div className={`kpi-trend ${pctChange(auditInProgress, auditInProgressLastMonth).tone}`}>{pctChange(auditInProgress, auditInProgressLastMonth).tone === "up" ? "▲" : pctChange(auditInProgress, auditInProgressLastMonth).tone === "down" ? "▼" : ""} {pctChange(auditInProgress, auditInProgressLastMonth).text}</div></article>
    </section>

    <section className="grid2">
      <article className="panel"><div className="head"><div><h2>Xu hướng sự cố y khoa</h2><p>Số lượng sự cố theo tháng và theo mức độ tổn hại (taxonomy thật của hệ thống).</p></div></div>
        <div className="stacked-trend-legend"><span><i style={{ background: "#3b82f6" }} />Không nghiêm trọng</span><span><i style={{ background: "#f59e0b" }} />Nghiêm trọng</span><span><i style={{ background: "#ef4444" }} />Rất nghiêm trọng</span></div>
        <div className="stacked-trend"><div className="stacked-bars">{trendRows.map((r) => <div className="stacked-bar-col" key={r.month}><div className="stacked-bar" style={{ height: `${Math.max(4, (r.total / trendMax) * 160)}px` }}>{r.veryHigh ? <span className="stacked-bar-seg" style={{ background: "#ef4444", height: `${(r.veryHigh / Math.max(1, r.total)) * 100}%` }} /> : null}{r.high ? <span className="stacked-bar-seg" style={{ background: "#f59e0b", height: `${(r.high / Math.max(1, r.total)) * 100}%` }} /> : null}{r.low ? <span className="stacked-bar-seg" style={{ background: "#3b82f6", height: `${(r.low / Math.max(1, r.total)) * 100}%` }} /> : null}</div><span className="stacked-bar-label">{monthLabel(r.month)}</span></div>)}</div></div>
      </article>
      <article className="panel"><div className="head"><h2>Phân bố sự cố theo lĩnh vực</h2><p>Theo taxonomy Lĩnh vực chất lượng &amp; an toàn dùng chung.</p></div>{domainSegments.length ? <TqmDonut value={domainTotal} label="Tổng số sự cố" segments={domainSegments} /> : <div className="empty-state">Chưa có hồ sơ được gắn lĩnh vực.</div>}</article>
    </section>

    <section className="grid3">
      <article className="panel"><div className="head"><h2>Tiến độ xử lý sự cố</h2><Link className="button tertiary small" href="/incidents">Xem chi tiết →</Link></div>
        <div className="journey">{journeyCounts.map((stage, i) => <>
          <div className="journey-step" key={stage.key}><div className="journey-circle" style={{ background: ["#3b82f6", "#06b6d4", "#3b82f6", "#f59e0b", "#ec4899", "#22c55e"][i] }}>{stage.count}</div><div className="journey-title">{stage.label}</div><span className="journey-status" style={{ background: "#f1f5f9", color: "#475569" }}>{stage.status}</span></div>
          {i < journeyCounts.length - 1 ? <div className="journey-connector" key={`c-${stage.key}`} /> : null}
        </>)}</div>
      </article>
      <article className="panel"><div className="head"><h2>Cảnh báo &amp; công việc cần chú ý</h2><Link className="button tertiary small" href="/tasks">Xem tất cả →</Link></div>
        <div className="alerts">{alerts.length === 0 ? <div className="empty-state">Không có cảnh báo nào đang mở.</div> : alerts.map((a, i) => <Link href={a.href} className="alert-row" key={i}><span className={`alert-icon ${a.tone}`}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /></svg></span><span><strong>{a.title}</strong><small>{a.sub}</small></span><span className="alert-when">{a.when}</span><span>→</span></Link>)}</div>
      </article>
    </section>

    <section className="grid-bottom">
      <article className="panel"><div className="head"><h2>Tình trạng CAPA</h2><Link className="button tertiary small" href="/capa">Xem chi tiết →</Link></div>{capaTotal ? <TqmDonut value={capaTotal} label="Tổng CAPA" segments={[{ label: "Hoàn thành", value: capaByStatus.DONE, tone: "green" as const }, { label: "Đang thực hiện", value: capaByStatus.IN_PROGRESS, tone: "blue" as const }, { label: "Quá hạn", value: capaByStatus.OVERDUE, tone: "red" as const }, { label: "Chưa thực hiện", value: capaByStatus.NOT_STARTED, tone: "slate" as const }].filter((s) => s.value > 0)} /> : <div className="empty-state">Chưa có CAPA.</div>}</article>
      <article className="panel"><div className="head"><h2>Hoạt động Audit</h2><Link className="button tertiary small" href="/audits">Xem chi tiết →</Link></div>
        <div className="stacked-trend-legend"><span><i style={{ background: "#bfdbfe" }} />Kế hoạch</span><span><i style={{ background: "#2563eb" }} />Đã thực hiện</span></div>
        <div className="stacked-trend"><div className="stacked-bars">{months.slice(3).map((m) => { const planned = auditPlannedByMonth.get(m) || 0; const done = auditDoneByMonth.get(m) || 0; const max = Math.max(1, ...months.map((mm) => Math.max(auditPlannedByMonth.get(mm) || 0, auditDoneByMonth.get(mm) || 0))); return <div className="stacked-bar-col" key={m}><div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 160 }}><span style={{ width: 10, background: "#bfdbfe", borderRadius: "3px 3px 0 0", height: `${Math.max(2, (planned / max) * 150)}px` }} /><span style={{ width: 10, background: "#2563eb", borderRadius: "3px 3px 0 0", height: `${Math.max(2, (done / max) * 150)}px` }} /></div><span className="stacked-bar-label">{monthLabel(m)}</span></div>; })}</div></div>
      </article>
      <article className="panel"><div className="head"><h2>Tình hình rủi ro</h2><Link className="button tertiary small" href="/risks">Xem chi tiết →</Link></div>{riskAssessedTotal ? <TqmDonut value={riskAssessedTotal} label="Tổng rủi ro" segments={[{ label: "Thấp", value: riskTiers.THAP, tone: "green" as const }, { label: "Trung bình", value: riskTiers.TRUNG_BINH, tone: "amber" as const }, { label: "Cao", value: riskTiers.CAO, tone: "blue" as const }, { label: "Rất cao", value: riskTiers.RAT_CAO, tone: "red" as const }].filter((s) => s.value > 0)} /> : <div className="empty-state">Chưa có rủi ro được đánh giá.</div>}</article>
    </section>

    <div className="qcc-legacy-divider"><span>Kế hoạch, giám sát &amp; cải tiến chất lượng</span></div>
    <TqmSmartCommandCenter year={year} />
    <TqmProcessMap planPct={planPct} indicatorPct={indicatorPct} monitoringPct={monitoringPct} openFindings={legacyFindings.length} capaDue={legacyCapaDue} projectPct={projectPct} />
    <TqmScorecard planPct={planPct} indicatorPct={indicatorPct} monitoringPct={monitoringPct} projectPct={projectPct} seriousIncidents={legacySeriousOpen} overdueFindings={legacyOverdueFindings} />
    <TqmInterventionLoop openFindings={legacyFindings.length} overdueFindings={legacyOverdueFindings} capaDue={legacyCapaDue} projectPct={projectPct} />
    <TqmPriorityBoard serious={legacySeriousOpen} overdueFindings={legacyOverdueFindings} capaDue={legacyCapaDue} outTarget={legacyOutTarget} planOverdue={planOverdue} />
    <section className="legacy-grid3"><article className="panel"><div className="head"><h2>Tiến độ kế hoạch chất lượng năm</h2><p>Từ Action thực tế của các kế hoạch.</p></div><TqmDonut value={planPct} label="Hoàn thành" segments={[{ label: "Đã hoàn thành", value: planDone, tone: "brand" }, { label: "Còn lại", value: Math.max(0, planReq - planDone), tone: "blue" }, { label: "Quá hạn", value: planOverdue, tone: "red" }]} /></article><article className="panel"><div className="head"><h2>Điểm nóng cần chú ý</h2><p>Chỉ giữ các vấn đề quản trị cấp bệnh viện.</p></div><div className="hotspots">{legacyHotspots.map((x) => <Link href={x.href} key={x.label} className={`hotspot ${x.tone}`}><strong>{x.label}</strong><b>{x.value}</b></Link>)}</div><div className="quick"><Link className="button secondary" href="/plans">Kế hoạch năm</Link><Link className="button secondary" href="/monitoring">Giám sát</Link><Link className="button secondary" href="/improvement/projects">Cải tiến</Link></div></article></section>
    <section className="grid2"><article className="panel"><div className="head"><h2>Xu hướng chỉ số đạt mục tiêu 12 tháng</h2><p>Tỷ lệ MEETS_TARGET trong các kỳ VERIFIED/LOCKED đã có kết luận mục tiêu.</p></div><TqmTrend points={indicatorTrend} /></article><article className="panel"><div className="head"><h2>Giám sát theo khoa/phòng</h2><p>Đơn vị có tỷ lệ mục đạt thấp được đưa lên trước.</p></div>{deptBars.length ? <TqmHorizontalBars rows={deptBars} max={100} /> : <div className="empty-state">Chưa có dữ liệu giám sát đủ để so sánh.</div>}</article></section>
    <section className="panel"><div className="head"><h2>Gantt đề án cải tiến trọng tâm</h2><p>Thời gian và tiến độ lấy từ dữ liệu đề án/Action thật.</p></div>{ganttRows.length ? <TqmGantt year={year} rows={ganttRows} /> : <div className="empty-state">Chưa đủ mốc thời gian đề án để dựng Gantt.</div>}</section>
  </div>;
}
