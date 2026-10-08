import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EmrBieuMauTreeClient } from "@/components/emr-bieu-mau-tree-client";
import { hasPermission, requirePermission, requireUserContext } from "@/lib/auth";

export default async function BieuMauTreePage() {
  const { user } = await requireUserContext();
  requirePermission(user, "emr.view");
  const canManage = hasPermission(user, "emr.manage");

  return (
    <div className="page-stack">
      <PageHeader eyebrow="BIỂU MẪU" title="Cây master biểu mẫu" description="Toàn bộ biểu mẫu đã khai báo, nhóm theo Nhóm gáy — trực tiếp từ dữ liệu hạng mục, không phải danh mục mẫu dựng riêng." icon="list-tree" actions={<><a className="button secondary" href={`/api/emr/items/export?category=BIEU_MAU&groupBy=binding_group`}>Xuất Excel</a><Link className="button secondary" href="/emr/bieu-mau/nhom-gay">Quản lý nhóm gáy</Link><Link className="button secondary" href="/emr/bieu-mau">← Về danh sách Biểu mẫu</Link></>} />
      <EmrBieuMauTreeClient canManage={canManage} />
    </div>
  );
}
