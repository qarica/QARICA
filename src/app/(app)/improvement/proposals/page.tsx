import { ImprovementWorkspaceBar } from "@/components/improvement-workspace-bar";
import { RegistryModulePage } from "@/components/registry-module-page";
import { getWorkYear } from "@/lib/work-year";

export default async function ImprovementProposalsPage() {
  const year = await getWorkYear();
  return <RegistryModulePage config={{
    eyebrow: "CẢI TIẾN CHẤT LƯỢNG",
    title: "Đề xuất cải tiến",
    description: "Ghi nhận vấn đề, dữ liệu nền và phạm vi đề xuất trước khi xem xét chuyển thành đề án cải tiến chính thức.",
    permissions: ["projects.view", "projects.propose", "projects.manage"],
    recordTypes: ["IMPROVEMENT_PROPOSAL"],
    icon: "file-input",
  }} topSlot={<ImprovementWorkspaceBar active="proposals" year={year} />} />;
}
