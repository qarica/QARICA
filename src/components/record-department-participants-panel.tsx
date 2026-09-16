import { RecordDepartmentParticipantsClient } from "@/components/record-department-participants-client";
import { requireUserContext } from "@/lib/auth";
import { canManageRecordDepartments } from "@/lib/record-department-policy";
import { createClient } from "@/lib/supabase/server";

export async function RecordDepartmentParticipantsPanel({
  recordId,
  recordType,
  lifecycleStatus,
  primaryDepartmentId,
  primaryDepartmentName,
}: {
  recordId: string;
  recordType: string;
  lifecycleStatus: string;
  primaryDepartmentId?: string | null;
  primaryDepartmentName: string;
}) {
  const { user } = await requireUserContext();
  const supabase = await createClient();
  const canManage = canManageRecordDepartments(user.permissions, recordType);
  const [participantsRes, departmentsRes] = await Promise.all([
    supabase.from("record_department_participants").select("id,department_id,participant_role,participation_scope,created_at").eq("record_id", recordId).order("created_at"),
    canManage ? supabase.from("departments").select("id,name,short_name").eq("is_active", true).order("name") : Promise.resolve({ data: [], error: null }),
  ] as any);

  if (participantsRes.error) {
    const missingTable = ["42P01", "PGRST205"].includes(String(participantsRes.error.code || ""));
    if (missingTable) return null;
    return <section className="panel"><div className="alert error" style={{ margin: 18 }}>Không tải được đơn vị tham gia: {participantsRes.error.message}</div></section>;
  }

  const rows = (participantsRes.data ?? []) as any[];
  const departmentIds = Array.from(new Set(rows.map((row) => String(row.department_id || "")).filter(Boolean)));
  const namesRes = departmentIds.length ? await supabase.from("departments").select("id,name,short_name").in("id", departmentIds) : { data: [], error: null };
  const nameMap = new Map((namesRes.data ?? []).map((department: any) => [String(department.id), String(department.short_name || department.name || "Khoa/Phòng")]));
  const participants = rows.map((row) => ({ ...row, department_name: nameMap.get(String(row.department_id)) || "Khoa/Phòng" }));
  const departments = ((departmentsRes.data ?? []) as any[]).filter((department) => department.id !== primaryDepartmentId && !departmentIds.includes(String(department.id)));

  return <RecordDepartmentParticipantsClient
    recordId={recordId}
    recordType={recordType}
    lifecycleStatus={lifecycleStatus}
    primaryDepartmentName={primaryDepartmentName}
    departments={departments}
    participants={participants as any[]}
    canManage={canManage}
  />;
}
