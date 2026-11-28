import { RegistryModulePage, type RegistryRecordFilter } from "@/components/registry-module-page";
import { isPastDue } from "@/lib/quality-priority-signals";
import { createClient } from "@/lib/supabase/server";
import { NavGroupBar } from "@/components/nav-group-bar";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ attention?: string }> }) {
  // Mục "nghĩa vụ báo cáo quá hạn" ở thanh Cần xử lý trỏ về đây (?attention=overdue): lọc đúng các nghĩa vụ đó.
  let recordFilter: RegistryRecordFilter | undefined;
  if ((await searchParams).attention === "overdue") {
    const supabase = await createClient();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
    const { data } = await supabase.from("reporting_obligations").select("record_id,workflow_status,due_date");
    recordFilter = { recordIds: ((data ?? []) as any[]).filter((x) => !["COMPLETED", "CANCELLED"].includes(String(x.workflow_status ?? "").toUpperCase()) && isPastDue(x.due_date, today)).map((x) => String(x.record_id)), label: "Nghĩa vụ báo cáo quá hạn", clearHref: "/reports" };
  }
  return (
    <div className="reports-mobile-redesign">
    <RegistryModulePage
      config={{
        eyebrow: "KẾ HOẠCH & ĐIỀU HÀNH",
        icon: "trending-up",
        title: "Báo cáo phải nộp",
        description: "Theo dõi nghĩa vụ báo cáo, đơn vị lập báo cáo, hạn nộp và bằng chứng đã gửi.",
        permissions: ["reports.view", "reports.manage"],
        recordTypes: ["REPORT"],
      }}
      topSlot={<NavGroupBar group="operations" active="/reports" ariaLabel="Luồng việc Điều hành chất lượng" emptyText="Không có nghĩa vụ báo cáo hay Action kế hoạch nào quá hạn." />}
      recordFilter={recordFilter}
    />
    </div>
  );
}
