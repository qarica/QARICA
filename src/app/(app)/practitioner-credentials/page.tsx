import { PageHeader } from "@/components/page-header";
import { PractitionerCredentialsClient } from "@/components/practitioner-credentials-client";
import { hasPermission, requirePermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const SELECT =
  "id,department_id,full_name,date_of_birth,gender,national_id,phone,email,license_type,license_number,license_issued_at,license_issued_by,professional_title,display_title,scope_of_practice,proposed_technique,registration_date,decision_no,decision_signed_at,decision_signed_by,decision_status,decision_file_path,decision_file_name,decision_verified_at,decision_verified_by,practice_status_note,license_expiry_date,notes,created_at,updated_at,practitioner_credential_documents(id,document_type,title,specialization,document_no,issued_at,issued_by,note)";

export default async function PractitionerCredentialsPage() {
  const { user } = await requireUserContext();
  requirePermission(user, "practitioner_credentials.view");
  const canManage = hasPermission(user, "practitioner_credentials.manage");
  const supabase = await createClient();

  const [departmentsRes, credentialsRes] = await Promise.all([
    supabase.from("departments").select("id,name").eq("organization_id", user.organizationId).eq("is_active", true).order("name"),
    supabase.from("practitioner_credentials").select(SELECT).eq("organization_id", user.organizationId).order("full_name"),
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        title="Hồ sơ năng lực hành nghề"
        description="GPHN/CCHN, văn bằng, chứng chỉ, phạm vi hành nghề của nhân viên y tế — soạn nhanh Quyết định phân công, thay cho bước copy tay sang công cụ AI bên ngoài."
        icon="folder-check"
      />
      <PractitionerCredentialsClient
        departments={(departmentsRes.data ?? []) as any}
        initialCredentials={(credentialsRes.data ?? []) as any}
        canManage={canManage}
      />
    </div>
  );
}
