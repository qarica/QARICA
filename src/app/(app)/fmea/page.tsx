import { RegistryModulePage, type RegistryRecordFilter } from "@/components/registry-module-page";
import { RiskWorkspaceBar } from "@/components/risk-workspace-bar";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";

const STAGE_LABEL: Record<string, string> = { PENDING_APPROVAL: "FMEA chờ phê duyệt", RESIDUAL_REVIEW: "FMEA chờ chấm lại rủi ro tồn dư" };

export default async function FmeaPage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const year = await getWorkYear();
  const { stage } = await searchParams;
  // Mục FMEA ở thanh Cần xử lý trỏ về đây (?stage=PENDING_APPROVAL | RESIDUAL_REVIEW): lọc đúng các nghiên cứu FMEA ở bước đó.
  let recordFilter: RegistryRecordFilter | undefined;
  if (stage && STAGE_LABEL[stage]) {
    const supabase = await createClient();
    const { data } = await supabase.from("fmea_studies").select("record_id,workflow_status").eq("workflow_status", stage);
    recordFilter = { recordIds: ((data ?? []) as any[]).map((x) => String(x.record_id)), label: STAGE_LABEL[stage], clearHref: "/fmea" };
  }
  return (
    <RegistryModulePage
      config={{
        eyebrow: "QUẢN LÝ RỦI RO",
        icon: "workflow",
        title: "FMEA / HFMEA",
        description: "Phân tích quy trình, failure mode, nguyên nhân, hậu quả và mức ưu tiên để chủ động kiểm soát rủi ro trước khi xảy ra sự cố.",
        permissions: ["risk.view", "risk.manage"],
        recordTypes: ["FMEA"],
      }}
      topSlot={<RiskWorkspaceBar active="fmea" year={year} />}
      recordFilter={recordFilter}
    />
  );
}
