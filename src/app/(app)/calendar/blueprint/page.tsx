import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";

type TemplateRow = {
  id: string;
  title: string;
  is_active: boolean;
  recurrence_rule: string | null;
  start_date: string | null;
  end_date: string | null;
  priority: string | null;
  automation_kind: string | null;
  lead_department_id: string | null;
};

const WORKFLOW_ENGINES = [
  {
    title: "Kế hoạch / chương trình",
    source: "work_programs",
    dateRule: "Ngày bắt đầu và ngày kết thúc đã nhập",
    destination: "Calendar + Gantt",
    note: "Mốc một lần của từng kế hoạch; không tự biến thành lịch lặp cho năm sau.",
  },
  {
    title: "Action / nhiệm vụ",
    source: "actions",
    dateRule: "Ngày bắt đầu và hạn hoàn thành",
    destination: "My Work + Calendar + Gantt",
    note: "Owner, deadline, evidence và verification đi theo Action engine chung.",
  },
  {
    title: "Giám sát / bảng kiểm",
    source: "monitoring_rounds",
    dateRule: "Ngày giám sát đã lập",
    destination: "Calendar",
    note: "Phát hiện không đạt đi tiếp sang Finding/Action; không chỉ lưu điểm kiểm tra.",
  },
  {
    title: "Tự đánh giá",
    source: "assessment_rounds",
    dateRule: "Khoảng thời gian đợt đánh giá",
    destination: "Calendar",
    note: "Mốc mở/chốt lấy từ đợt đánh giá thực tế, không hard-code theo năm.",
  },
  {
    title: "Nghĩa vụ báo cáo",
    source: "reporting_obligations",
    dateRule: "Hạn báo cáo đã cấu hình",
    destination: "Calendar",
    note: "Theo dõi đúng hạn/trễ hạn từ dữ liệu nghĩa vụ báo cáo.",
  },
  {
    title: "Kiểm tra ngoài / tiếp đoàn",
    source: "inspection_events",
    dateRule: "Ngày đoàn đến",
    destination: "Inspection Mode + Calendar",
    note: "Đếm ngược và checklist bám ngày sự kiện; finding sau đoàn dùng Finding engine chung.",
  },
  {
    title: "Finding → Action → Evidence → Recheck",
    source: "workflow",
    dateRule: "Theo sự kiện",
    destination: "Finding / Action",
    note: "Không tạo recurrence. Mọi bước phải truy vết được về nguồn và bằng chứng.",
  },
  {
    title: "CAPA → đánh giá hiệu lực",
    source: "workflow",
    dateRule: "Theo Finding/RCA/CAPA",
    destination: "CAPA",
    note: "Hoàn thành Action không đồng nghĩa đóng CAPA; phải có xác nhận hiệu lực.",
  },
] as const;

function cadenceLabel(rule?: string | null) {
  const value = String(rule || "").toUpperCase();
  if (!value) return "Chưa cấu hình";
  const interval = Number(value.match(/INTERVAL=(\d+)/)?.[1] || 1);
  const byDay = value.match(/BYDAY=([A-Z]{2})/)?.[1];
  const byMonthDay = value.match(/BYMONTHDAY=(\d+)/)?.[1];
  const dayMap: Record<string, string> = { MO:"T2", TU:"T3", WE:"T4", TH:"T5", FR:"T6", SA:"T7", SU:"CN" };
  if (value.includes("FREQ=DAILY")) return interval > 1 ? `Mỗi ${interval} ngày` : "Hằng ngày";
  if (value.includes("FREQ=WEEKLY")) return `${interval > 1 ? `Mỗi ${interval} tuần` : "Hằng tuần"}${byDay ? ` · ${dayMap[byDay] || byDay}` : ""}`;
  if (value.includes("FREQ=MONTHLY")) return `${interval > 1 ? `Mỗi ${interval} tháng` : "Hằng tháng"}${byMonthDay ? ` · ngày ${byMonthDay}` : ""}`;
  if (value.includes("FREQ=YEARLY")) return interval > 1 ? `Mỗi ${interval} năm` : "Hằng năm";
  return value;
}

function kindLabel(kind?: string | null) {
  if (kind === "REMINDER") return "Nhắc việc";
  if (kind === "ACTION") return "Sinh Action";
  return kind || "Recurring Work";
}

