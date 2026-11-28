import { RegistryModulePage, type RegistryRecordFilter } from "@/components/registry-module-page";
import { SafetyWorkspaceBar } from "@/components/safety-workspace-bar";
import { isPastDue } from "@/lib/quality-priority-signals";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ overdue?: string }> }) {
  const year = await getWorkYear();
  const { overdue } = await searchParams;
  // Mục "phản ánh quá hạn phản hồi" ở thanh Cần xử lý trỏ về đây (?overdue=1): lọc đúng các phản ánh chưa đóng đã quá hạn phản hồi.
  let recordFilter: RegistryRecordFilter | undefined;
  if (overdue === "1") {
    const supabase = await createClient();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
    const { data } = await supabase.from("feedback_records").select("record_id,workflow_status,response_due_at");
    const ids = ((data ?? []) as any[])
      .filter((x) => !["CLOSED", "CANCELLED"].includes(String(x.workflow_status ?? "").toUpperCase()) && isPastDue(x.response_due_at, today))
      .map((x) => String(x.record_id));
    recordFilter = { recordIds: ids, label: "Phản ánh quá hạn phản hồi", clearHref: "/feedback" };
  }
  return <RegistryModulePage config={{
    eyebrow: "SỰ CỐ & PHẢN ÁNH",
    title: "Phản ánh / Góp ý",
    description: "Ghi nhận phản ánh, góp ý và các hồ sơ cần chuyển tiếp thành Finding, Action hoặc CAPA khi phù hợp.",
    permissions: ["feedback.view", "feedback.manage"],
    recordTypes: ["FEEDBACK"],
    icon: "message-circle-warning",
  }} topSlot={<SafetyWorkspaceBar active="feedback" year={year} />} recordFilter={recordFilter} />;
}
