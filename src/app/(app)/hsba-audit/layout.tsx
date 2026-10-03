import { PageHeader } from "@/components/page-header";
import { HsbaAuditWorkspaceNav } from "@/components/hsba-audit-workspace-nav";
import { requireUserContext, requirePermission } from "@/lib/auth";

export default async function HsbaAuditLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUserContext();
  requirePermission(user, "hsba_audit.view");
  return (
    <div className="page-stack hsba-audit-page">
      <PageHeader
        title="Audit nội bộ KHTH"
        description="Bảng kiểm, lượt kiểm tra và theo dõi khắc phục lỗi cho Hồ sơ bệnh án, Phác đồ điều trị và QTKT nội trú — mỗi loại có bảng kiểm riêng, module độc lập, không dùng chung dữ liệu với findings/CAPA của QLCL."
        icon="list-checks"
      />
      <HsbaAuditWorkspaceNav />
      {children}
    </div>
  );
}
