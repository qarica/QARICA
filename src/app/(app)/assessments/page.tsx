import { RegistryModulePage } from "@/components/registry-module-page";

export default function AssessmentsPage() {
  return <RegistryModulePage config={{
    eyebrow: "ĐÁNH GIÁ CHẤT LƯỢNG",
    title: "Tự đánh giá chất lượng",
    description: "Tạo đợt từ bộ tiêu chí đã phát hành, phân công thực hiện, theo dõi tiến độ và chốt kết quả mà không làm mất lịch sử.",
    permissions: ["criteria.view", "criteria.assess", "criteria.review", "criteria.manage"],
    recordTypes: ["ASSESSMENT"],
    tabs: [{label:"Quản lý bộ tiêu chí",href:"/assessments/catalog"}],
  }} />;
}
