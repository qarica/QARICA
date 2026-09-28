import Link from "next/link";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { TQM_CHART_CSS, TqmDonut, TqmGantt, TqmHorizontalBars, TqmTrend } from "@/components/tqm-charts";
import { TqmSmartCommandCenter } from "@/components/tqm-smart-command-center";
import { TqmInterventionLoop } from "@/components/tqm-intervention-loop";
import { TqmPriorityBoard } from "@/components/tqm-priority-board";
import { requireUserContext } from "@/lib/auth";
import { buildIndicatorKpi, buildProjectActionKpi, isDueOnOrBeforeToday } from "@/lib/dashboard-kpi";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkYear } from "@/lib/work-year";
import { incidentHarmClassification, incidentDomainDistribution } from "@/lib/incident-dashboard";

const CLOSED = new Set(["CANCELLED", "ARCHIVED", "INACTIVE", "RETIRED"]);

function todayHcm() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()); }
function monthKey(value: string | null | undefined) { if (!value) return null; return String(value).slice(0, 7); }
function addMonths(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthsBetween(from: string, to: string) {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const startIdx = fy * 12 + (fm - 1);
  const endIdx = ty * 12 + (tm - 1);
  const count = Math.max(2, Math.min(24, endIdx - startIdx + 1));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const idx = endIdx - count + 1 + i;
    out.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`);
  }
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

const RANGE_LABEL: Record<string, string> = { week: "Tuần", month: "Tháng", quarter: "Quý" };
function quarterKey(monthKey_: string) { const [y, m] = monthKey_.split("-").map(Number); return `${y}-Q${Math.ceil(m / 3)}`; }
function quarterLabel(key: string) { return key.split("-")[1]; }
function isoWeekKey(dateStr: string) {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
function weekLabel(key: string) { return `T${key.split("-W")[1]}`; }
function last12Weeks(todayStr: string) {
  const base = new Date(`${todayStr}T00:00:00Z`);
  const out: string[] = [];
  for (let i = 11; i >= 0; i--) { const d = new Date(base.getTime() - i * 7 * 86400000); out.push(isoWeekKey(d.toISOString().slice(0, 10))); }
  return Array.from(new Set(out));
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ asOf?: string; from?: string; dept?: string; range?: string }> }) {
  const { user } = await requireUserContext();
  const year = await getWorkYear();
  const supabase = await createClient();
  const admin = createAdminClient();
  const query = await searchParams;
  const range = ["week", "month", "quarter"].includes(String(query.range || "")) ? String(query.range) : "month";
  const requestedAsOf = String(query.asOf || "").trim();
  const today = /^\d{4}-\d{2}-\d{2}$/.test(requestedAsOf) && requestedAsOf <= todayHcm() ? requestedAsOf : todayHcm();
  const defaultFrom = addMonths(today.slice(0, 7), -8) + "-01";
  const requestedFrom = String(query.from || "").trim();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(requestedFrom) && requestedFrom <= today ? requestedFrom : defaultFrom;
  const isHospitalScope = user.scopeTypes.includes("HOSPITAL");
  const selectedDept = isHospitalScope ? String(query.dept || "").trim() : "";
  const months = monthsBetween(from.slice(0, 7), today.slice(0, 7));

  const recordsRes = await supabase.from("records").select("id,record_type,record_code,title,work_year,lifecycle_status,owner_department_id").eq("work_year",year);
  const records = ((recordsRes.data ?? []) as any[]).filter((r:any)=>!CLOSED.has(r.lifecycle_status)&&(!selectedDept||r.owner_department_id===selectedDept));
  const recordIdList=records.map((r:any)=>r.id).filter(Boolean);
  const incidentRecordIds = new Set(records.filter((r: any) => r.record_type === "INCIDENT").map((r: any) => r.id));

  const [incidentsAllRes, capasRes, risksRes, auditsRes, indicatorsRes] = recordIdList.length ? await Promise.all([
    supabase.from("incidents").select("id,record_id,workflow_status,serious_event_flag,harm_status,reported_at").in("record_id",recordIdList),
    supabase.from("capas").select("id,record_id,workflow_status,effectiveness_due_date,priority").in("record_id",recordIdList),
    supabase.from("risks").select("id,record_id,workflow_status,next_review_date"),
    admin.from("audits").select("id,record_id,workflow_status,start_date,end_date,closed_at,report_finalized_at"),
    supabase.from("indicator_measurements").select("id,record_id,workflow_status,result_level").in("record_id",recordIdList),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }];

  const incidentsAll = ((incidentsAllRes.data ?? []) as any[]).filter((x: any) => incidentRecordIds.has(x.record_id));
  const openIncidents = incidentsAll.filter((x: any) => !["CLOSED", "CANCELLED", "REJECTED"].includes(String(x.workflow_status)));
  const curMonth = months[months.length - 1];
  const prevMonth = months[months.length - 2];
  const thisMonthNew = incidentsAll.filter((x: any) => monthKey(x.reported_at) === curMonth).length;
  const lastMonthNew = incidentsAll.filter((x: any) => monthKey(x.reported_at) === prevMonth).length;
  const investigating = openIncidents.filter((x: any) => x.workflow_status === "INVESTIGATING").length;
  const investigatingLastMonth = incidentsAll.filter((x: any) => x.workflow_status === "INVESTIGATING" && monthKey(x.reported_at) === prevMonth).length;

  const capas = (capasRes.data ?? []) as any[];
  const capaOverdue = capas.filter((x: any) => !["CLOSED", "CANCELLED", "EFFECTIVE"].includes(String(x.workflow_status)) && x.effectiveness_due_date && x.effectiveness_due_date < today);
  const capaOverdueLastMonth = capas.filter((x: any) => x.effectiveness_due_date && x.effectiveness_due_date < prevMonth + "-28").length;
  const capaByStatus = { DONE: capas.filter((x: any) => x.workflow_status === "EFFECTIVE").length, IN_PROGRESS: capas.filter((x: any) => ["IN_PROGRESS", "EFFECTIVENESS_REVIEW"].includes(String(x.workflow_status))).length, OVERDUE: capaOverdue.length, NOT_STARTED: capas.filter((x: any) => x.workflow_status === "DRAFT").length };

  const risks = (risksRes.data ?? []) as any[];
  const riskIds = risks.map((x: any) => x.id);
  const assessmentsRes = riskIds.length ? await supabase.from("risk_assessments").select("risk_id,calculated_level,assessment_date,created_at").in("risk_id", riskIds).order("assessment_date", { ascending: false }).order("created_at", { ascending: false }) : { data: [], error: null };
  const latestLevelByRisk = new Map<string, string>();
  for (const a of (assessmentsRes.data ?? []) as any[]) { if (!latestLevelByRisk.has(a.risk_id)) latestLevelByRisk.set(a.risk_id, a.calculated_level); }
  const activeRisks = risks.filter((x: any) => x.workflow_status !== "RETIRED");
  const riskTiers = { THAP: 0, TRUNG_BINH: 0, CAO: 0, RAT_CAO: 0 };
  for (const r of activeRisks) { const tier = riskTier(latestLevelByRisk.get(r.id)); if (tier) (riskTiers as any)[tier]++; }
  const highRiskCount = riskTiers.CAO + riskTiers.RAT_CAO;

  const audits = (auditsRes.data ?? []) as any[];
  const auditInProgress = audits.filter((x: any) => ["IN_PROGRESS", "DRAFT_REPORT", "REPORT_REVIEW", "FOLLOW_UP"].includes(String(x.workflow_status))).length;
  const auditInProgressLastMonth = audits.filter((x: any) => ["IN_PROGRESS", "DRAFT_REPORT", "REPORT_REVIEW", "FOLLOW_UP"].includes(String(x.workflow_status)) && monthKey(x.start_date) === prevMonth).length;
  const auditNearDue = audits.filter((x: any) => !["CLOSED", "CANCELLED"].includes(String(x.workflow_status)) && x.end_date && x.end_date >= today && x.end_date <= new Date(new Date(today).getTime() + 7 * 86400000).toISOString().slice(0, 10));
  const auditActive = audits.filter((x: any) => x.workflow_status !== "CANCELLED");
  const auditDone = auditActive.filter((x: any) => x.workflow_status === "CLOSED").length;
  const auditNotStarted = auditActive.length - auditDone - auditInProgress;

  const ownerCoveragePct = records.length ? Math.round((records.filter((r: any) => r.owner_user_id).length / records.length) * 100) : 0;
  const deptCoveragePct = records.length ? Math.round((records.filter((r: any) => r.owner_department_id).length / records.length) * 100) : 0;

  const outTargetIndicators = ((indicatorsRes.data ?? []) as any[]).filter((x: any) => x.result_level === "OUT_OF_TARGET");

  const domainLinksRes = incidentRecordIds.size ? await admin.from("record_quality_domain_links").select("record_id,domain_id").in("record_id", Array.from(incidentRecordIds)) : { data: [], error: null };
  const domainIds = Array.from(new Set(((domainLinksRes.data ?? []) as any[]).map((x: any) => String(x.domain_id || "")).filter(Boolean)));
  const domainsRes = domainIds.length ? await admin.from("quality_domains").select("id,name,sort_order,is_active").in("id", domainIds).eq("is_active", true) : { data: [], error: null };
  const domainDistribution = incidentDomainDistribution(Array.from(incidentRecordIds) as string[], (domainLinksRes.data ?? []) as any[], (domainsRes.data ?? []) as any[]);
  const domainSegments = domainDistribution.rows.slice(0, 6).map((r: any, i: number) => ({ label: r.label as string, value: r.value as number, tone: (["brand", "green", "amber", "red", "blue", "slate"] as const)[i % 6] }));

  const trendBuckets = range === "quarter"
    ? Array.from(new Set(months.map((m) => quarterKey(m))))
    : range === "week"
    ? last12Weeks(today)
    : months;
  const bucketOf = (reportedAt: string | null | undefined): string | null => {
    if (!reportedAt) return null;
    if (range === "quarter") { const mk = monthKey(reportedAt); return mk ? quarterKey(mk) : null; }
    if (range === "week") return isoWeekKey(String(reportedAt).slice(0, 10));
    return monthKey(reportedAt);
  };
  const bucketLabel = range === "quarter" ? quarterLabel : range === "week" ? weekLabel : monthLabel;
  const trendRows = trendBuckets.map((bucket) => {
    const inBucket = incidentsAll.filter((x: any) => bucketOf(x.reported_at) === bucket);
    let low = 0, high = 0, veryHigh = 0;
    for (const inc of inBucket) { const h = incidentHarmClassification(inc.harm_status); if (h?.classLabel?.includes("Tử vong")) veryHigh++; else if (h?.serious) high++; else low++; }
    return { month: bucket, low, high, veryHigh, total: inBucket.length };
  });
  const trendMax = Math.max(1, ...trendRows.map((r) => r.total));

  const incidentStatusTotal = incidentsAll.length;
  const incidentStatusDone = incidentsAll.filter((x: any) => x.workflow_status === "CLOSED").length;
  const incidentStatusInProgress = incidentsAll.filter((x: any) => ["TRIAGED", "INVESTIGATION_REQUIRED", "INVESTIGATING", "ACTION_FOLLOW_UP", "AWAITING_CLOSURE"].includes(String(x.workflow_status))).length;
  const incidentStatusNew = incidentsAll.filter((x: any) => ["REPORTED", "RETURNED"].includes(String(x.workflow_status))).length;
  const incidentStatusOverdue = openIncidents.filter((x: any) => { const days = Math.floor((Date.parse(today) - Date.parse(String(x.reported_at).slice(0, 10))) / 86400000); return days > 7; }).length;


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
  const legacyOutTarget = indicatorKpi.outTarget; const indicatorTrend = indicatorKpi.trend;

  const monitoring = ((monitoringRes.data ?? []) as any[]).filter((x: any) => activeRecordIds.has(x.record_id));
  const roundIds = monitoring.map((x: any) => x.id);
  const responsesRes = roundIds.length ? await supabase.from("checklist_responses").select("monitoring_round_id,result_status").in("monitoring_round_id", roundIds) : { data: [] as any[], error: null };
  const responseMap = new Map<string, { pass: number; fail: number }>();
  for (const x of (responsesRes.data ?? []) as any[]) { const a = responseMap.get(x.monitoring_round_id) ?? { pass: 0, fail: 0 }; if (String(x.result_status).toUpperCase() === "PASS") a.pass++; if (String(x.result_status).toUpperCase() === "FAIL") a.fail++; responseMap.set(x.monitoring_round_id, a); }
  const deptAgg = new Map<string, { pass: number; fail: number }>();
  for (const r of monitoring) { const a = responseMap.get(r.id) ?? { pass: 0, fail: 0 }; const key = r.target_department_id || "none"; const d = deptAgg.get(key) ?? { pass: 0, fail: 0 }; d.pass += a.pass; d.fail += a.fail; deptAgg.set(key, d); }
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
      .qcc-dashboard .kpi-icon{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center}
      .qcc-dashboard .kpi-icon.blue{background:#dbeafe;color:#2563eb}.qcc-dashboard .kpi-icon.green{background:#dcfce7;color:#16a34a}.qcc-dashboard .kpi-icon.amber{background:#fef3c7;color:#b45309}.qcc-dashboard .kpi-icon.red{background:#fee2e2;color:#dc2626}.qcc-dashboard .kpi-icon.purple{background:#ede9fe;color:#7c3aed}
      .qcc-dashboard .kpi-title{font-size:12.5px;color:#475569;font-weight:600;margin-top:2px}
      .qcc-dashboard .kpi-value{font-size:26px;font-weight:800;color:#0f172a}
      .qcc-dashboard .hero-banner{position:relative;overflow:hidden;background:linear-gradient(120deg,#1450c9,#2f7bf0 65%,#38bdf8);border-radius:16px;padding:22px 26px;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:16px}
      .qcc-dashboard .hero-banner-decor{position:absolute;inset:0;pointer-events:none;background:radial-gradient(280px 280px at 92% -10%,rgba(255,255,255,.16),transparent 70%),radial-gradient(220px 220px at 100% 100%,rgba(255,255,255,.1),transparent 70%)}
      .qcc-dashboard .hero-banner h2{position:relative;margin:0;font-size:19px}
      .qcc-dashboard .hero-banner p{position:relative;margin:6px 0 0;font-size:12.5px;color:#dbeafe;max-width:560px}
      .qcc-dashboard .hero-banner-icon{position:relative;flex:0 0 auto;width:56px;height:56px;border-radius:16px;background:rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center}
      .qcc-dashboard .quick-links{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:16px}
      .qcc-dashboard .quick-link{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;padding:12px 6px;border-radius:12px;color:#334155;font-size:11px;font-weight:700}
      .qcc-dashboard .quick-link:hover{background:#f8fafc}
      .qcc-dashboard .quick-link-icon{width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center}
      @media(max-width:1100px){.qcc-dashboard .quick-links{grid-template-columns:repeat(4,1fr)}}
      @media(max-width:640px){.qcc-dashboard .hero-banner{flex-direction:column;align-items:flex-start}.qcc-dashboard .quick-links{grid-template-columns:repeat(2,1fr)}}
      .qcc-dashboard .grid2b{display:grid;grid-template-columns:1.1fr .9fr;gap:14px}
      .qcc-dashboard .grid3b{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
      .qcc-dashboard .capa-stat-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:14px 18px 18px}
      .qcc-dashboard .capa-stat{display:flex;flex-direction:column;align-items:flex-start;gap:8px}
      .qcc-dashboard .capa-stat-icon{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center}
      .qcc-dashboard .capa-stat strong{font-size:20px;display:block}
      .qcc-dashboard .capa-stat span{font-size:10.5px;color:#64748b}
      .qcc-dashboard .compliance-rows{display:grid;gap:12px;padding:14px 18px 18px}
      .qcc-dashboard .compliance-row{display:grid;grid-template-columns:16px 1fr auto;align-items:center;gap:8px;font-size:11.5px;color:#334155}
      .qcc-dashboard .compliance-row .bar-track{grid-column:1/-1;height:6px;background:#eef2f6;border-radius:99px;overflow:hidden}
      .qcc-dashboard .compliance-row .bar-track i{display:block;height:100%;background:#2563eb;border-radius:99px}
      @media(max-width:1100px){.qcc-dashboard .grid2b,.qcc-dashboard .grid3b{grid-template-columns:1fr}}
      .qcc-dashboard .kpi-trend{font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;white-space:nowrap}
      .qcc-dashboard .kpi-trend.up{color:#16a34a;background:#eafaf0}.qcc-dashboard .kpi-trend.down{color:#dc2626;background:#fef2f2}.qcc-dashboard .kpi-trend.flat{color:#94a3b8;background:#f1f5f9}
      .qcc-dashboard .chart-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .qcc-dashboard .range-toggle{display:flex;gap:2px;background:#f1f5f9;border-radius:9px;padding:2px}
      .qcc-dashboard .range-toggle a{padding:6px 12px;border-radius:7px;font-size:12px;font-weight:700;color:#64748b}
      .qcc-dashboard .range-toggle a.active{background:#2563eb;color:#fff}
      .qcc-dashboard .grid2{display:grid;grid-template-columns:1.3fr .9fr;gap:14px}
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
      .qcc-dashboard .alerts{display:grid;gap:10px;padding:8px 16px 16px}
      .qcc-dashboard .alert-row{display:grid;grid-template-columns:auto 1fr auto auto;gap:12px;align-items:center;border:1px solid #eef2f7;border-radius:12px;padding:12px}
      .qcc-dashboard .alert-icon{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex:0 0 34px}
      .qcc-dashboard .alert-icon.red{background:#fef2f2;color:#dc2626}.qcc-dashboard .alert-icon.amber{background:#fffbeb;color:#d97706}.qcc-dashboard .alert-icon.purple{background:#f5f3ff;color:#7c3aed}.qcc-dashboard .alert-icon.blue{background:#eff6ff;color:#2563eb}
      .qcc-dashboard .alert-row strong{display:block;font-size:12.5px}
      .qcc-dashboard .alert-row small{color:#94a3b8;font-size:11px}
      .qcc-dashboard .alert-when{font-size:11px;color:#94a3b8;white-space:nowrap}
      @media(max-width:1100px){.qcc-dashboard .kpis{grid-template-columns:repeat(2,1fr)}.qcc-dashboard .grid2{grid-template-columns:1fr}}
      .qcc-dashboard .qcc-legacy-divider{display:flex;align-items:center;gap:14px;margin:8px 0 2px;color:#94a3b8;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
      .qcc-dashboard .qcc-legacy-divider:before,.qcc-dashboard .qcc-legacy-divider:after{content:"";flex:1;height:1px;background:#e5eaf2}
      .qcc-dashboard .legacy-grid3{display:grid;grid-template-columns:1.15fr .85fr;gap:14px}
      @media(max-width:920px){.qcc-dashboard .legacy-grid3{grid-template-columns:1fr}}
    `}</style>

    <div className="breadcrumb"><Link href="/dashboard">Tổng quan</Link></div>
    <div className="page-header-row">
      <div className="title-with-icon">
        <span className="icon-badge"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1" /></svg></span>
        <div><PageHeader title="Trung tâm Điều hành Chất lượng" description="Theo dõi, phân tích và quản lý tổng thể các hoạt động chất lượng, an toàn người bệnh" /></div>
      </div>
      <form className="scope-controls" method="get">
        <input type="date" name="from" defaultValue={from} max={today} className="button secondary" title="Từ ngày" />
        <input type="date" name="asOf" defaultValue={today} max={todayHcm()} className="button secondary" title="Đến ngày" />
        {isHospitalScope ? <select name="dept" defaultValue={selectedDept} className="button secondary"><option value="">Toàn bệnh viện</option>{((departmentsRes.data ?? []) as any[]).map((d: any) => <option key={d.id} value={d.id}>{d.short_name || d.name}</option>)}</select> : <span className="button secondary" style={{ pointerEvents: "none" }}>{user.primaryDepartmentName || "Phạm vi được phân công"}</span>}
        <button type="submit" className="button primary">Áp dụng</button>
      </form>
    </div>

    {firstError ? <div className="alert error">Một phần dữ liệu chưa tải được: {firstError.message}</div> : null}

    <div className="hero-banner"><div className="hero-banner-decor" aria-hidden="true"></div><div><h2>Xin chào, {user.fullName || (user.email ? user.email.split("@")[0] : "bạn")}!</h2><p>Cùng QARICA xây dựng môi trường y tế an toàn, chất lượng và bền vững.</p></div><span className="hero-banner-icon" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg></span></div>

    <section className="kpis">
      <article className="kpi-card"><div className="kpi-card-top"><span className="kpi-icon blue"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></span><span className={`kpi-trend ${pctChange(thisMonthNew, lastMonthNew).tone}`}>{pctChange(thisMonthNew, lastMonthNew).tone === "up" ? "▲" : pctChange(thisMonthNew, lastMonthNew).tone === "down" ? "▼" : ""} {pctChange(thisMonthNew, lastMonthNew).tone === "flat" ? "0%" : `${Math.abs(Math.round(((thisMonthNew - lastMonthNew) / (lastMonthNew || 1)) * 100))}%`}</span></div><div className="kpi-value">{thisMonthNew}</div><div className="kpi-title">Sự cố mới</div></article>
      <article className="kpi-card"><div className="kpi-card-top"><span className="kpi-icon green"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span><span className={`kpi-trend ${pctChange(investigating, investigatingLastMonth).tone}`}>{pctChange(investigating, investigatingLastMonth).tone === "up" ? "▲" : pctChange(investigating, investigatingLastMonth).tone === "down" ? "▼" : ""} {pctChange(investigating, investigatingLastMonth).tone === "flat" ? "0%" : `${Math.abs(Math.round(((investigating - investigatingLastMonth) / (investigatingLastMonth || 1)) * 100))}%`}</span></div><div className="kpi-value">{investigating}</div><div className="kpi-title">Đang phân tích RCA</div></article>
      <article className="kpi-card"><div className="kpi-card-top"><span className="kpi-icon amber"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></span><span className={`kpi-trend ${pctChange(capaOverdue.length, capaOverdueLastMonth).tone}`}>{pctChange(capaOverdue.length, capaOverdueLastMonth).tone === "up" ? "▲" : pctChange(capaOverdue.length, capaOverdueLastMonth).tone === "down" ? "▼" : ""} {pctChange(capaOverdue.length, capaOverdueLastMonth).tone === "flat" ? "0%" : `${Math.abs(Math.round(((capaOverdue.length - capaOverdueLastMonth) / (capaOverdueLastMonth || 1)) * 100))}%`}</span></div><div className="kpi-value">{capaOverdue.length}</div><div className="kpi-title">CAPA quá hạn</div></article>
      <article className="kpi-card"><div className="kpi-card-top"><span className="kpi-icon red"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg></span><span className="kpi-trend flat">0%</span></div><div className="kpi-value">{highRiskCount}</div><div className="kpi-title">Rủi ro mức cao</div></article>
      <article className="kpi-card"><div className="kpi-card-top"><span className="kpi-icon purple"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></span><span className={`kpi-trend ${pctChange(auditInProgress, auditInProgressLastMonth).tone}`}>{pctChange(auditInProgress, auditInProgressLastMonth).tone === "up" ? "▲" : pctChange(auditInProgress, auditInProgressLastMonth).tone === "down" ? "▼" : ""} {pctChange(auditInProgress, auditInProgressLastMonth).tone === "flat" ? "0%" : `${Math.abs(Math.round(((auditInProgress - auditInProgressLastMonth) / (auditInProgressLastMonth || 1)) * 100))}%`}</span></div><div className="kpi-value">{auditInProgress}</div><div className="kpi-title">Audit đang thực hiện</div></article>
    </section>

    <section className="grid2">
      <article className="panel"><div className="head"><div><h2>Xu hướng sự cố y khoa</h2><p>Số lượng sự cố theo {RANGE_LABEL[range].toLowerCase()} và theo mức độ tổn hại (taxonomy thật của hệ thống).</p></div>
        <div className="chart-toolbar"><div className="range-toggle">{(["week","month","quarter"] as const).map((r) => <Link key={r} href={`?${new URLSearchParams({ ...(from?{from}:{}) , asOf: today, ...(selectedDept?{dept:selectedDept}:{}), range: r }).toString()}`} className={range === r ? "active" : ""}>{RANGE_LABEL[r]}</Link>)}</div></div>
        </div>
        <div className="stacked-trend-legend"><span><i style={{ background: "#3b82f6" }} />Không nghiêm trọng</span><span><i style={{ background: "#f59e0b" }} />Nghiêm trọng</span><span><i style={{ background: "#ef4444" }} />Rất nghiêm trọng</span></div>
        <div className="stacked-trend"><div className="stacked-bars">{trendRows.map((r) => <div className="stacked-bar-col" key={r.month}><div className="stacked-bar" style={{ height: `${Math.max(4, (r.total / trendMax) * 160)}px` }}>{r.veryHigh ? <span className="stacked-bar-seg" style={{ background: "#ef4444", height: `${(r.veryHigh / Math.max(1, r.total)) * 100}%` }} /> : null}{r.high ? <span className="stacked-bar-seg" style={{ background: "#f59e0b", height: `${(r.high / Math.max(1, r.total)) * 100}%` }} /> : null}{r.low ? <span className="stacked-bar-seg" style={{ background: "#3b82f6", height: `${(r.low / Math.max(1, r.total)) * 100}%` }} /> : null}</div><span className="stacked-bar-label">{bucketLabel(r.month)}</span></div>)}</div></div>
      </article>
      <article className="panel"><div className="head"><h2>Tình trạng sự cố</h2><p>Phân bố theo trạng thái xử lý hiện tại.</p></div>{incidentStatusTotal ? <TqmDonut value={incidentStatusTotal} label="Tổng số" segments={[{ label: "Đã xử lý", value: incidentStatusDone, tone: "green" as const }, { label: "Đang xử lý", value: incidentStatusInProgress, tone: "blue" as const }, { label: "Mới ghi nhận", value: incidentStatusNew, tone: "amber" as const }, { label: "Quá hạn", value: incidentStatusOverdue, tone: "red" as const }].filter((s) => s.value > 0)} /> : <div className="empty-state">Chưa có sự cố được ghi nhận.</div>}</article>
    </section>
    <section className="grid2b">
      <article className="panel"><div className="head"><h2>Tình trạng CAPA</h2><Link className="button tertiary small" href="/capa">Xem chi tiết →</Link></div>
        <div className="capa-stat-row">
          <div className="capa-stat"><span className="capa-stat-icon" style={{background:"#dbeafe",color:"#2563eb"}}><Icon name="folder-check" size={16}/></span><strong>{capaByStatus.NOT_STARTED}</strong><span>Chưa bắt đầu</span></div>
          <div className="capa-stat"><span className="capa-stat-icon" style={{background:"#fef3c7",color:"#b45309"}}><Icon name="workflow" size={16}/></span><strong>{capaByStatus.IN_PROGRESS}</strong><span>Đang triển khai</span></div>
          <div className="capa-stat"><span className="capa-stat-icon" style={{background:"#dcfce7",color:"#16a34a"}}><Icon name="badge-check" size={16}/></span><strong>{capaByStatus.DONE}</strong><span>Đã hiệu lực</span></div>
          <div className="capa-stat"><span className="capa-stat-icon" style={{background:"#fee2e2",color:"#dc2626"}}><Icon name="triangle-alert" size={16}/></span><strong>{capaByStatus.OVERDUE}</strong><span>Quá hạn</span></div>
        </div>
      </article>
      <article className="panel"><div className="head"><h2>Hoạt động Audit</h2><Link className="button tertiary small" href="/audits">Xem chi tiết →</Link></div>{auditActive.length ? <TqmDonut value={auditActive.length ? Math.round((auditDone/auditActive.length)*100) : 0} label={`${auditDone}/${auditActive.length}`} segments={[{ label: "Đã hoàn thành", value: auditDone, tone: "green" as const }, { label: "Đang thực hiện", value: auditInProgress, tone: "blue" as const }, { label: "Chưa bắt đầu", value: auditNotStarted, tone: "slate" as const }].filter((s) => s.value > 0)} /> : <div className="empty-state">Chưa có Audit trong năm.</div>}</article>
    </section>

    <section className="grid3b">
      <article className="panel"><div className="head"><h2>Tình trạng theo lĩnh vực</h2><p>Theo taxonomy Lĩnh vực chất lượng &amp; an toàn dùng chung.</p></div>{domainSegments.length ? <TqmHorizontalBars rows={domainSegments.map((s) => ({ label: s.label, value: s.value, tone: s.tone }))} /> : <div className="empty-state">Chưa có hồ sơ được gắn lĩnh vực.</div>}</article>
      <article className="panel"><div className="head"><h2>Chỉ số tuân thủ &amp; dữ liệu điều hành</h2><p>Độ phủ metadata phục vụ kiểm soát.</p></div>
        <div className="compliance-rows">
          <div className="compliance-row"><Icon name="users" size={14}/><span>Có người phụ trách</span><b>{ownerCoveragePct}%</b><div className="bar-track"><i style={{width:`${ownerCoveragePct}%`}}/></div></div>
          <div className="compliance-row"><Icon name="building-2" size={14}/><span>Có khoa/phòng</span><b>{deptCoveragePct}%</b><div className="bar-track"><i style={{width:`${deptCoveragePct}%`}}/></div></div>
        </div>
      </article>
      <article className="panel"><div className="head"><h2>Cảnh báo &amp; công việc cần chú ý</h2><Link className="button tertiary small" href="/tasks">Xem tất cả →</Link></div>
        <div className="alerts">{alerts.length === 0 ? <div className="empty-state">Không có cảnh báo nào đang mở.</div> : alerts.map((a, i) => <Link href={a.href} className="alert-row" key={i}><span className={`alert-icon ${a.tone}`}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /></svg></span><span><strong>{a.title}</strong><small>{a.sub}</small></span><span className="alert-when">{a.when}</span><span>→</span></Link>)}</div>
      </article>
    </section>


    <div className="qcc-legacy-divider"><span>Kế hoạch, giám sát &amp; cải tiến chất lượng</span></div>
    <TqmSmartCommandCenter year={year} />
    <TqmPriorityBoard serious={legacySeriousOpen} overdueFindings={legacyOverdueFindings} capaDue={legacyCapaDue} outTarget={legacyOutTarget} planOverdue={planOverdue} />
    <TqmInterventionLoop openFindings={legacyFindings.length} overdueFindings={legacyOverdueFindings} capaDue={legacyCapaDue} projectPct={projectPct} />
    <section className="grid2"><article className="panel"><div className="head"><h2>Xu hướng chỉ số đạt mục tiêu 12 tháng</h2><p>Tỷ lệ MEETS_TARGET trong các kỳ VERIFIED/LOCKED đã có kết luận mục tiêu.</p></div><TqmTrend points={indicatorTrend} /></article><article className="panel"><div className="head"><h2>Giám sát theo khoa/phòng</h2><p>Đơn vị có tỷ lệ mục đạt thấp được đưa lên trước.</p></div>{deptBars.length ? <TqmHorizontalBars rows={deptBars} max={100} /> : <div className="empty-state">Chưa có dữ liệu giám sát đủ để so sánh.</div>}</article></section>

    <section className="legacy-grid3" style={{gridTemplateColumns:".7fr 1.3fr"}}><article className="panel"><div className="head"><h2>Tiến độ kế hoạch chất lượng năm</h2><p>Từ Action thực tế của các kế hoạch.</p></div><TqmDonut value={planPct} label="Hoàn thành" segments={[{ label: "Đã hoàn thành", value: planDone, tone: "brand" }, { label: "Còn lại", value: Math.max(0, planReq - planDone), tone: "blue" }, { label: "Quá hạn", value: planOverdue, tone: "red" }]} /></article><article className="panel"><div className="head"><h2>Gantt đề án cải tiến trọng tâm</h2><p>Thời gian và tiến độ lấy từ dữ liệu đề án/Action thật.</p></div>{ganttRows.length ? <TqmGantt year={year} rows={ganttRows} /> : <div className="empty-state">Chưa đủ mốc thời gian đề án để dựng Gantt.</div>}</article></section>

    <section className="legacy-grid3"><article className="panel"><div className="head"><h2>Điểm nóng cần chú ý</h2><p>Chỉ giữ các vấn đề quản trị cấp bệnh viện.</p></div><div className="table-wrap"><table><thead><tr><th>#</th><th>Nội dung</th><th>Số lượng</th><th>Trạng thái</th></tr></thead><tbody>{legacyHotspots.map((x,i) => <tr key={x.label}><td>{i+1}</td><td><Link className="table-link" href={x.href}>{x.label}</Link></td><td><b>{x.value}</b></td><td><span className={`status-badge ${x.tone==="red"?"danger":"warning"}`}>{x.tone==="red"?"Quá hạn":"Cần theo dõi"}</span></td></tr>)}</tbody></table></div></article><article className="panel"><div className="head"><h2>Truy cập nhanh</h2></div><div className="quick-links">
      <Link className="quick-link" href="/incidents"><span className="quick-link-icon" style={{background:"#fee2e2",color:"#dc2626"}}><Icon name="shield-alert" size={18}/></span>Sự cố</Link>
      <Link className="quick-link" href="/capa"><span className="quick-link-icon" style={{background:"#ede9fe",color:"#7c3aed"}}><Icon name="workflow" size={18}/></span>CAPA</Link>
      <Link className="quick-link" href="/risks"><span className="quick-link-icon" style={{background:"#fef3c7",color:"#b45309"}}><Icon name="triangle-alert" size={18}/></span>Rủi ro</Link>
      <Link className="quick-link" href="/audits"><span className="quick-link-icon" style={{background:"#dbeafe",color:"#2563eb"}}><Icon name="search-check" size={18}/></span>Audit</Link>
      <Link className="quick-link" href="/indicators"><span className="quick-link-icon" style={{background:"#dcfce7",color:"#16a34a"}}><Icon name="gauge" size={18}/></span>Chỉ số</Link>
      <Link className="quick-link" href="/plans"><span className="quick-link-icon" style={{background:"#dbeafe",color:"#2563eb"}}><Icon name="calendar-range" size={18}/></span>Kế hoạch</Link>
      <Link className="quick-link" href="/assessments"><span className="quick-link-icon" style={{background:"#dcfce7",color:"#16a34a"}}><Icon name="badge-check" size={18}/></span>Đánh giá</Link>
      <Link className="quick-link" href="/evidence"><span className="quick-link-icon" style={{background:"#ede9fe",color:"#7c3aed"}}><Icon name="folder-check" size={18}/></span>Minh chứng</Link>
    </div></article></section>
  </div>;
}
