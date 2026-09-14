import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type SourceKind = "PLAN" | "HANDBOOK" | "QMS";
type ItemKind = "RECURRING" | "MILESTONE" | "WORKFLOW" | "INSPECTION";

type BlueprintItem = {
  id: string;
  title: string;
  cadence: string;
  owner: string;
  output: string;
  source: SourceKind[];
  kind: ItemKind;
  note: string;
  match?: string[];
  href?: string;
};

const SOURCE_META: Record<SourceKind, { label: string; detail: string }> = {
  PLAN: {
    label: "Kế hoạch QLCL 2026 Final",
    detail: "Nguồn chính thức cho mốc, tần suất, chủ trì, sản phẩm và minh chứng năm 2026.",
  },
  HANDBOOK: {
    label: "Sổ tay QLCL",
    detail: "Nguồn vận hành thực tế: công việc ngày/tuần/tháng/quý/6 tháng/năm, tiếp đoàn, owner, deadline, evidence và recheck.",
  },
  QMS: {
    label: "TMMC-GQM-SOP01",
    detail: "Khung kiểm soát kiến trúc: lịch báo cáo, audit/tracer/5S, finding, CAPA, owner, bằng chứng và xác nhận hiệu lực.",
  },
};

const ITEMS: BlueprintItem[] = [
  {
    id: "hh",
    title: "Giám sát tuân thủ vệ sinh tay",
    cadence: "Tuần 1 hằng tháng · từ 10/2026",
    owner: "Kiểm soát nhiễm khuẩn · Tổ QLCL phối hợp",
    output: "Bảng kiểm; cỡ mẫu; tỷ lệ tuân thủ; phản hồi sau giám sát",
    source: ["PLAN", "HANDBOOK", "QMS"],
    kind: "RECURRING",
    note: "Nguồn xác định tuần thực hiện nhưng không khóa thứ cụ thể; phải chọn ngày/thứ vận hành trước khi bật template.",
    match: ["vệ sinh tay"],
  },
  {
    id: "patient-id",
    title: "Giám sát xác định đúng người bệnh và vòng nhận diện",
    cadence: "Tuần 2 hằng tháng · từ 10/2026",
    owner: "Phòng Điều dưỡng · Tổ QLCL phối hợp",
    output: "Bảng kiểm; cỡ mẫu; tỷ lệ tuân thủ; hồ sơ phản hồi",
    source: ["PLAN", "HANDBOOK", "QMS"],
    kind: "RECURRING",
    note: "Không tự gán thứ trong tuần 2 khi nguồn chưa quy định.",
    match: ["đúng người bệnh", "vòng nhận diện"],
  },
  {
    id: "medication",
    title: "Giám sát an toàn sử dụng thuốc và tủ thuốc trực",
    cadence: "Tuần 3 hằng tháng · từ 10/2026",
    owner: "Khoa Dược · Tổ QLCL phối hợp",
    output: "Bảng kiểm; cỡ mẫu; tỷ lệ tuân thủ; hồ sơ phản hồi",
    source: ["PLAN", "HANDBOOK", "QMS"],
    kind: "RECURRING",
    note: "Chọn ngày vận hành thật trước khi sinh Action.",
    match: ["an toàn", "thuốc"],
  },
  {
    id: "clinical-process",
    title: "Giám sát quy trình kỹ thuật, chăm sóc và hướng dẫn chẩn đoán/điều trị",
    cadence: "Tuần 4 hằng tháng · triển khai theo lịch giám sát",
    owner: "Tổ QLCL · khoa/phòng sở hữu quy trình",
    output: "Bảng kiểm; tỷ lệ tuân thủ; phát hiện; hành động khắc phục khi không đạt",
    source: ["PLAN", "HANDBOOK", "QMS"],
    kind: "RECURRING",
    note: "Mỗi phát hiện không đạt phải đi tiếp sang Action/Finding; không chỉ lưu điểm giám sát.",
    match: ["quy trình kỹ thuật"],
  },
  {
    id: "infection-quarter",
    title: "Giám sát nhiễm khuẩn, môi trường và báo cáo về Tổ QLCL",
    cadence: "03 tháng/lần",
    owner: "Tổ Kiểm soát nhiễm khuẩn",
    output: "Kết quả giám sát và xét nghiệm mẫu theo quý gửi Tổ QLCL",
    source: ["PLAN", "HANDBOOK"],
    kind: "RECURRING",
    note: "Nguồn có tần suất nhưng không quy định ngày trong quý; QLCL cần xác nhận ngày chạy.",
    match: ["nhiễm khuẩn", "môi trường"],
  },
  {
    id: "medical-record",
    title: "Kiểm tra hồ sơ bệnh án theo bảng kiểm",
    cadence: "Tối thiểu 02 lần/tháng",
    owner: "Phòng KHTH · phối hợp Tổ QLCL",
    output: "Bảng kiểm; biên bản kiểm tra theo tháng; báo cáo theo khoa; phản hồi",
    source: ["PLAN", "HANDBOOK"],
    kind: "RECURRING",
    note: "Recurring Engine hiện cần cấu hình thành hai lượt/tháng hoặc lấy lịch trực tiếp từ module HSBA; không tự chọn hai ngày.",
    match: ["hồ sơ bệnh án", "bảng kiểm"],
  },
  {
    id: "network",
    title: "Sinh hoạt Mạng lưới Quản lý chất lượng",
    cadence: "Tối thiểu 01 lần/quý",
    owner: "Tổ QLCL · Mạng lưới QLCL",
    output: "Biên bản sinh hoạt; kết luận; đơn vị chịu trách nhiệm; thời hạn hoàn thành",
    source: ["PLAN", "HANDBOOK", "QMS"],
    kind: "RECURRING",
    note: "Chưa có ngày cố định trong quý; chỉ kích hoạt sau khi thống nhất lịch.",
    match: ["mạng lưới", "quản lý chất lượng"],
  },
  {
    id: "5s-1",
    title: "Đánh giá 5S – đợt 1",
    cadence: "Trước 20/11/2026",
    owner: "Tổ QLCL · các khoa/phòng",
    output: "Bảng kiểm 5S đã chấm; kết quả theo đơn vị; ảnh/bằng chứng khi phù hợp",
    source: ["PLAN", "QMS"],
    kind: "MILESTONE",
    note: "Đây là mốc năm 2026, không biến thành recurrence giả nếu chưa có kế hoạch 5S năm tiếp theo.",
    href: "/calendar?month=2026-11",
  },
  {
    id: "5s-2",
    title: "Đánh giá 5S – đợt 2",
    cadence: "Trước 31/12/2026",
    owner: "Tổ QLCL · các khoa/phòng",
    output: "Bảng kiểm 5S đã chấm; kết quả cải thiện; tình trạng duy trì",
    source: ["PLAN", "QMS"],
    kind: "MILESTONE",
    note: "BM-30/QMS yêu cầu gắn bằng chứng, finding và hành động khi có sai lệch.",
    href: "/calendar?month=2026-12",
  },
  {
    id: "council-q3q4",
    title: "Họp Hội đồng QLCL quý III và quý IV",
    cadence: "Trước 30/09/2026 · trước 30/11/2026",
    owner: "Chủ tịch Hội đồng · Tổ QLCL",
    output: "Biên bản họp; kết luận/quyết định; owner; hạn hoàn thành",
    source: ["PLAN", "QMS"],
    kind: "MILESTONE",
    note: "Mốc cụ thể đã được giữ trên Lịch tổng hợp; quyết định sau họp phải sinh Action khi cần.",
    href: "/calendar?month=2026-09",
  },
  {
    id: "finding-recheck",
    title: "Phản hồi phát hiện → khắc phục → tái giám sát",
    cadence: "Theo sự kiện; tái giám sát trong vòng 02 tuần hoặc theo mức độ nguy cơ",
    owner: "Tổ QLCL · khoa/phòng liên quan",
    output: "Finding/Action; minh chứng khắc phục; kết quả tái giám sát",
    source: ["PLAN", "HANDBOOK", "QMS"],
    kind: "WORKFLOW",
    note: "Không tạo recurrence. Luồng chuẩn là Finding → Action → Evidence → Recheck; chỉ CAPA hóa khi nghiêm trọng/lặp lại/hệ thống.",
  },
  {
    id: "inspection",
    title: "Tiếp đoàn / kiểm tra ngoài",
    cadence: "Theo ngày đoàn đến · đếm ngược D-30/D-14/D-7/D-3/D-1/D/D+1/D+7 cấu hình được",
    owner: "Tổ QLCL điều phối · đơn vị sở hữu minh chứng phối hợp",
    output: "Checklist chuẩn bị; Action; evidence; finding sau kiểm tra; recheck",
    source: ["HANDBOOK", "QMS"],
    kind: "INSPECTION",
    note: "Đây là Inspection Mode, không phải lịch định kỳ. Findings sau đoàn phải dùng Finding engine chung, không tạo module tồn tại riêng.",
  },
  {
    id: "capa-effectiveness",
    title: "CAPA và kiểm tra hiệu lực",
    cadence: "Theo Finding/RCA/CAPA; đóng sau khi xác nhận hiệu lực",
    owner: "CAPA Owner · QLCL xác minh theo quyền",
    output: "Root cause; Action; owner; hạn; evidence; verification; effectiveness review",
    source: ["HANDBOOK", "QMS"],
    kind: "WORKFLOW",
    note: "Hoàn thành Action không đồng nghĩa đóng CAPA; phải có bước đánh giá hiệu lực.",
  },
];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase();
}

