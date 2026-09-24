import { redirect } from "next/navigation";
import { IncidentQuickReportClient } from "@/components/incident-quick-report-client";
import { PageHeader } from "@/components/page-header";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";

export default async function IncidentQuickReportPage() {
  const { user } = await requireUserContext();
  if (!hasAnyPermission(user, ["incident.report", "incident.triage"])) redirect("/dashboard?forbidden=1");

  const year = await getWorkYear();
  const supabase = await createClient();
  const { data: departments } = await supabase
    .from("departments")
    .select("id,name,short_name")
    .eq("is_active", true)
    .order("name");

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="SỰ CỐ & PHẢN ÁNH"
        title="Báo cáo sự cố nhanh"
        description="Chỉ ghi nhận nhanh khoa/phòng và mô tả ban đầu để không bỏ lỡ thời điểm. Bổ sung chi tiết đầy đủ (người báo cáo, người bệnh, xử trí ban đầu...) trong hồ sơ sau."
      />
      <IncidentQuickReportClient
        departments={(departments ?? []).map((d: any) => ({ id: d.id, label: d.short_name || d.name }))}
        defaultDepartmentId={user.primaryDepartmentId}
        workYear={year}
      />
    </div>
  );
}
