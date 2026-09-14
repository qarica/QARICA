import { RegistryModulePage } from "@/components/registry-module-page";

export default function AssessmentsPage() {
  return <RegistryModulePage config={{
    eyebrow: "ĐÁNH GIÁ & TIẾP ĐOÀN",
    title: "Tự đánh giá chất lượng",
    description: "Theo dõi các đợt tự đánh giá, kết quả tiêu chí, tiến độ hoàn thiện và minh chứng theo bộ tiêu chí áp dụng.",
    permissions: ["criteria.view", "criteria.assess", "criteria.review", "criteria.manage"],
    recordTypes: ["ASSESSMENT"],
  }} />;
}
