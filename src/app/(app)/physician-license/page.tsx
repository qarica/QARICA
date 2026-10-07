import { PageHeader } from "@/components/page-header";
import { PhysicianLicenseClient } from "@/components/physician-license-client";
import { hasPermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function PhysicianLicensePage() {
  const { user } = await requireUserContext();
  const canManage = hasPermission(user, "physician_license.manage");
  const supabase = await createClient();

  // A view-only account (physician_license.view, granted broadly to every
  // role that already had tasks.view when this module shipped) should only
  // see its own khoa/phòng's registrations — not every physician in the
  // hospital. Only physician_license.manage (Tổ Hành chính, who must track
  // compliance across the whole hospital) keeps the full organization list.
  let registrationsQuery = supabase
    .from("physician_license_registrations")
    .select("id,department_id,physician_name,physician_code,role_type,case_type,effective_date,deadline,status,registered_at,notes")
    .eq("organization_id", user.organizationId)
    .order("deadline", { ascending: true })
    .limit(300);
  if (!canManage) {
    registrationsQuery = user.primaryDepartmentId ? registrationsQuery.eq("department_id", user.primaryDepartmentId) : registrationsQuery.eq("department_id", "00000000-0000-0000-0000-000000000000");
  }

  const [departmentsRes, registrationsRes] = await Promise.all([
    supabase.from("departments").select("id,name").eq("is_active", true).order("name"),
    registrationsQuery,
  ]);

  return (
    <div className="page-stack physician-license-page">
      <PageHeader
        title="Theo dõi hành nghề bác sĩ"
        description="Theo dõi hạn đăng ký hành nghề trên cổng SYT/BHYT cho từng bác sĩ — tránh xuất toán BHYT do sai/thiếu chứng chỉ hành nghề."
        icon="list-checks"
      />
      <PhysicianLicenseClient
        departments={(departmentsRes.data ?? []) as any}
        initialRegistrations={(registrationsRes.data ?? []) as any}
        canManage={canManage}
      />
    </div>
  );
}
