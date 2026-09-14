import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireUserContext } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { routeForRecord } from "@/lib/record-route";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";

const TYPE_LABELS: Record<string, string> = {
  ACTION: "Tác vụ / Action",
  PROGRAM: "Kế hoạch",
  DIRECTIVE: "Chỉ đạo / Yêu cầu",
  REPORT: "Báo cáo",
  INSPECTION: "Tiếp đoàn",
  INDICATOR_MEASUREMENT: "Kỳ đo chỉ số",
  MONITORING: "Đợt giám sát",
  FINDING: "Finding",
  INCIDENT: "Sự cố",
  CAPA: "CAPA",
  RISK: "Rủi ro",
  FMEA: "FMEA/HFMEA",
  IMPROVEMENT_PROJECT: "Đề án cải tiến",
  IMPROVEMENT_PROPOSAL: "Đề xuất cải tiến",
  ASSESSMENT: "Tự đánh giá",
  EXTERNAL_ASSESSMENT: "Đánh giá ngoài",
  AUDIT: "Audit / Tracer",
  SAFETY_ALERT: "Bài học / Cảnh báo",
  FEEDBACK: "Phản ánh / Góp ý",
};

type CancelledRecord = {
  id: string;
  record_type: string;
  record_code: string;
  title: string;
  lifecycle_status: string;
  owner_department_id: string | null;
  owner_user_id: string | null;
  updated_at: string | null;
};

