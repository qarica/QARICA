import { AssessmentWorkspaceBar, assessmentAttentionRecordIds } from "@/components/assessment-workspace-bar";
import { RegistryModulePage, type RegistryRecordFilter } from "@/components/registry-module-page";
import { getWorkYear } from "@/lib/work-year";

export default async function AssessmentsPage({ searchParams }: { searchParams: Promise<{ attention?: string }> }) {
  const year = await getWorkYear();
  const { attention } = await searchParams;
  // Mục ở thanh Cần xử lý trỏ về đây (?attention=...): lọc đúng các hồ sơ đó, cùng điều kiện với thanh.
  const hit = await assessmentAttentionRecordIds("self", attention);
  const recordFilter: RegistryRecordFilter | undefined = hit ? { recordIds: hit.ids, label: hit.label, clearHref: "/assessments" } : undefined;
  return <RegistryModulePage config={{
    eyebrow: "ĐÁNH GIÁ CHẤT LƯỢNG",
    title: "Tự đánh giá chất lượng",
    description: "Tạo đợt từ bộ tiêu chí đã phát hành, phân công thực hiện, theo dõi tiến độ và chốt kết quả mà không làm mất lịch sử.",
    permissions: ["criteria.view", "criteria.assess", "criteria.review", "criteria.manage"],
    recordTypes: ["ASSESSMENT"],
    tabs: [{label:"Quản lý bộ tiêu chí",href:"/assessments/catalog"}],
    icon: "badge-check",
  }} topSlot={<AssessmentWorkspaceBar active="self" year={year} />} recordFilter={recordFilter} />;
}
