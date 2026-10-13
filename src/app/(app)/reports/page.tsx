import { RegistryModulePage } from "@/components/registry-module-page";

export default function ReportsPage() {
  return (
    <div className="reports-mobile-redesign">
    <RegistryModulePage
      config={{
        eyebrow: "KẾ HOẠCH & ĐIỀU HÀNH",
        title: "Báo cáo phải nộp",
        description: "Theo dõi nghĩa vụ báo cáo, đơn vị lập báo cáo, hạn nộp và bằng chứng đã gửi.",
        permissions: ["reports.view", "reports.manage"],
        recordTypes: ["REPORT"],
      }}
    />
    </div>
  );
}