export default async function CancelledRecordsPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const { user } = await requireUserContext();
  if (!user.permissions.includes("dashboard.view")) redirect("/dashboard?forbidden=1");

  const year = await getWorkYear();
  const query = await searchParams;
  const q = String(query.q || "").trim().toLocaleLowerCase("vi");
  const type = String(query.type || "").trim();
  const supabase = await createClient();

  const recordsRes = await supabase
    .from("records")
    .select("id,record_type,record_code,title,lifecycle_status,owner_department_id,owner_user_id,updated_at")
    .eq("work_year", year)
    .eq("lifecycle_status", "CANCELLED")
    .order("updated_at", { ascending: false })
    .limit(1000);

  const all = (recordsRes.data ?? []) as CancelledRecord[];
  const departmentIds = Array.from(new Set(all.map((row) => row.owner_department_id).filter((value): value is string => Boolean(value))));
  const ownerIds = Array.from(new Set(all.map((row) => row.owner_user_id).filter((value): value is string => Boolean(value))));
  const recordIds = all.map((row) => row.id);

  const departmentsRes = departmentIds.length
    ? await supabase.from("departments").select("id,name,short_name").in("id", departmentIds)
    : { data: [] as Array<{ id: string; name: string; short_name: string | null }>, error: null };
  const profilesRes = ownerIds.length
    ? await supabase.from("profiles").select("user_id,full_name,email").in("user_id", ownerIds)
    : { data: [] as Array<{ user_id: string; full_name: string | null; email: string | null }>, error: null };
  const historyRes = recordIds.length
    ? await supabase.from("record_status_history").select("record_id,reason").in("record_id", recordIds).eq("new_status", "CANCELLED")
    : { data: [] as Array<{ record_id: string; reason: string | null }>, error: null };

  const departmentMap = new Map<string, string>();
  for (const row of departmentsRes.data ?? []) departmentMap.set(String(row.id), String(row.short_name || row.name || "—"));
  const profileMap = new Map<string, string>();
  for (const row of profilesRes.data ?? []) profileMap.set(String(row.user_id), String(row.full_name || row.email || "Người dùng"));
  const reasonMap = new Map<string, string>();
  for (const row of historyRes.data ?? []) {
    if (!reasonMap.has(String(row.record_id)) && row.reason) reasonMap.set(String(row.record_id), String(row.reason));
  }

  const rows = all.filter((row) => {
    if (type && row.record_type !== type) return false;
    if (!q) return true;
    const text = [
      row.record_code,
      row.title,
      TYPE_LABELS[row.record_type] || row.record_type,
      departmentMap.get(row.owner_department_id || "") || "",
      profileMap.get(row.owner_user_id || "") || "",
      reasonMap.get(row.id) || "",
    ].join(" ").toLocaleLowerCase("vi");
    return text.includes(q);
  });

  const actionCount = all.filter((row) => row.record_type === "ACTION").length;
  const otherCount = all.length - actionCount;
  const firstError = recordsRes.error || departmentsRes.error || profilesRes.error || historyRes.error;

  return <div className="page-stack cancelled-records-page">
    <style>{`
      .cancelled-records-page{max-width:1280px;margin:0 auto}.cancelled-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:20px;align-items:center;padding:18px 20px;border:1px solid #eadede;border-radius:18px;background:linear-gradient(135deg,#fff,#fff8f8)}.cancelled-hero h2{margin:5px 0 0}.cancelled-hero p{margin:6px 0 0;color:#6b7478;font-size:12px;line-height:1.5;max-width:760px}.cancelled-kpis{display:grid;grid-template-columns:repeat(3,minmax(90px,1fr));gap:8px}.cancelled-kpis div{background:#fff;border:1px solid #ecdede;border-radius:12px;padding:10px 12px;display:grid;gap:3px}.cancelled-kpis strong{font-size:22px}.cancelled-kpis span{font-size:9px;color:#7f6a6a;text-transform:uppercase;font-weight:800}.cancelled-toolbar{display:grid;grid-template-columns:minmax(240px,1fr) 240px auto;gap:9px;padding:12px}.cancelled-reason{max-width:420px;color:#6f5d5d;line-height:1.4}.cancelled-pill{display:inline-flex;margin-top:4px;padding:3px 7px;border-radius:999px;background:#eef1f2;color:#68757b;font-size:9px;font-weight:800}.cancelled-note{padding:12px 14px;border-radius:12px;background:#f8fafb;color:#607078;font-size:11px;line-height:1.5}@media(max-width:760px){.cancelled-hero{grid-template-columns:1fr}.cancelled-kpis{grid-template-columns:repeat(3,1fr)}.cancelled-toolbar{grid-template-columns:1fr}.cancelled-toolbar .button{width:100%}.cancelled-records-page .table-wrap{overflow-x:auto}}
    `}</style>

    <PageHeader
      eyebrow={`TRA CỨU · NĂM ${year}`}
      title="Hồ sơ đã hủy"
      description="Kho tra cứu riêng. Hồ sơ/tác vụ đã hủy không còn xuất hiện trong Dashboard, Việc của tôi và các danh sách vận hành thông thường."
    />

    <section className="cancelled-hero">
      <div><div className="eyebrow">AUDIT TRAIL · KHÔNG XÓA DỮ LIỆU</div><h2>Tra cứu khi thật sự cần</h2><p>Hủy chỉ đưa hồ sơ ra khỏi luồng vận hành. Mã hồ sơ, lý do hủy, lịch sử và minh chứng vẫn được giữ để truy vết.</p></div>
      <div className="cancelled-kpis"><div><strong>{all.length}</strong><span>Tổng đã hủy</span></div><div><strong>{actionCount}</strong><span>Tác vụ</span></div><div><strong>{otherCount}</strong><span>Hồ sơ khác</span></div></div>
    </section>

    {firstError ? <div className="alert error">Một phần dữ liệu tra cứu chưa tải được: {firstError.message}</div> : null}

    <section className="panel">
      <form className="cancelled-toolbar" method="get">
        <input name="q" defaultValue={query.q || ""} placeholder="Tìm mã, tiêu đề, đơn vị, người phụ trách, lý do hủy..." />
        <select name="type" defaultValue={type}><option value="">Tất cả loại hồ sơ</option>{Object.entries(TYPE_LABELS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select>
        <button className="button secondary" type="submit">Lọc / Tìm</button>
      </form>
      <div className="table-wrap"><table><thead><tr><th>Mã</th><th>Hồ sơ / tác vụ</th><th>Loại</th><th>Đơn vị / người phụ trách</th><th>Lý do hủy</th><th>Cập nhật</th><th></th></tr></thead><tbody>
        {rows.map((row) => <tr key={row.id}>
          <td><strong>{row.record_code}</strong></td>
          <td><strong>{row.title}</strong><span className="cancelled-pill">Đã hủy</span></td>
          <td>{TYPE_LABELS[row.record_type] || row.record_type}</td>
          <td><strong>{departmentMap.get(row.owner_department_id || "") || "—"}</strong><span className="subline">{profileMap.get(row.owner_user_id || "") || "Chưa gán"}</span></td>
          <td><div className="cancelled-reason">{reasonMap.get(row.id) || "—"}</div></td>
          <td>{formatDateTime(row.updated_at)}</td>
          <td>{["PROGRAM","MONITORING"].includes(row.record_type) ? <span className="muted tiny">Tra cứu qua lịch sử</span> : <Link className="button tertiary small" href={routeForRecord(row.record_type, row.id)}>Mở hồ sơ</Link>}</td>
        </tr>)}
        {!rows.length ? <tr><td colSpan={7}><div className="empty-state">Không có hồ sơ đã hủy phù hợp bộ lọc.</div></td></tr> : null}
      </tbody></table></div>
    </section>

    <div className="cancelled-note"><strong>Lưu ý:</strong> khu vực này chỉ phục vụ tra cứu và audit. Hồ sơ đã hủy không được tính vào cảnh báo quá hạn, khối lượng công việc đang mở hay KPI thực hiện.</div>
  </div>;
}
