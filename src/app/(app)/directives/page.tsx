import { RegistryModulePage } from "@/components/registry-module-page";

export default function DirectivesPage() {
  return (
    <RegistryModulePage
      config={{
        eyebrow: "KẾ HOẠCH & ĐIỀU HÀNH",
        title: "Chỉ đạo / Yêu cầu",
        description: "Theo dõi yêu cầu nội bộ và bên ngoài, đơn vị chịu trách nhiệm, hạn thực hiện và kết quả xử lý.",
        permissions: ["directives.view", "directives.manage"],
        recordTypes: ["DIRECTIVE"],
      }}
    />
  );
}
