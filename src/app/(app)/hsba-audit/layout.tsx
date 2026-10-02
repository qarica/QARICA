import { PageHeader } from "@/components/page-header";
import { HsbaAuditWorkspaceNav } from "@/components/hsba-audit-workspace-nav";
import { requireUserContext, requirePermission } from "@/lib/auth";

export default async function HsbaAuditLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUserContext();
  requirePermission(user, "hsba_audit.view");
  return (
    <div className="page-stack hsba-audit-page">
      <PageHeader
        eyebrow="Quản lý chất lượng"
        title="Audit nội bộ KHTH"
        description="Bảng kiểm, lượt kiểm tra và theo dõi khắc phục lỗi cho HSBA và Phác đồ điều trị/QTKT nội trú — module riêng, không dùng chung dữ liệu với findings/CAPA của QLCL."
        icon="list-checks"
      />
      <HsbaAuditWorkspaceNav />
      {children}
    </div>
  );
}
