import { PageHeader } from "@/components/page-header";
import { InfectionControlCasesClient } from "@/components/infection-control-cases-client";
import { hasPermission, requirePermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const SELECT = "id,department_id,patient_code,detected_date,infection_site,pathogen,related_procedure,status,notes,created_at,updated_at";

export default async function InfectionControlCasesPage() {
  const { user } = await requireUserContext();
  requirePermission(user, "infection_control.view");
  const canManage = hasPermission(user, "infection_control.manage");
  const supabase = await createClient();

  const [departmentsRes, casesRes] = await Promise.all([
    supabase.from("departments").select("id,name").eq("organization_id", user.organizationId).eq("is_active", true).order("name"),
    supabase.from("infection_control_cases").select(SELECT).eq("organization_id", user.organizationId).order("detected_date", { ascending: false }),
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        title="Giám sát nhiễm khuẩn bệnh viện"
        description="Ghi nhận và theo dõi ca nhiễm khuẩn liên quan chăm sóc y tế (HAI) theo khoa/phòng. Phơi nhiễm nghề nghiệp/kim đâm ghi nhận ở module Sự cố & Phản ánh."
        icon="shield-alert"
      />
      <InfectionControlCasesClient
        departments={(departmentsRes.data ?? []) as any}
        initialCases={(casesRes.data ?? []) as any}
        canManage={canManage}
      />
    </div>
  );
}