export default async function CalendarBlueprintPage() {
  const { user } = await requireUserContext();
  if (!hasAnyPermission(user, ["dashboard.view", "plans.view", "plans.manage", "monitoring.view", "reports.view", "inspections.view"])) {
    redirect("/dashboard?forbidden=1");
  }

  const workYear = await getWorkYear();
  const supabase = await createClient();
  const templatesRes = await supabase
    .from("recurring_work_templates")
    .select("id,title,is_active,recurrence_rule,start_date,end_date,priority,automation_kind,lead_department_id")
    .order("is_active", { ascending: false })
    .order("title");

  const templates = (templatesRes.data ?? []) as TemplateRow[];
  const departmentIds = Array.from(new Set(templates.map((row) => row.lead_department_id).filter(Boolean))) as string[];
  const departmentsRes = departmentIds.length
    ? await supabase.from("departments").select("id,name,short_name").in("id", departmentIds)
    : { data: [], error: null } as any;
  const departmentMap = new Map<string,string>(
    (departmentsRes.data ?? []).map((row: any) => [String(row.id), String(row.short_name || row.name)] as [string,string]),
  );

  const active = templates.filter((row) => row.is_active);
  const inactive = templates.filter((row) => !row.is_active);
  const missingStart = active.filter((row) => !row.start_date);
  const actionTemplates = active.filter((row) => row.automation_kind === "ACTION");
  const reminderTemplates = active.filter((row) => row.automation_kind === "REMINDER");
  const firstError = templatesRes.error || departmentsRes.error;

  return <div className="page-stack calendar-blueprint-page">
    <style>{`
      .calendar-blueprint-page{max-width:1450px;margin:0 auto;gap:14px!important}
      .blueprint-principles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .blueprint-principle{padding:13px 14px;border:1px solid #dfe7ec;border-left:4px solid #2563eb;border-radius:12px;background:#fff}
      .blueprint-principle:nth-child(2){border-left-color:#0f766e}.blueprint-principle:nth-child(3){border-left-color:#7c3aed}
      .blueprint-principle strong{display:block;font-size:12px;color:#243247}.blueprint-principle p{margin:5px 0 0;font-size:10.5px;line-height:1.5;color:#64748b}
      .blueprint-section-head{display:flex;justify-content:space-between;align-items:flex-end;gap:10px;padding:14px 15px 10px}
      .blueprint-section-head strong{font-size:14px;color:#243247}.blueprint-section-head span{font-size:10px;color:#64748b}
      .template-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;padding:0 14px 14px}
      .template-card{display:grid;gap:8px;padding:12px 13px;border:1px solid #e2e8f0;border-left:4px solid #0f766e;border-radius:12px;background:#fff}
      .template-card.inactive{border-left-color:#94a3b8;opacity:.76}.template-card.warning{border-left-color:#d69a24}
      .template-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.template-top strong{font-size:12.5px;line-height:1.35;color:#25354a}
      .template-kind{font-size:8.5px;font-weight:850;text-transform:uppercase;letter-spacing:.04em;padding:4px 6px;border-radius:999px;background:#f0fdfa;color:#0f766e;white-space:nowrap}
      .template-meta{display:grid;grid-template-columns:105px minmax(0,1fr);gap:4px 8px;font-size:10px;line-height:1.4}.template-meta span{color:#64748b}.template-meta b{color:#334155;font-weight:750}
      .engine-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;padding:0 14px 14px}
      .engine-card{display:grid;gap:7px;padding:12px 13px;border:1px solid #e2e8f0;border-left:4px solid #2563eb;border-radius:12px;background:#fff}
      .engine-card strong{font-size:12.5px;color:#25354a}.engine-card p{margin:0;font-size:10px;color:#64748b;line-height:1.5}
      .engine-meta{display:grid;grid-template-columns:90px minmax(0,1fr);gap:4px 8px;font-size:9.5px}.engine-meta span{color:#64748b}.engine-meta b{color:#334155}
      .blueprint-rule{padding:12px 14px;border-top:1px solid #eef2f3;background:#f8fafc;color:#475569;font-size:10.5px;line-height:1.5}.blueprint-rule strong{color:#243247}
      @media(max-width:900px){.blueprint-principles,.template-grid,.engine-grid{grid-template-columns:1fr}}
      @media(max-width:760px){.calendar-blueprint-page .kpi-grid{grid-template-columns:1fr 1fr!important}.template-grid,.engine-grid{padding:0 9px 9px}.blueprint-section-head{padding:12px 10px 8px}.template-meta,.engine-meta{grid-template-columns:82px minmax(0,1fr)}}
    `}</style>

    <PageHeader
      eyebrow={`LỊCH & WORKFLOW · NĂM CÔNG TÁC ${workYear}`}
      title="Blueprint lịch vận hành"
      description="Trang kiểm soát kiến trúc lịch theo dữ liệu runtime. QARICA không hard-code kế hoạch, chương trình hay mốc của một năm/tổ chức cụ thể; chỉ hiển thị những gì đã được cấu hình trên hệ thống."
      actions={<div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Link className="button secondary" href="/calendar">Lịch công tác</Link><Link className="button primary" href="/calendar/recurring">Cấu hình Recurring Work →</Link></div>}
    />

    {firstError ? <div className="alert error">Không tải được một phần blueprint runtime: {firstError.message}</div> : null}

    <section className="blueprint-principles">
      <article className="blueprint-principle"><strong>1. Không hard-code theo năm/tổ chức</strong><p>Kế hoạch từng năm chỉ là dữ liệu. Cấu trúc Calendar, Action, Evidence, Finding, CAPA và Recurring Work phải dùng lại cho mọi chu kỳ.</p></article>
      <article className="blueprint-principle"><strong>2. Tần suất không phải ngày</strong><p>“Hằng tuần”, “mỗi quý”, “2 lần/tháng” chỉ là cadence. Hệ thống không tự bịa ngày/thứ khi người dùng chưa cấu hình lịch thực tế.</p></article>
      <article className="blueprint-principle"><strong>3. Một nguồn dữ liệu – nhiều góc nhìn</strong><p>Calendar, Gantt và My Work đọc cùng Plan/Action/Recurring dữ liệu nguồn; không tạo kho lịch song song.</p></article>
    </section>

    <section className="kpi-grid">
      <article className="kpi-card info"><span>Recurring template</span><strong>{templates.length}</strong><small>Tổng cấu hình hiện có</small></article>
      <article className="kpi-card success"><span>Đang hoạt động</span><strong>{active.length}</strong><small>Template đang bật</small></article>
      <article className="kpi-card warning"><span>Thiếu ngày bắt đầu</span><strong>{missingStart.length}</strong><small>Cần cấu hình trước khi vận hành</small></article>
      <article className="kpi-card neutral"><span>Action / Reminder</span><strong>{actionTemplates.length} / {reminderTemplates.length}</strong><small>Hai cơ chế tự động chính</small></article>
    </section>

    <section className="panel">
      <div className="blueprint-section-head">
        <div><strong>1. Recurring Work đang cấu hình</strong><div><span>Dữ liệu thật từ recurring_work_templates</span></div></div>
        <span>{active.length} bật · {inactive.length} ngưng</span>
      </div>
      <div className="template-grid">
        {templates.map((row) => <article className={`template-card ${!row.is_active ? "inactive" : !row.start_date ? "warning" : ""}`} key={row.id}>
          <div className="template-top"><strong>{row.title}</strong><span className="template-kind">{kindLabel(row.automation_kind)}</span></div>
          <div className="template-meta">
            <span>Trạng thái</span><b>{row.is_active ? "Đang bật" : "Đã ngưng"}</b>
            <span>Tần suất</span><b>{cadenceLabel(row.recurrence_rule)}</b>
            <span>Bắt đầu</span><b>{row.start_date || "Chưa cấu hình"}</b>
            <span>Kết thúc</span><b>{row.end_date || "Không giới hạn / chưa cấu hình"}</b>
            <span>Đơn vị</span><b>{row.lead_department_id ? (departmentMap.get(row.lead_department_id) || "Đơn vị đã cấu hình") : "Chưa gán"}</b>
          </div>
        </article>)}
        {!templates.length ? <div className="empty-state">Chưa có Recurring Work. Chỉ tạo template khi đã xác định rõ owner, cadence và ngày bắt đầu thực tế.</div> : null}
      </div>
      <div className="blueprint-rule"><strong>Rule vận hành:</strong> template có cadence nhưng chưa có ngày bắt đầu không được xem là lịch hoàn chỉnh. Việc sinh run/Action phải bám cấu hình thật, không suy diễn từ kế hoạch mẫu.</div>
    </section>

    <section className="panel">
      <div className="blueprint-section-head">
        <div><strong>2. Nguồn dữ liệu đi vào Calendar / Gantt / My Work</strong><div><span>Khung generic dùng cho mọi năm và mọi tổ chức</span></div></div>
        <span>{WORKFLOW_ENGINES.length} engine</span>
      </div>
      <div className="engine-grid">
        {WORKFLOW_ENGINES.map((item) => <article className="engine-card" key={item.title}>
          <strong>{item.title}</strong>
          <div className="engine-meta">
            <span>Nguồn</span><b>{item.source}</b>
            <span>Mốc lịch</span><b>{item.dateRule}</b>
            <span>Hiển thị</span><b>{item.destination}</b>
          </div>
          <p>{item.note}</p>
        </article>)}
      </div>
      <div className="blueprint-rule"><strong>Nguyên tắc truy vết:</strong> kế hoạch hoặc sự kiện chỉ tạo góc nhìn lịch; dữ liệu nghiệp vụ gốc vẫn nằm ở engine tương ứng. Không tạo bản sao “calendar record” chỉ để hiển thị.</div>
    </section>
  </div>;
}
