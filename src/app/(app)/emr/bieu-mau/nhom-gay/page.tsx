import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EmrBieuMauGroupsClient } from "@/components/emr-bieu-mau-groups-client";
import { hasPermission, requirePermission, requireUserContext } from "@/lib/auth";

export default async function BieuMauGroupsPage() {
  const { user } = await requireUserContext();
  requirePermission(user, "emr.view");
  const canManage = hasPermission(user, "emr.manage");

  return (
    <div className="page-stack">
      <PageHeader eyebrow="BIỂU MẪU" title="Quản lý nhóm gáy" description="Khai báo, đổi tên, sắp xếp, ngừng sử dụng hoặc xoá nhóm gáy — việc gán biểu mẫu vào từng nhóm và sắp xếp thứ tự trong gáy thực hiện ở Cây biểu mẫu." icon="layers" actions={<Link className="button secondary" href="/emr/bieu-mau/tree">← Về cây biểu mẫu</Link>} />
      <EmrBieuMauGroupsClient canManage={canManage} />
    </div>
  );
}
