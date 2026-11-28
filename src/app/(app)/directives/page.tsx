import { RegistryModulePage } from "@/components/registry-module-page";
import { NavGroupBar } from "@/components/nav-group-bar";

export default function DirectivesPage() {
  return (
    <RegistryModulePage
      config={{
        eyebrow: "KẾ HOẠCH & ĐIỀU HÀNH",
        icon: "file-input",
        title: "Chỉ đạo / Yêu cầu",
        description: "Theo dõi yêu cầu nội bộ và bên ngoài, đơn vị chịu trách nhiệm, hạn thực hiện và kết quả xử lý.",
        permissions: ["directives.view", "directives.manage"],
        recordTypes: ["DIRECTIVE"],
      }}
      topSlot={<NavGroupBar group="operations" active="/directives" ariaLabel="Luồng việc Điều hành chất lượng" emptyText="Không có nghĩa vụ báo cáo hay Action kế hoạch nào quá hạn." />}
    />
  );
}
