import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireUserContext } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { routeForRecord } from "@/lib/record-route";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";

const ACTION_DONE = new Set(["COMPLETED", "CANCELLED", "NOT_APPLICABLE"]);
const RECORD_DONE = new Set(["CANCELLED", "ARCHIVED", "INACTIVE", "RETIRED"]);

type Tone = "danger" | "warning" | "info" | "success";
type AssistantItem = {
  key: string;
  category: string;
  title: string;
  detail: string;
  href: string;
  due?: string | null;
  tone: Tone;
  priority: number;
  mine: boolean;
  nextAction: string;
};

function hcmToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

function dayDiff(date: string | null | undefined, today: string) {
  if (!date) return null;
  const clean = String(date).slice(0, 10);
  const a = Date.parse(`${today}T00:00:00+07:00`);
  const b = Date.parse(`${clean}T00:00:00+07:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

function recordLabel(recordMap: Map<string, any>, recordId: string) {
  const record = recordMap.get(recordId);
  return record ? `${record.record_code} · ${record.title}` : "Hồ sơ QLCL";
}

function dueText(days: number | null, date?: string | null) {
  if (days === null) return date ? `Mốc ${formatDate(date)}` : "Chưa có mốc thời gian";
  if (days < 0) return `Quá hạn ${Math.abs(days)} ngày · ${formatDate(date)}`;
  if (days === 0) return `Đến hạn hôm nay · ${formatDate(date)}`;
  return `Còn ${days} ngày · ${formatDate(date)}`;
}

function itemToneClass(tone: Tone) {
  return `qa-tone ${tone}`;
}

export default async function QualityAssistantPage() {
  const { user } = await requireUserContext();
  const supabase = await createClient();
  const year = await getWorkYear();
  const today = hcmToday();

  const [recordsRes, actionsRes, findingsRes, capasRes, reportsRes, directivesRes, inspectionsRes, risksRes, indicatorsRes, feedbackRes, monitoringRes] = await Promise.all([
    supabase.from("records").select("id,record_type,record_code,title,lifecycle_status,owner_department_id,owner_user_id,updated_at").eq("work_year", year),
    supabase.from("vw_actions_dashboard").select("action_id,record_id,record_code,title,lead_department_id,assignee_user_id,workflow_status,priority,due_date,is_overdue,days_to_due").eq("work_year", year),
    supabase.from("findings").select("id,record_id,workflow_status,due_date,severity"),
    supabase.from("capas").select("id,record_id,workflow_status,effectiveness_due_date,priority"),
    supabase.from("reporting_obligations").select("id,record_id,due_date,workflow_status,recipient_name"),
    supabase.from("external_directives").select("id,record_id,workflow_status,implementation_due_date,report_due_date,priority"),
    supabase.from("inspection_events").select("id,record_id,visit_date,workflow_status,authority"),
    supabase.from("risks").select("id,record_id,workflow_status,next_review_date"),
    supabase.from("indicator_measurements").select("id,record_id,workflow_status,result_level,period_end"),
    supabase.from("feedback_records").select("id,record_id,workflow_status,response_due_at"),
    supabase.from("monitoring_rounds").select("id,record_id,scheduled_date,workflow_status"),
  ]);

  const errors = [recordsRes, actionsRes, findingsRes, capasRes, reportsRes, directivesRes, inspectionsRes, risksRes, indicatorsRes, feedbackRes, monitoringRes]
    .map((result: any) => result.error?.message)
    .filter(Boolean);

  const records = ((recordsRes.data ?? []) as any[]).filter((x) => !RECORD_DONE.has(String(x.lifecycle_status)));
  const recordMap = new Map(records.map((x) => [x.id, x]));
  const visibleIds = new Set(records.map((x) => x.id));
  const isMine = (recordId: string, assigneeUserId?: string | null, departmentId?: string | null) => {
    const record = recordMap.get(recordId);
    return assigneeUserId === user.id || record?.owner_user_id === user.id || (!!user.primaryDepartmentId && (departmentId === user.primaryDepartmentId || record?.owner_department_id === user.primaryDepartmentId));
  };

  const items: AssistantItem[] = [];
  const actions = ((actionsRes.data ?? []) as any[]).filter((x) => visibleIds.has(x.record_id) && !ACTION_DONE.has(String(x.workflow_status)));
  for (const action of actions) {
    const days = dayDiff(action.due_date, today);
    if (days === null || days > 7) continue;
    const overdue = days < 0 || !!action.is_overdue;
    items.push({
      key: `action-${action.action_id}`,
      category: overdue ? "Công việc quá hạn" : "Công việc sắp đến hạn",
      title: action.record_code ? `${action.record_code} · ${action.title}` : recordLabel(recordMap, action.record_id),
      detail: dueText(days, action.due_date),
      href: `/tasks/${action.record_id}`,
      due: action.due_date,
      tone: overdue ? "danger" : days <= 2 ? "warning" : "info",
      priority: overdue ? 100 + Math.min(30, Math.abs(days)) : 70 - days,
      mine: isMine(action.record_id, action.assignee_user_id, action.lead_department_id),
      nextAction: overdue ? "Mở công việc, cập nhật tiến độ hoặc hoàn tất minh chứng ngay." : "Kiểm tra đầu ra cần nộp và hoàn tất trước hạn.",
    });
  }

  for (const finding of ((findingsRes.data ?? []) as any[])) {
    if (!visibleIds.has(finding.record_id) || ["CLOSED", "CANCELLED"].includes(String(finding.workflow_status))) continue;
    const days = dayDiff(finding.due_date, today);
    if (days === null || days > 7) continue;
    items.push({
      key: `finding-${finding.id}`,
      category: days < 0 ? "Finding quá hạn" : "Finding cần xử lý",
      title: recordLabel(recordMap, finding.record_id),
      detail: `${finding.severity || "Chưa phân mức"} · ${dueText(days, finding.due_date)}`,
      href: routeForRecord("FINDING", finding.record_id),
      due: finding.due_date,
      tone: days < 0 ? "danger" : "warning",
      priority: days < 0 ? 96 : 74 - days,
      mine: isMine(finding.record_id),
      nextAction: "Kiểm tra Action khắc phục, minh chứng và kế hoạch recheck trước khi đóng Finding.",
    });
  }

  for (const capa of ((capasRes.data ?? []) as any[])) {
    if (!visibleIds.has(capa.record_id) || ["CLOSED", "CANCELLED"].includes(String(capa.workflow_status))) continue;
    const days = dayDiff(capa.effectiveness_due_date, today);
    if (capa.workflow_status !== "EFFECTIVENESS_REVIEW" && (days === null || days > 7)) continue;
    items.push({
      key: `capa-${capa.id}`,
      category: "CAPA cần đánh giá hiệu lực",
      title: recordLabel(recordMap, capa.record_id),
      detail: capa.effectiveness_due_date ? dueText(days, capa.effectiveness_due_date) : "Đang ở bước đánh giá hiệu lực",
      href: routeForRecord("CAPA", capa.record_id),
      due: capa.effectiveness_due_date,
      tone: days !== null && days < 0 ? "danger" : "warning",
      priority: days !== null && days < 0 ? 94 : 78,
      mine: isMine(capa.record_id),
      nextAction: "Đối chiếu mục tiêu với kết quả thực tế; không đóng CAPA nếu chưa chứng minh hiệu lực.",
    });
  }

  for (const report of ((reportsRes.data ?? []) as any[])) {
    if (!visibleIds.has(report.record_id) || ["COMPLETED", "CANCELLED"].includes(String(report.workflow_status))) continue;
    const days = dayDiff(report.due_date, today);
    if (days === null || days > 7) continue;
    items.push({
      key: `report-${report.id}`,
      category: days < 0 ? "Báo cáo quá hạn" : "Báo cáo sắp đến hạn",
      title: recordLabel(recordMap, report.record_id),
      detail: `${report.recipient_name || "Chưa rõ nơi nhận"} · ${dueText(days, report.due_date)}`,
      href: routeForRecord("REPORT", report.record_id),
      due: report.due_date,
      tone: days < 0 ? "danger" : days <= 2 ? "warning" : "info",
      priority: days < 0 ? 99 : 82 - days,
      mine: isMine(report.record_id),
      nextAction: "Kiểm tra Action, bản dự thảo/minh chứng và thông tin nơi nhận trước khi gửi.",
    });
  }

  for (const directive of ((directivesRes.data ?? []) as any[])) {
    if (!visibleIds.has(directive.record_id) || ["COMPLETED", "CANCELLED"].includes(String(directive.workflow_status))) continue;
    const due = directive.report_due_date || directive.implementation_due_date;
    const days = dayDiff(due, today);
    if (days === null || days > 7) continue;
    items.push({
      key: `directive-${directive.id}`,
      category: days < 0 ? "Chỉ đạo/Yêu cầu quá hạn" : "Chỉ đạo/Yêu cầu đến hạn",
      title: recordLabel(recordMap, directive.record_id),
      detail: dueText(days, due),
      href: routeForRecord("DIRECTIVE", directive.record_id),
      due,
      tone: days < 0 ? "danger" : days <= 2 ? "warning" : "info",
      priority: days < 0 ? 98 : 80 - days,
      mine: isMine(directive.record_id),
      nextAction: "Rà Action đang giao, sản phẩm phải nộp và evidence trước khi xác nhận hoàn tất.",
    });
  }

  for (const risk of ((risksRes.data ?? []) as any[])) {
    if (!visibleIds.has(risk.record_id) || risk.workflow_status === "RETIRED") continue;
    const days = dayDiff(risk.next_review_date, today);
    if (days === null || days > 7) continue;
    items.push({
      key: `risk-${risk.id}`,
      category: "Rủi ro đến kỳ rà soát",
      title: recordLabel(recordMap, risk.record_id),
      detail: dueText(days, risk.next_review_date),
      href: routeForRecord("RISK", risk.record_id),
      due: risk.next_review_date,
      tone: days < 0 ? "danger" : "warning",
      priority: days < 0 ? 93 : 73 - days,
      mine: isMine(risk.record_id),
      nextAction: "Đánh giá lại mức rủi ro theo Risk Matrix và quyết định tiếp tục xử lý/chấp nhận/theo dõi.",
    });
  }

  for (const indicator of ((indicatorsRes.data ?? []) as any[])) {
    if (!visibleIds.has(indicator.record_id)) continue;
    if (indicator.result_level === "OUT_OF_TARGET") {
      items.push({
        key: `indicator-out-${indicator.id}`,
        category: "Chỉ số lệch mục tiêu",
        title: recordLabel(recordMap, indicator.record_id),
        detail: indicator.period_end ? `Kỳ kết thúc ${formatDate(indicator.period_end)}` : "Cần phân tích nguyên nhân",
        href: routeForRecord("INDICATOR_MEASUREMENT", indicator.record_id),
        due: indicator.period_end,
        tone: "warning",
        priority: 84,
        mine: isMine(indicator.record_id),
        nextAction: "Xác minh dữ liệu trước; sau đó phân tích nguyên nhân và chỉ tạo Action/CAPA khi thực sự cần can thiệp.",
      });
    } else if (indicator.workflow_status === "SUBMITTED" && (user.permissions.includes("indicators.verify") || user.permissions.includes("indicators.manage"))) {
      items.push({
        key: `indicator-verify-${indicator.id}`,
        category: "Chỉ số chờ xác minh",
        title: recordLabel(recordMap, indicator.record_id),
        detail: "Dữ liệu đã được gửi và đang chờ người xác minh",
        href: routeForRecord("INDICATOR_MEASUREMENT", indicator.record_id),
        tone: "info",
        priority: 68,
        mine: true,
        nextAction: "Kiểm tra nguồn số liệu và công thức, sau đó xác minh hoặc trả lại kèm lý do.",
      });
    }
  }

  for (const inspection of ((inspectionsRes.data ?? []) as any[])) {
    if (!visibleIds.has(inspection.record_id) || ["COMPLETED", "CANCELLED"].includes(String(inspection.workflow_status))) continue;
    const days = dayDiff(inspection.visit_date, today);
    if (days === null || days < 0 || days > 14) continue;
    items.push({
      key: `inspection-${inspection.id}`,
      category: "Tiếp đoàn sắp tới",
      title: recordLabel(recordMap, inspection.record_id),
      detail: `${inspection.authority || "Đoàn/đơn vị kiểm tra"} · ${dueText(days, inspection.visit_date)}`,
      href: routeForRecord("INSPECTION", inspection.record_id),
      due: inspection.visit_date,
      tone: days <= 3 ? "warning" : "info",
      priority: 76 - Math.min(days, 14),
      mine: isMine(inspection.record_id),
      nextAction: "Mở Inspection Mode, rà checklist countdown, hồ sơ còn thiếu và đầu mối phụ trách trước ngày đoàn đến.",
    });
  }

  for (const feedback of ((feedbackRes.data ?? []) as any[])) {
    if (!visibleIds.has(feedback.record_id) || ["CLOSED", "CANCELLED"].includes(String(feedback.workflow_status))) continue;
    const due = feedback.response_due_at ? String(feedback.response_due_at).slice(0, 10) : null;
    const days = dayDiff(due, today);
    if (days === null || days > 3) continue;
    items.push({
      key: `feedback-${feedback.id}`,
      category: days < 0 ? "Phản ánh quá hạn phản hồi" : "Phản ánh cần phản hồi",
      title: recordLabel(recordMap, feedback.record_id),
      detail: dueText(days, due),
      href: routeForRecord("FEEDBACK", feedback.record_id),
      due,
      tone: days < 0 ? "danger" : "warning",
      priority: days < 0 ? 92 : 79 - days,
      mine: isMine(feedback.record_id),
      nextAction: "Xác minh nội dung và phản hồi đúng hạn; nếu là vấn đề hệ thống, chuyển Finding/Action/CAPA.",
    });
  }

  for (const round of ((monitoringRes.data ?? []) as any[])) {
    if (!visibleIds.has(round.record_id)) continue;
    if (round.workflow_status !== "AWAITING_CONFIRMATION") continue;
    items.push({
      key: `monitoring-${round.id}`,
      category: "Giám sát chờ QLCL xác nhận",
      title: recordLabel(recordMap, round.record_id),
      detail: round.scheduled_date ? `Ngày giám sát ${formatDate(round.scheduled_date)}` : "Kết quả đã gửi xác nhận",
      href: routeForRecord("MONITORING", round.record_id),
      due: round.scheduled_date,
      tone: "info",
      priority: 67,
      mine: isMine(round.record_id),
      nextAction: "Rà kết quả, minh chứng và Finding phát sinh trước khi xác nhận đợt giám sát.",
    });
  }

  items.sort((a, b) => Number(b.mine) - Number(a.mine) || b.priority - a.priority || String(a.due || "9999").localeCompare(String(b.due || "9999")));
  const myItems = items.filter((x) => x.mine);
  const dangerCount = items.filter((x) => x.tone === "danger").length;
  const dueToday = items.filter((x) => dayDiff(x.due, today) === 0).length;
  const nextSeven = items.filter((x) => { const d = dayDiff(x.due, today); return d !== null && d >= 0 && d <= 7; }).length;
  const topItems = items.slice(0, 16);
  const intelligenceLevel =
    dangerCount >= 5 ? "Đỏ · cần điều phối ngay" :
    dangerCount >= 2 ? "Cam · cần ưu tiên trong ngày" :
    topItems.length ? "Vàng · có việc cần theo dõi" :
    "Xanh · chưa có tín hiệu ưu tiên cao";
  const systemPriority = Math.min(100, dangerCount * 18 + dueToday * 10 + Math.min(nextSeven, 10) * 3);

  return <div className="page-stack qa-page">
    <style>{`
      .qa-page{--qa-border:#dfe8ea}.qa-hero{display:grid;grid-template-columns:1.35fr .65fr;gap:14px}.qa-brief,.qa-score{border:1px solid var(--qa-border);border-radius:16px;background:#fff;padding:18px}.qa-brief h2,.qa-score h2{margin:0;font-size:18px}.qa-brief p,.qa-score p{margin:6px 0 0;color:#64748b;font-size:12px;line-height:1.55}.qa-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.qa-kpi{border:1px solid var(--qa-border);border-radius:14px;background:#fff;padding:14px}.qa-kpi strong{display:block;font-size:24px;line-height:1.1}.qa-kpi span{display:block;margin-top:5px;color:#64748b;font-size:10px}.qa-list{display:grid;gap:10px}.qa-card{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:start;border:1px solid var(--qa-border);border-radius:14px;background:#fff;padding:14px}.qa-tone{width:9px;height:42px;border-radius:999px;background:#94a3b8}.qa-tone.danger{background:#dc2626}.qa-tone.warning{background:#d97706}.qa-tone.info{background:#2563eb}.qa-tone.success{background:#16a34a}.qa-card h3{margin:0;font-size:14px}.qa-meta{display:flex;gap:7px;flex-wrap:wrap;margin:5px 0 7px}.qa-pill{font-size:9px;font-weight:850;padding:4px 7px;border-radius:999px;background:#f1f5f9;color:#475569}.qa-pill.mine{background:#dbeafe;color:#1d4ed8}.qa-detail{font-size:11px;color:#64748b;margin:0}.qa-next{font-size:11px;line-height:1.5;margin:7px 0 0}.qa-card .button{white-space:nowrap}.qa-section-head{display:flex;align-items:end;justify-content:space-between;gap:12px}.qa-section-head h2{margin:0;font-size:17px}.qa-section-head p{margin:4px 0 0;color:#64748b;font-size:11px}.qa-empty{padding:24px;text-align:center;border:1px dashed #cbd5e1;border-radius:14px;color:#64748b}.qa-error{border:1px solid #fecaca;background:#fff1f2;color:#991b1b;border-radius:12px;padding:12px;font-size:11px}@media(max-width:850px){.qa-hero,.qa-kpis{grid-template-columns:1fr 1fr}.qa-card{grid-template-columns:auto 1fr}.qa-card .button{grid-column:2;width:100%}}@media(max-width:560px){.qa-hero,.qa-kpis{grid-template-columns:1fr}.qa-card{grid-template-columns:auto 1fr}}
    `}</style>

    <PageHeader eyebrow={`NĂM ${year}`} title="Trợ lý QLCL" description="Bảng điều hành hằng ngày: ưu tiên việc cần xử lý, cảnh báo liên module và gợi ý bước tiếp theo từ dữ liệu thật trong hệ thống." />

    {errors.length ? <div className="qa-error">Một số nguồn dữ liệu chưa đọc được đầy đủ: {errors.slice(0, 2).join(" · ")}. Trợ lý vẫn hiển thị các nguồn còn truy cập được.</div> : null}

    <div className="qa-hero">
      <section className="qa-brief">
        <h2>{myItems.length ? `Có ${myItems.length} việc liên quan trực tiếp đến bạn/đơn vị` : "Không có việc khẩn gắn trực tiếp với bạn"}</h2>
        <p>{dangerCount ? `Toàn phạm vi bạn được xem hiện có ${dangerCount} cảnh báo mức cao. ` : "Hiện chưa có cảnh báo mức cao trong phạm vi bạn được xem. "}Trợ lý chỉ gợi ý từ dữ liệu đã ghi nhận; quyết định nghiệp vụ vẫn thực hiện trong workflow gốc để giữ audit trail.</p>
      </section>
      <section className="qa-score">
        <h2>Ưu tiên hôm nay · {systemPriority}/100</h2>
        <p><strong>{intelligenceLevel}</strong>. {topItems.length ? `Xử lý theo thứ tự: quá hạn → đến hạn → an toàn/rủi ro → xác minh dữ liệu → chuẩn bị mốc sắp tới.` : "Không có tín hiệu cần hành động trong các ngưỡng cảnh báo hiện tại."}</p>
      </section>
    </div>

    <section className="qa-kpis">
      <div className="qa-kpi"><strong>{dangerCount}</strong><span>Cảnh báo mức cao</span></div>
      <div className="qa-kpi"><strong>{dueToday}</strong><span>Đến hạn hôm nay</span></div>
      <div className="qa-kpi"><strong>{nextSeven}</strong><span>Mốc trong 7 ngày</span></div>
      <div className="qa-kpi"><strong>{myItems.length}</strong><span>Liên quan bạn/đơn vị</span></div>
    </section>

    <section className="qa-section-head">
      <div><h2>Việc nên làm tiếp theo</h2><p>Đã xếp ưu tiên theo trách nhiệm của bạn, mức độ khẩn và thời hạn.</p></div>
      <Link href="/dashboard" className="button secondary small">Xem Dashboard tổng hợp</Link>
    </section>

    <section className="qa-list">
      {topItems.map((item) => <article className="qa-card" key={item.key}>
        <span className={itemToneClass(item.tone)} />
        <div>
          <h3>{item.title}</h3>
          <div className="qa-meta"><span className="qa-pill">{item.category}</span>{item.mine ? <span className="qa-pill mine">Của tôi/đơn vị tôi</span> : null}</div>
          <p className="qa-detail">{item.detail}</p>
          <p className="qa-next"><strong>Gợi ý:</strong> {item.nextAction}</p>
        </div>
        <Link href={item.href} className="button primary small">Mở hồ sơ</Link>
      </article>)}
      {!topItems.length ? <div className="qa-empty">Không có cảnh báo hoặc việc đến hạn trong ngưỡng theo dõi hiện tại.</div> : null}
    </section>
  </div>;
}
