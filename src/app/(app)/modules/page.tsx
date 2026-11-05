import { PageHeader } from "@/components/page-header";
import { ModuleCatalogClient } from "@/components/module-catalog-client";
import { requireUserContext } from "@/lib/auth";
import { visibleNavGroups } from "@/lib/navigation";

// Trang "danh mục toàn bộ module", lấy cảm hứng từ portal ứng dụng của Tâm
// Anh Hospital (lưới ô vuông theo nhóm, thay vì phải mở từng accordion
// sidebar). Không thay thế /dashboard (trang đó là KPI/biểu đồ QLCL thật, có
// dữ liệu nghiệp vụ riêng) — đây là một trang MỚI, tái dùng visibleNavGroups
// đã lọc đúng quyền sẵn có cho sidebar, nên không có nghiệp vụ hiển thị
// module nào cần viết lại hay dễ lệch quyền so với sidebar.
export default async function ModulesPage() {
  const { user } = await requireUserContext();
  const groups = visibleNavGroups(user);

  return (
    <div className="page-stack">
      <PageHeader
        title="Danh mục module"
        description="Toàn bộ module bạn có quyền truy cập trong QARICA, theo nhóm nghiệp vụ."
        icon="layers"
      />
      <ModuleCatalogClient groups={groups} />
    </div>
  );
}
