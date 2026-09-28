import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requirePermission, requireUserContext } from "@/lib/auth";
import { formatDateTime, humanStatus } from "@/lib/format";
import { routeForRecord } from "@/lib/record-route";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 20;

export default async function AdminAuditLogPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { user } = await requireUserContext();
  requirePermission(user, "system.manage");
  const query = await searchParams;
  const qRaw = String(query.q || "").trim();
  const q = qRaw.toLocaleLowerCase("vi");
  const supabase = await createClient();

  // Chỉ đọc audit_logs thật đã được các API route khác ghi trong nghiệp vụ hiện có
  // (record-lifecycle, plans, indicators, criteria, CAPA, ...). Trang này không tạo
  // thêm bản ghi audit nào và không đổi cách audit_logs được ghi ở nơi khác.
  const { data: rows, error } = await supabase
    .from("audit_logs")
    .select("id,actor_user_id,record_id,table_name,row_id,action_type,reason,created_at")
    .order("created_at", { ascending: false })
    .limit(300);

  const logs = (rows ?? []) as any[];
  const actorIds = Array.from(new Set(logs.map((r) => r.actor_user_id).filter(Boolean)));
  const recordIds = Array.from(new Set(logs.map((r) => r.record_id).filter(Boolean)));

  const [profilesRes, recordsRes] = await Promise.all([
    actorIds.length ? supabase.from("profiles").select("user_id,full_name,email").in("user_id", actorIds) : Promise.resolve({ data: [] as any[], error: null }),
    recordIds.length ? supabase.from("records").select("id,record_code,title,record_type").in("id", recordIds) : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  const actorMap = new Map(((profilesRes.data ?? []) as any[]).map((p) => [p.user_id, p.full_name || p.email || "—"]));
  const recordMap = new Map(((recordsRes.data ?? []) as any[]).map((r) => [r.id, r]));

  const enriched = logs.map((r) => {
    const record = r.record_id ? recordMap.get(r.record_id) : null;
    return {
      ...r,
      actorName: r.actor_user_id ? actorMap.get(r.actor_user_id) || "Hệ thống" : "Hệ thống",
      target: record ? `${record.record_code} · ${record.title}` : `${r.table_name || "—"}${r.row_id ? ` #${String(r.row_id).slice(0, 8)}` : ""}`,
      targetHref: record ? routeForRecord(record.record_type, record.id) : null,
    };
  });

  const filtered = q
    ? enriched.filter((r) => `${r.actorName} ${r.action_type} ${r.target} ${r.reason || ""}`.toLocaleLowerCase("vi").includes(q))
    : enriched;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, Number(query.page) || 1), totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function pageHref(n: number) {
    const params = new URLSearchParams();
    if (qRaw) params.set("q", qRaw);
    if (n > 1) params.set("page", String(n));
    const s = params.toString();
    return `/admin/audit-log${s ? `?${s}` : ""}`;
  }

  return <div className="page-stack" style={{ maxWidth: 1440, margin: "0 auto" }}>
    <PageHeader eyebrow="QUẢN TRỊ" title="Nhật ký hệ thống" description="Chỉ đọc audit_logs đã được các nghiệp vụ hiện có ghi lại; không tạo hoặc chỉnh sửa bản ghi audit ở đây." icon="file-text" />
    {error ? <div className="alert error">Không tải được nhật ký: {error.message}</div> : null}
    <section className="panel">
      <form className="toolbar" method="get"><div className="search-box"><input name="q" defaultValue={qRaw} placeholder="Tìm theo người thực hiện, hành động, hồ sơ liên quan, lý do..." /></div><button className="button secondary" type="submit">Tìm</button>{qRaw ? <Link className="button tertiary" href="/admin/audit-log">Xóa lọc</Link> : null}</form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Liên quan</th><th>Lý do</th></tr></thead>
          <tbody>
            {pageRows.map((r) => <tr key={r.id}>
              <td>{formatDateTime(r.created_at)}</td>
              <td>{r.actorName}</td>
              <td><strong>{humanStatus(r.action_type)}</strong></td>
              <td>{r.targetHref ? <Link className="table-link" href={r.targetHref}>{r.target}</Link> : r.target}</td>
              <td>{r.reason || "—"}</td>
            </tr>)}
            {!pageRows.length ? <tr><td colSpan={5}><div className="empty-state">Chưa có nhật ký hệ thống nào phù hợp.</div></td></tr> : null}
          </tbody>
        </table>
      </div>
      {filtered.length ? <div className="module-pagination"><span>Hiển thị {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filtered.length)} của {filtered.length} bản ghi (tối đa 300 gần nhất)</span><div className="module-pagination-pages">{Array.from({ length: totalPages }, (_, i) => i + 1).map((pn) => <Link key={pn} className={`button small ${pn === currentPage ? "primary" : "secondary"}`} href={pageHref(pn)}>{pn}</Link>)}</div></div> : null}
    </section>
  </div>;
}
