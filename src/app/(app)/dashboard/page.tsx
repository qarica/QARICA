import { KpiCard, type KpiTrend } from "@/components/kpi-card";
import { AlertStrip } from "@/components/alert-strip";
import { TQM_CHART_CSS } from "@/components/tqm-charts";
import { redirect } from "next/navigation";
import { hasPermission, requireUserContext } from "@/lib/auth";
import { visibleNavGroups } from "@/lib/navigation";
import { buildQualityAlertItems } from "@/lib/quality-alert-strip";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";

import { VnDateInput } from "@/components/vn-date-input";
const CLOSED = new Set(["CANCELLED", "ARCHIVED", "INACTIVE", "RETIRED"]);

function todayHcm() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()); }
// Lời chào cá nhân hoá đầu Dashboard, đúng tinh thần "Chào buổi sáng, Emily"
// trong ảnh tham khảo Oryvia — là tiêu đề CHÍNH (h1) của trang, thay cho
// "Trung tâm Điều hành Chất lượng" (chuyển xuống dòng phụ). 2026-11-14:
// người dùng xác nhận đổi hướng so với quyết định cũ (từng xoá hẳn banner
// chào hỏi trước đó vì "không thêm thông tin, chỉ trang trí thừa" —
// xem src/lib/ui-consistency-fixes.test.ts) — lần này lời chào THAY h1,
// không phải banner trang trí thêm bên cạnh h1 cũ, nên không lặp lại đúng
// vấn đề đã bị phản ánh trước đó.
function greetingParts(fullName?: string | null) {
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Ho_Chi_Minh", hour: "numeric", hour12: false }).format(now));
  const greeting = hour < 11 ? "Chào buổi sáng" : hour < 14 ? "Chào buổi trưa" : hour < 18 ? "Chào buổi chiều" : "Chào buổi tối";
  const dateLabel = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "numeric", month: "long" }).format(now);
  const givenName = (fullName || "").trim().split(/\s+/).filter(Boolean).pop();
  return { heading: `${greeting}${givenName ? `, ${givenName}` : ""}`, dateLabel };
}
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
function pctChange(current: number, previous: number): { text: string; tone: "up" | "down" | "flat" } {
  if (!previous) { if (current > 0) return { text: `+${current} so với tháng trước`, tone: "up" }; return { text: "Không thay đổi", tone: "flat" }; }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { text: "Không thay đổi", tone: "flat" };
  return { text: `${pct > 0 ? "+" : ""}${pct}% so với tháng trước`, tone: pct > 0 ? "up" : "down" };
}
// Badge ngắn cho KpiCard (chỉ hiện %, không hiện câu đầy đủ của pctChange —
// giữ đúng nội dung hiển thị cũ trước khi có KpiCard, chỉ gom lại 1 hàm
// dùng chung thay vì lặp lại ternary này 4 lần trong JSX).
function trendBadge(current: number, previous: number): KpiTrend {
  const { tone } = pctChange(current, previous);
  const text = tone === "flat" ? "0%" : `${Math.abs(Math.round(((current - previous) / (previous || 1)) * 100))}%`;
  return { tone, text };
}
const RISK_MED = new Set(["MEDIUM", "MODERATE"]);
const RISK_LOW = new Set(["LOW"]);
function riskTier(level: string | null | undefined) { const v = String(level || "").toUpperCase(); if (["VERY_HIGH", "CRITICAL", "EXTREME"].includes(v)) return "RAT_CAO"; if (v === "HIGH") return "CAO"; if (RISK_MED.has(v)) return "TRUNG_BINH"; if (RISK_LOW.has(v)) return "THAP"; return null; }

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ asOf?: string; from?: string; dept?: string; range?: string }> }) {
  const { user } = await requireUserContext();
  // Trang đích sau đăng nhập, cũng là nơi mọi trang bị từ chối quyền chuyển về (/dashboard?forbidden=1). Người dùng không có
  // quyền xem Tổng quan (vd. thủ kho chỉ có menu Kho) luôn được đưa tới menu đầu tiên họ được phép, không bao giờ thấy số liệu
  // của các module khác. Menu và trang dùng chung một quyền nên trang đích luôn truy cập được (không tạo vòng lặp).
  if (!hasPermission(user, "dashboard.view")) {
    const landing = visibleNavGroups(user).flatMap((g) => g.children)[0]?.href;
    if (landing && landing !== "/dashboard") redirect(landing);
  }
  const greeting = greetingParts(user.fullName);
  const year = await getWorkYear();
  const supabase = await createClient();
  const query = await searchParams;
  const requestedAsOf = String(query.asOf || "").trim();
  const today = /^\d{4}-\d{2}-\d{2}$/.test(requestedAsOf) && requestedAsOf <= todayHcm() ? requestedAsOf : todayHcm();
  const defaultFrom = addMonths(today.slice(0, 7), -8) + "-01";
  const requestedFrom = String(query.from || "").trim();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(requestedFrom) && requestedFrom <= today ? requestedFrom : defaultFrom;
  const isHospitalScope = user.scopeTypes.includes("HOSPITAL");
  const selectedDept = isHospitalScope ? String(query.dept || "").trim() : "";
  const months = monthsBetween(from.slice(0, 7), today.slice(0, 7));

  // Báo cáo thực tế: "Dashboard thiếu văn bản cần xem xét lại" — Kiểm soát
  // tài liệu (document_publications) đã có review_date + badge "Quá hạn rà
  // soát" ngay trong trang riêng, nhưng không hề xuất hiện ở Dashboard tổng
  // (Cảnh báo & công việc cần chú ý) như CAPA quá hạn/chỉ số vượt ngưỡng —
  // không liên quan work_year/records nên truy vấn độc lập, không qua
  // recordIdList.
  const [recordsRes, docPublicationsRes] = await Promise.all([
    supabase.from("records").select("id,record_type,record_code,title,work_year,lifecycle_status,owner_department_id").eq("work_year",year),
    supabase.from("document_publications").select("id,review_date,drafting_department_id").eq("stage","PUBLISHED"),
  ]);
  const records = ((recordsRes.data ?? []) as any[]).filter((r:any)=>!CLOSED.has(r.lifecycle_status)&&(!selectedDept||r.owner_department_id===selectedDept));
  const recordIdList=records.map((r:any)=>r.id).filter(Boolean);
  const incidentRecordIds = new Set(records.filter((r: any) => r.record_type === "INCIDENT").map((r: any) => r.id));
  const docReviewOverdue = ((docPublicationsRes.data ?? []) as any[]).filter((d: any) => d.review_date && d.review_date < today && (!selectedDept || d.drafting_department_id === selectedDept)).length;

  // Tự rà lại sau phản hồi "rà chưa sát" (lỗi KPI "Việc của tôi" bỏ sót note
  // cá nhân): kiểm tra cùng lớp lỗi ở Dashboard — risks và audits là 2 nguồn
  // DUY NHẤT trong Promise.all này không lọc theo recordIdList (năm công
  // tác + khoa/phòng đã chọn), khác hẳn incidents/capas/indicators ngay bên
  // cạnh. Với audits còn nghiêm trọng hơn: dùng admin (service-role, bỏ qua
  // RLS) trong khi bảng audits đã có policy tổ chức riêng
  // (qlcl_authenticated_select ... record_in_current_organization) — không
  // lọc gì thêm nghĩa là KPI "Audit đang thực hiện"/"Hoạt động Audit" gộp
  // cả audit của MỌI bệnh viện khác dùng chung QARICA, không riêng bệnh
  // viện hiện tại. Đổi về supabase (client RLS đúng tổ chức) + lọc
  // recordIdList như mọi nguồn khác trên trang.
  const [incidentsAllRes, capasRes, risksRes, auditsRes, indicatorsRes] = recordIdList.length ? await Promise.all([
    supabase.from("incidents").select("id,record_id,workflow_status,serious_event_flag,harm_status,reported_at").in("record_id",recordIdList),
    supabase.from("capas").select("id,record_id,workflow_status,effectiveness_due_date,priority").in("record_id",recordIdList),
    supabase.from("risks").select("id,record_id,workflow_status,next_review_date").in("record_id",recordIdList),
    supabase.from("audits").select("id,record_id,workflow_status,start_date,end_date,closed_at,report_finalized_at").in("record_id",recordIdList),
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


  const outTargetIndicators = ((indicatorsRes.data ?? []) as any[]).filter((x: any) => x.result_level === "OUT_OF_TARGET");


  const alertItems = buildQualityAlertItems({
    capaOverdueCount: capaOverdue.length,
    outTargetIndicatorCount: outTargetIndicators.length,
    auditNearDueCount: auditNearDue.length,
    auditNearDueFirstEndDate: auditNearDue[0]?.end_date ?? null,
    investigatingCount: investigating,
    docReviewOverdueCount: docReviewOverdue,
    today,
  });

  const departmentsRes = await supabase.from("departments").select("id,name,short_name").eq("is_active", true).order("name");

  const firstError = [recordsRes, docPublicationsRes, incidentsAllRes, capasRes, risksRes, auditsRes, indicatorsRes, departmentsRes].find((x: any) => x.error)?.error;

  return <div className="page-stack qcc-dashboard dashboard-page">
    <style>{TQM_CHART_CSS + `
      .qcc-dashboard .page-header-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
      .qcc-dashboard .page-header-row .scope-controls{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .qcc-dashboard .scope-controls .button{white-space:nowrap}
      .qcc-dashboard .scope-controls input,.qcc-dashboard .scope-controls select{width:auto;min-height:38px}
      .qcc-dashboard .dashboard-hero-row{margin-bottom:6px}
      .qcc-dashboard .dashboard-hero-copy h1{margin:0;font-size:32px;font-weight:800;line-height:1.15;color:var(--text)}
      .qcc-dashboard .dashboard-hero-copy p{margin:8px 0 0;color:var(--muted);font-size:13px;line-height:1.5;max-width:760px}
      .qcc-dashboard .kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
      .qcc-dashboard .alert-strip-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      .qcc-dashboard .alert-strip-head h2{margin:0;font-size:15px}
      .qcc-dashboard .capa-stat-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:14px 18px 18px}
      .qcc-dashboard .capa-stat{display:flex;flex-direction:column;align-items:flex-start;gap:8px}
      .qcc-dashboard .capa-stat-icon{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center}
      .qcc-dashboard .capa-stat strong{font-size:20px;display:block}
      .qcc-dashboard .capa-stat span{font-size:11px;color:#64748b}
      .qcc-dashboard .compliance-rows{display:grid;gap:12px;padding:14px 18px 18px}
      .qcc-dashboard .compliance-row{display:grid;grid-template-columns:16px 1fr auto;align-items:center;gap:8px;font-size:12px;color:#334155}
      .qcc-dashboard .compliance-row .bar-track{grid-column:1/-1;height:6px;background:#eef2f6;border-radius:99px;overflow:hidden}
      .qcc-dashboard .compliance-row .bar-track i{display:block;height:100%;background:#1D4ED8;border-radius:99px}
      .qcc-dashboard .chart-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .qcc-dashboard .range-toggle{display:flex;gap:2px;background:#f1f5f9;border-radius:9px;padding:2px}
      .qcc-dashboard .range-toggle a{padding:6px 12px;border-radius:7px;font-size:12px;font-weight:700;color:#64748b}
      .qcc-dashboard .range-toggle a.active{background:#1D4ED8;color:#fff}
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
      @media(max-width:1100px){.qcc-dashboard .kpis{grid-template-columns:repeat(2,1fr)}.qcc-dashboard .grid2{grid-template-columns:1fr}}
    `}</style>

    <div className="page-header-row dashboard-hero-row">
      <div className="dashboard-hero-copy">
        <h1>{greeting.heading}</h1>
        <p>{greeting.dateLabel} · Tình hình chất lượng toàn bệnh viện</p>
      </div>
      <form className="scope-controls" method="get">
        <VnDateInput name="from" defaultValue={from} max={today} className="button secondary" title="Từ ngày" />
        <VnDateInput name="asOf" defaultValue={today} max={todayHcm()} className="button secondary" title="Đến ngày" />
        {isHospitalScope ? <select name="dept" defaultValue={selectedDept} className="button secondary"><option value="">Toàn bệnh viện</option>{((departmentsRes.data ?? []) as any[]).map((d: any) => <option key={d.id} value={d.id}>{d.short_name || d.name}</option>)}</select> : null}
        <button type="submit" className="button primary">Áp dụng</button>
      </form>
    </div>


    {firstError ? <div className="alert error">Một phần dữ liệu chưa tải được: {firstError.message}</div> : null}

    <div className="alert-strip-head"><h2>Cảnh báo chất lượng toàn bệnh viện</h2></div>
    <AlertStrip items={alertItems} />

    <section className="kpis">
      <KpiCard icon="file-text" tone="blue" label="Sự cố mới" value={thisMonthNew} trend={trendBadge(thisMonthNew, lastMonthNew)} />
      <KpiCard icon="search" tone="green" label="Đang phân tích RCA" value={investigating} trend={trendBadge(investigating, investigatingLastMonth)} />
      <KpiCard icon="calendar-days" tone="amber" label="CAPA quá hạn" value={capaOverdue.length} trend={trendBadge(capaOverdue.length, capaOverdueLastMonth)} />
      <KpiCard icon="triangle-alert" tone="red" label="Rủi ro mức cao" value={highRiskCount} trend={{ tone: "flat", text: "0%" }} />
      <KpiCard icon="check-square" tone="purple" label="Audit đang thực hiện" value={auditInProgress} trend={trendBadge(auditInProgress, auditInProgressLastMonth)} />
    </section>

  </div>;
}
