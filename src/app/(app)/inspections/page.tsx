import { AssessmentWorkspaceBar, assessmentAttentionRecordIds } from "@/components/assessment-workspace-bar";
import { RegistryModulePage, type RegistryRecordFilter } from "@/components/registry-module-page";
import { getWorkYear } from "@/lib/work-year";

export default async function InspectionsPage({ searchParams }: { searchParams: Promise<{ attention?: string }> }) {
  const year = await getWorkYear();
  const { attention } = await searchParams;
  // Mục ở thanh Cần xử lý trỏ về đây (?attention=...): lọc đúng các hồ sơ đó, cùng điều kiện với thanh.
  const hit = await assessmentAttentionRecordIds("inspection", attention);
  const recordFilter: RegistryRecordFilter | undefined = hit ? { recordIds: hit.ids, label: hit.label, clearHref: "/inspections" } : undefined;
  return <RegistryModulePage config={{
    eyebrow: "KẾ HOẠCH & ĐIỀU HÀNH",
    icon: "clipboard-check",
    title: "Tiếp đoàn / Kiểm tra ngoài",
    description: "Quản lý đợt kiểm tra ngoài, mốc chuẩn bị trước - sau đoàn và liên kết Finding phát sinh.",
    permissions: ["inspections.view", "inspections.manage"],
    recordTypes: ["INSPECTION"],
    foundationNote: "Khung Inspection Mode đã được tạo để sau đó bổ sung countdown D-30, D-14, D-7, D-3, D-1, D và các việc sau đoàn mà không tách khỏi Finding/Action chung.",
  }} topSlot={<AssessmentWorkspaceBar active="inspection" year={year} />} recordFilter={recordFilter} />;
}
