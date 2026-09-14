import { RegistryModulePage } from "@/components/registry-module-page";

export default function ExternalAssessmentsPage() {
  return <RegistryModulePage config={{
    eyebrow: "ĐÁNH GIÁ & TIẾP ĐOÀN",
    title: "Đánh giá ngoài",
    description: "Theo dõi kết quả đoàn ngoài, điểm số và chênh lệch so với tự đánh giá nội bộ để ưu tiên khắc phục.",
    permissions: ["criteria.view", "criteria.review", "criteria.manage"],
    recordTypes: ["EXTERNAL_ASSESSMENT"],
  }} />;
}
