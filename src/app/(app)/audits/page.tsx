import { AssessmentWorkspaceBar, assessmentAttentionRecordIds } from "@/components/assessment-workspace-bar";
import { RegistryModulePage, type RegistryRecordFilter } from "@/components/registry-module-page";
import { getWorkYear } from "@/lib/work-year";

export default async function AuditsPage({ searchParams }: { searchParams: Promise<{ attention?: string }> }) {
  const year = await getWorkYear();
  const { attention } = await searchParams;
  // Mục ở thanh Cần xử lý trỏ về đây (?attention=...): lọc đúng các hồ sơ đó, cùng điều kiện với thanh.
  const hit = await assessmentAttentionRecordIds("audit", attention);
  const recordFilter: RegistryRecordFilter | undefined = hit ? { recordIds: hit.ids, label: hit.label, clearHref: "/audits" } : undefined;
  return <RegistryModulePage config={{
    eyebrow: "ĐÁNH GIÁ CHẤT LƯỢNG",
    title: "Audit / Tracer",
    description: "Theo dõi audit, tracer, đơn vị được đánh giá và các follow-up phát sinh.",
    permissions: ["audit.view", "audit.perform", "audit.manage"],
    recordTypes: ["AUDIT"],
    icon: "search-check",
  }} topSlot={<AssessmentWorkspaceBar active="audit" year={year} />} recordFilter={recordFilter} />;
}