function matchesTemplate(title: string, keywords: string[]) {
  const haystack = normalize(title);
  return keywords.every((keyword) => haystack.includes(normalize(keyword)));
}

function kindLabel(kind: ItemKind) {
  if (kind === "RECURRING") return "Recurring Work";
  if (kind === "MILESTONE") return "Mốc năm";
  if (kind === "INSPECTION") return "Inspection Mode";
  return "Workflow theo sự kiện";
}

export default async function CalendarBlueprintPage() {
  const { user } = await requireUserContext();
  if (!hasAnyPermission(user, ["dashboard.view", "plans.view", "plans.manage", "monitoring.view", "reports.view", "inspections.view"])) redirect("/dashboard?forbidden=1");

  const supabase = await createClient();
  const templatesRes = await supabase.from("recurring_work_templates").select("id,title,is_active,recurrence_rule,start_date,end_date").order("title");
  const templates = (templatesRes.data ?? []) as any[];
  const recurringItems = ITEMS.filter((item) => item.kind === "RECURRING");
  const configured = recurringItems.filter((item) => item.match && templates.some((template) => matchesTemplate(template.title, item.match!)));
  const milestones = ITEMS.filter((item) => item.kind === "MILESTONE");
  const workflowItems = ITEMS.filter((item) => item.kind === "WORKFLOW" || item.kind === "INSPECTION");

  return <div className="page-stack calendar-blueprint-page">
    <style>{`
      .calendar-blueprint-page{max-width:1450px;margin:0 auto;gap:14px!important}
      .blueprint-source-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.blueprint-source{padding:13px 14px;border:1px solid #dfe7ec;border-left:4px solid #2563eb;border-radius:12px;background:#fff}.blueprint-source:nth-child(2){border-left-color:#0f766e}.blueprint-source:nth-child(3){border-left-color:#7c3aed}.blueprint-source strong{display:block;font-size:12px;color:#243247}.blueprint-source p{margin:5px 0 0;font-size:10.5px;line-height:1.45;color:#64748b}
      .blueprint-section-head{display:flex;justify-content:space-between;align-items:flex-end;gap:10px;padding:14px 15px 10px}.blueprint-section-head strong{font-size:14px;color:#243247}.blueprint-section-head span{font-size:10px;color:#64748b}
      .blueprint-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;padding:0 14px 14px}.blueprint-card{display:grid;gap:8px;padding:12px 13px;border:1px solid #e2e8f0;border-left:4px solid #2563eb;border-radius:12px;background:#fff}.blueprint-card.recurring{border-left-color:#0f766e}.blueprint-card.milestone{border-left-color:#64748b}.blueprint-card.workflow{border-left-color:#7c3aed}.blueprint-card.inspection{border-left-color:#ea580c}.blueprint-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.blueprint-top strong{font-size:12.5px;line-height:1.35;color:#25354a}.blueprint-kind{font-size:8.5px;font-weight:850;text-transform:uppercase;letter-spacing:.04em;padding:4px 6px;border-radius:999px;background:#f1f5f9;color:#64748b;white-space:nowrap}.blueprint-card.recurring .blueprint-kind{background:#f0fdfa;color:#0f766e}.blueprint-card.workflow .blueprint-kind{background:#f5f3ff;color:#6d28d9}.blueprint-card.inspection .blueprint-kind{background:#fff7ed;color:#c2410c}.blueprint-meta{display:grid;grid-template-columns:105px minmax(0,1fr);gap:4px 8px;font-size:10px;line-height:1.4}.blueprint-meta span{color:#64748b}.blueprint-meta b{color:#334155;font-weight:750}.blueprint-note{padding:8px 9px;border-radius:9px;background:#f8fafc;font-size:9.7px;line-height:1.45;color:#64748b}.blueprint-sources{display:flex;gap:5px;flex-wrap:wrap}.blueprint-source-tag{font-size:8.5px;font-weight:800;padding:3px 6px;border-radius:999px;background:#eff6ff;color:#1d4ed8}.blueprint-source-tag.handbook{background:#f0fdfa;color:#0f766e}.blueprint-source-tag.qms{background:#f5f3ff;color:#6d28d9}.blueprint-footer{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}.blueprint-status{display:inline-flex;align-items:center;gap:5px;font-size:9.5px;font-weight:800}.blueprint-status.ok{color:#166534}.blueprint-status.need{color:#9a5b00}.blueprint-status.flow{color:#6d28d9}.blueprint-status i{width:8px;height:8px;border-radius:50%;background:currentColor}.blueprint-actions{display:flex;gap:6px}
      .blueprint-rule{padding:12px 14px;border-top:1px solid #eef2f3;background:#f8fafc;color:#475569;font-size:10.5px;line-height:1.5}.blueprint-rule strong{color:#243247}
      @media(max-width:900px){.blueprint-source-grid,.blueprint-grid{grid-template-columns:1fr}}
      @media(max-width:760px){.calendar-blueprint-page .kpi-grid{grid-template-columns:1fr 1fr!important}.blueprint-grid{padding:0 9px 9px}.blueprint-section-head{padding:12px 10px 8px}.blueprint-meta{grid-template-columns:82px minmax(0,1fr)}.blueprint-top{display:grid}.blueprint-kind{width:max-content}.blueprint-actions{width:100%}.blueprint-actions .button{flex:1;justify-content:center;min-height:39px}}
    `}</style>

    <PageHeader
      eyebrow="LỊCH CÔNG TÁC QLCL · KIỂM SOÁT NGUỒN"
      title="Bộ lịch nền & nguồn nghiệp vụ"
      description="Ma trận kiểm soát để lịch QLCL không trở thành một calendar rời: mỗi mốc hoặc chu kỳ phải truy được về Kế hoạch 2026, Sổ tay QLCL hoặc Khung QMS; nội dung chưa có ngày thật không được tự gán lịch."
      actions={<Link className="button secondary" href="/calendar/recurring">Cấu hình Recurring Work →</Link>}
    />

    {templatesRes.error ? <div className="alert error">Không tải được trạng thái Recurring Work hiện tại: {templatesRes.error.message}</div> : null}

    <section className="blueprint-source-grid">
      {(Object.keys(SOURCE_META) as SourceKind[]).map((key) => <article className="blueprint-source" key={key}><strong>{SOURCE_META[key].label}</strong><p>{SOURCE_META[key].detail}</p></article>)}
    </section>

    <section className="kpi-grid">
      <article className="kpi-card info"><span>Nghĩa vụ định kỳ đã nhận diện</span><strong>{recurringItems.length}</strong><small>Từ nguồn còn truy xuất được</small></article>
      <article className="kpi-card success"><span>Đã có template tương ứng</span><strong>{configured.length}</strong><small>Đối chiếu theo nội dung tên template</small></article>
      <article className="kpi-card warning"><span>Còn cần cấu hình lịch thật</span><strong>{Math.max(0, recurringItems.length - configured.length)}</strong><small>Không tự gán ngày thay người dùng</small></article>
      <article className="kpi-card neutral"><span>Mốc/luồng không phải recurrence</span><strong>{milestones.length + workflowItems.length}</strong><small>Giữ ở Calendar/Workflow/Inspection</small></article>
    </section>

    <section className="panel">
      <div className="blueprint-section-head"><div><strong>1. Công việc thường quy cần Recurring Work</strong><div><span>Owner + lịch thật + deadline + sản phẩm/minh chứng trước khi kích hoạt</span></div></div><span>{configured.length}/{recurringItems.length} đã nhận diện template</span></div>
      <div className="blueprint-grid">
        {recurringItems.map((item) => {
          const template = item.match ? templates.find((row) => matchesTemplate(row.title, item.match!)) : null;
          return <article className="blueprint-card recurring" key={item.id}>
            <div className="blueprint-top"><strong>{item.title}</strong><span className="blueprint-kind">{kindLabel(item.kind)}</span></div>
            <div className="blueprint-meta"><span>Tần suất</span><b>{item.cadence}</b><span>Chủ trì</span><b>{item.owner}</b><span>Sản phẩm</span><b>{item.output}</b></div>
            <div className="blueprint-note">{item.note}</div>
            <div className="blueprint-sources">{item.source.map((source) => <span className={`blueprint-source-tag ${source.toLowerCase()}`} key={source}>{SOURCE_META[source].label}</span>)}</div>
            <div className="blueprint-footer"><span className={`blueprint-status ${template ? "ok" : "need"}`}><i />{template ? `Đã có template${template.is_active ? " đang bật" : " đã ngưng"}` : "Cần cấu hình template"}</span><div className="blueprint-actions"><Link className="button tertiary small" href="/calendar/recurring">{template ? "Kiểm tra template" : "Cấu hình"}</Link></div></div>
          </article>;
        })}
      </div>
      <div className="blueprint-rule"><strong>Rule chống bịa lịch:</strong> “Tuần 1”, “03 tháng/lần”, “tối thiểu 02 lần/tháng” hoặc “01 lần/quý” là tần suất, không phải ngày. Hệ thống chỉ sinh Action sau khi QLCL xác nhận ngày/thứ thực tế và người phụ trách.</div>
    </section>

    <section className="panel">
      <div className="blueprint-section-head"><div><strong>2. Mốc năm 2026 – giữ ở Lịch tổng hợp</strong><div><span>Không chuyển thành recurring template nếu bản chất là mốc một lần của kế hoạch năm</span></div></div><span>{milestones.length} nhóm mốc</span></div>
      <div className="blueprint-grid">
        {milestones.map((item) => <article className="blueprint-card milestone" key={item.id}>
          <div className="blueprint-top"><strong>{item.title}</strong><span className="blueprint-kind">{kindLabel(item.kind)}</span></div>
          <div className="blueprint-meta"><span>Thời điểm</span><b>{item.cadence}</b><span>Chủ trì</span><b>{item.owner}</b><span>Minh chứng</span><b>{item.output}</b></div>
          <div className="blueprint-note">{item.note}</div>
          <div className="blueprint-sources">{item.source.map((source) => <span className={`blueprint-source-tag ${source.toLowerCase()}`} key={source}>{SOURCE_META[source].label}</span>)}</div>
          <div className="blueprint-footer"><span className="blueprint-status ok"><i />Mốc kế hoạch – không auto-repeat</span>{item.href ? <div className="blueprint-actions"><Link className="button tertiary small" href={item.href}>Xem trên lịch</Link></div> : null}</div>
        </article>)}
      </div>
    </section>

    <section className="panel">
      <div className="blueprint-section-head"><div><strong>3. Luồng theo sự kiện – không nhét vào Recurring Work</strong><div><span>Sổ tay và QMS yêu cầu truy vết từ nguồn → hành động → bằng chứng → xác minh</span></div></div><span>{workflowItems.length} luồng</span></div>
      <div className="blueprint-grid">
        {workflowItems.map((item) => <article className={`blueprint-card ${item.kind.toLowerCase()}`} key={item.id}>
          <div className="blueprint-top"><strong>{item.title}</strong><span className="blueprint-kind">{kindLabel(item.kind)}</span></div>
          <div className="blueprint-meta"><span>Kích hoạt</span><b>{item.cadence}</b><span>Owner</span><b>{item.owner}</b><span>Kết quả</span><b>{item.output}</b></div>
          <div className="blueprint-note">{item.note}</div>
          <div className="blueprint-sources">{item.source.map((source) => <span className={`blueprint-source-tag ${source.toLowerCase()}`} key={source}>{SOURCE_META[source].label}</span>)}</div>
          <div className="blueprint-footer"><span className="blueprint-status flow"><i />Đi theo workflow chung, không tạo lịch lặp giả</span></div>
        </article>)}
      </div>
    </section>
  </div>;
}
