import { PageHeader } from "@/components/page-header";
import { HandHygieneAuditsClient } from "@/components/hand-hygiene-audits-client";
import { hasPermission, requirePermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const SELECT = "id,department_id,audit_date,observer_user_id,staff_role,opportunities_observed,opportunities_compliant,notes,created_at,updated_at";

export default async function HandHygieneAuditsPage() {
  const { user } = await requireUserContext();
  requirePermission(user, "infection_control.view");
  const canManage = hasPermission(user, "infection_control.manage");
  const supabase = await createClient();

  const [departmentsRes, profilesRes, auditsRes] = await Promise.all([
    supabase.from("departments").select("id,name").eq("organization_id", user.organizationId).eq("is_active", true).order("name"),
    supabase.from("profiles").select("user_id,full_name,email").eq("organization_id", user.organizationId).eq("is_active", true).order("full_name"),
    supabase.from("hand_hygiene_audits").select(SELECT).eq("organization_id", user.organizationId).order("audit_date", { ascending: false }),
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        title="Giám sát vệ sinh tay"
        description="Ghi nhận đợt quan sát tuân thủ vệ sinh tay (5 thời điểm) theo khoa/phòng — một trong các chỉ số kiểm soát nhiễm khuẩn bắt buộc của Bộ tiêu chí chất lượng bệnh viện."
        icon="droplets"
      />
      <HandHygieneAuditsClient
        departments={(departmentsRes.data ?? []) as any}
        profiles={(profilesRes.data ?? []) as any}
        initialAudits={(auditsRes.data ?? []) as any}
        canManage={canManage}
      />
    </div>
  );
}
