import { CorrectiveWorkspaceBar } from "@/components/corrective-workspace-bar";
import { RegistryModulePage, type RegistryRecordFilter } from "@/components/registry-module-page";
import { countOverdueFindings } from "@/lib/quality-priority-signals";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";

export default async function FindingsPage({ searchParams }: { searchParams: Promise<{ overdue?: string }> }) {
  const year = await getWorkYear();
  const { overdue } = await searchParams;
  // Mục "Finding quá hạn" ở thanh Cần xử lý trỏ về đây (?overdue=1): lọc đúng các Finding quá hạn, cùng cách tính với Dashboard.
  let recordFilter: RegistryRecordFilter | undefined;
  if (overdue === "1") {
    const supabase = await createClient();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
    const { data } = await supabase.from("findings").select("record_id,workflow_status,due_date");
    const rows = (data ?? []) as any[];
    const ids = rows.filter((x) => countOverdueFindings([x], today) === 1).map((x) => String(x.record_id));
    recordFilter = { recordIds: ids, label: "Finding quá hạn", clearHref: "/findings" };
  }
  return (
    <RegistryModulePage
      config={{
        eyebrow: "KHẮC PHỤC & CAPA",
        icon: "search-check",
        title: "Phát hiện (Findings)",
        description: "Theo dõi điểm không phù hợp từ giám sát, audit, phản ánh hoặc kiểm tra ngoài đến khi được xác minh đóng.",
        permissions: ["findings.view", "findings.manage"],
        recordTypes: ["FINDING"],
        foundationNote: "Finding dùng chung cho mọi nguồn và sẽ đi tiếp theo luồng Finding → Action → Evidence → Recheck; không tạo module tồn tại sau kiểm tra riêng.",
      }}
      topSlot={<CorrectiveWorkspaceBar active="findings" year={year} />}
      recordFilter={recordFilter}
    />
  );
}
