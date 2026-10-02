import { PageHeader } from "@/components/page-header";
import { ProcedureTrainingsClient } from "@/components/procedure-trainings-client";
import { hasPermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ProcedureTrainingsPage() {
  const { user } = await requireUserContext();
  const canManage = hasPermission(user, "procedure_training.manage");
  const supabase = await createClient();

  const { data } = await supabase
    .from("procedure_trainings")
    .select(
      "id,procedure_code,procedure_name,drafting_unit,effective_date,trainer,session_1_time,session_1_location,session_1_method,status,feedback_qlcl,session_2_time,session_2_location,session_2_method,notes",
    )
    .eq("organization_id", user.organizationId)
    .order("created_at", { ascending: false })
    .limit(300);

  return (
    <div className="page-stack procedure-trainings-page">
      <PageHeader
        eyebrow="Điều hành chất lượng"
        title="Theo dõi quy trình đào tạo"
        description="Theo dõi việc phổ biến/đào tạo quy trình, biểu mẫu mới ban hành cho các đơn vị — đào tạo lần 1 và lần 2 nếu cần đào tạo lại."
        icon="list-checks"
      />
      <ProcedureTrainingsClient initialTrainings={(data ?? []) as any} canManage={canManage} />
    </div>
  );
}
