import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EmrWorkspaceNav } from "@/components/emr-workspace-nav";
import { EmrBieuMauTreeClient } from "@/components/emr-bieu-mau-tree-client";
import { hasPermission, requirePermission, requireUserContext } from "@/lib/auth";

export default async function BieuMauTreePage() {
  const { user } = await requireUserContext();
  requirePermission(user, "emr.view");
  const canManage = hasPermission(user, "emr.manage");

  return (
    <div className="page-stack">
      <PageHeader eyebrow="BIỂU MẪU" title="Cây master biểu mẫu" description="Toàn bộ biểu mẫu đã khai báo, nhóm theo Nhóm gáy — trực tiếp từ dữ liệu hạng mục, không phải danh mục mẫu dựng riêng." icon="list-tree" actions={<><a className="button secondary" href={`/api/emr/items/export?category=BIEU_MAU&groupBy=binding_group`}>Xuất Excel</a><Link className="button secondary" href="/emr/bieu-mau">← Về danh sách Biểu mẫu</Link></>} />
      <EmrWorkspaceNav />
      <EmrBieuMauTreeClient canManage={canManage} />
      <style>{`
        .bieu-mau-tree-group{border-bottom:1px solid #edf1f2;padding:4px 10px}
        .bieu-mau-tree-group:last-child{border-bottom:0}
        .bieu-mau-tree-group summary{display:flex;align-items:center;gap:10px;padding:11px 4px;cursor:pointer;list-style:none}
        .bieu-mau-tree-group summary::-webkit-details-marker{display:none}
        .bieu-mau-tree-group summary strong{font-size:13px;color:#0f172a}
        .bieu-mau-tree-list{display:grid;gap:2px;padding:2px 4px 10px 22px;margin:0;list-style:none}
        .bieu-mau-tree-list li{display:grid;grid-template-columns:110px 1fr auto auto;gap:10px;align-items:center;padding:8px 10px;border-radius:8px}
        .bieu-mau-tree-list li:hover{background:#f8fafc}
        .bieu-mau-tree-code{font-size:11px;color:#64748b;font-weight:700}
        .bieu-mau-tree-title{font-size:12.5px;color:#1e293b}
        @media(max-width:760px){.bieu-mau-tree-list li{grid-template-columns:1fr auto}.bieu-mau-tree-code{grid-column:1/-1}}
      `}</style>
    </div>
  );
}
