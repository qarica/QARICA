import { RegistryModulePage } from "@/components/registry-module-page";

export default function ImprovementProposalsPage() {
  return <RegistryModulePage config={{
    eyebrow: "CẢI TIẾN CHẤT LƯỢNG",
    title: "Đề xuất cải tiến",
    description: "Ghi nhận vấn đề, dữ liệu nền và phạm vi đề xuất trước khi xem xét chuyển thành đề án cải tiến chính thức.",
    permissions: ["projects.view", "projects.propose", "projects.manage"],
    recordTypes: ["IMPROVEMENT_PROPOSAL"],
  }} />;
}
