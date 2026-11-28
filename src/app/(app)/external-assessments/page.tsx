import { AssessmentWorkspaceBar } from "@/components/assessment-workspace-bar";
import { RegistryModulePage } from "@/components/registry-module-page";
import { getWorkYear } from "@/lib/work-year";

export default async function ExternalAssessmentsPage() {
  const year = await getWorkYear();
  return <RegistryModulePage config={{
    eyebrow: "ĐÁNH GIÁ & TIẾP ĐOÀN",
    title: "Đánh giá ngoài",
    description: "Theo dõi kết quả đoàn ngoài, điểm số và chênh lệch so với tự đánh giá nội bộ để ưu tiên khắc phục.",
    permissions: ["criteria.view", "criteria.review", "criteria.manage"],
    recordTypes: ["EXTERNAL_ASSESSMENT"],
    icon: "search-check",
  }} topSlot={<AssessmentWorkspaceBar active="external" year={year} />} />;
}
