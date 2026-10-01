import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EmrWorkspaceNav } from "@/components/emr-workspace-nav";
import { EMR_STATUS_LABELS } from "@/lib/emr-categories";
import { requirePermission, requireUserContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const UNGROUPED = "Chưa phân nhóm";

export default async function BieuMauTreePage() {
  const { user } = await requireUserContext();
  requirePermission(user, "emr.view");
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
  const organizationId = profile?.organization_id || null;

  const { data, error } = organizationId
    ? await admin.from("emr_rollout_items").select("id,title,status,details").eq("organization_id", organizationId).eq("category", "BIEU_MAU").order("title", { ascending: true })
    : { data: [] as any[], error: null };

  const items = data ?? [];
  const groups = new Map<string, any[]>();
  for (const item of items) {
    const key = String(item.details?.binding_group || "").trim() || UNGROUPED;
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
  }
  const sortedGroupNames = Array.from(groups.keys()).sort((a, b) => a === UNGROUPED ? 1 : b === UNGROUPED ? -1 : a.localeCompare(b, "vi"));

  return (
    <div className="page-stack">
      <PageHeader eyebrow="BIỂU MẪU" title="Cây master biểu mẫu" description="Toàn bộ biểu mẫu đã khai báo, nhóm theo Nhóm gáy — trực tiếp từ dữ liệu hạng mục, không phải danh mục mẫu dựng riêng." icon="list-tree" actions={<><a className="button secondary" href={`/api/emr/items/export?category=BIEU_MAU&groupBy=binding_group`}>Xuất Excel</a><Link className="button secondary" href="/emr/bieu-mau">← Về danh sách Biểu mẫu</Link></>} />
      <EmrWorkspaceNav />
      {error ? <div className="alert error">Không tải được dữ liệu: {error.message}</div> : null}
      {!items.length ? (
        <div className="empty-state">Chưa có biểu mẫu nào để dựng cây.</div>
      ) : (
        <div className="panel" style={{ padding: 8 }}>
          {sortedGroupNames.map((groupName) => {
            const groupItems = groups.get(groupName)!;
            return (
              <details key={groupName} open className="bieu-mau-tree-group">
                <summary>
                  <strong>{groupName}</strong>
                  <span className="status-badge muted">{groupItems.length} biểu mẫu</span>
                </summary>
                <ul className="bieu-mau-tree-list">
                  {groupItems.map((item) => (
                    <li key={item.id}>
                      <span className="bieu-mau-tree-code">{item.details?.form_code ? String(item.details.form_code) : "—"}</span>
                      <span className="bieu-mau-tree-title">{item.title}</span>
                      <span className={`status-badge ${item.status === "DONE" ? "success" : item.status === "BLOCKED" ? "danger" : "muted"}`}>{EMR_STATUS_LABELS[item.status] || item.status}</span>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      )}
      <style>{`
        .bieu-mau-tree-group{border-bottom:1px solid #edf1f2;padding:4px 10px}
        .bieu-mau-tree-group:last-child{border-bottom:0}
        .bieu-mau-tree-group summary{display:flex;align-items:center;gap:10px;padding:11px 4px;cursor:pointer;list-style:none}
        .bieu-mau-tree-group summary::-webkit-details-marker{display:none}
        .bieu-mau-tree-group summary strong{font-size:13px;color:#0f172a}
        .bieu-mau-tree-list{display:grid;gap:2px;padding:2px 4px 10px 22px;margin:0;list-style:none}
        .bieu-mau-tree-list li{display:grid;grid-template-columns:110px 1fr auto;gap:10px;align-items:center;padding:8px 10px;border-radius:8px}
        .bieu-mau-tree-list li:hover{background:#f8fafc}
        .bieu-mau-tree-code{font-size:11px;color:#64748b;font-weight:700}
        .bieu-mau-tree-title{font-size:12.5px;color:#1e293b}
        @media(max-width:620px){.bieu-mau-tree-list li{grid-template-columns:1fr auto}.bieu-mau-tree-code{grid-column:1/-1}}
      `}</style>
    </div>
  );
}
