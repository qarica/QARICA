import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { MedicalEquipmentDetailClient } from "@/components/medical-equipment-detail-client";
import { hasPermission, requirePermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function MedicalEquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUserContext();
  requirePermission(user, "medical_equipment.view");
  const canManage = hasPermission(user, "medical_equipment.manage");
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: equipment }, departmentsRes, eventsRes] = await Promise.all([
    supabase
      .from("medical_equipment")
      .select("id,sequence_no,equipment_name,model_code,manufacturer,origin_country,year_manufactured,year_in_use,machine_code,registration_number,contract_from,contract_to,valid_from,department_id,department_label,notes,status")
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .maybeSingle(),
    supabase.from("departments").select("id,name").eq("organization_id", user.organizationId).eq("is_active", true).order("name"),
    supabase
      .from("medical_equipment_events")
      .select("id,equipment_id,event_type,to_department_id,event_date,note,created_by,created_at")
      .eq("equipment_id", id)
      .order("event_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  if (!equipment) notFound();

  const creatorIds = Array.from(new Set((eventsRes.data ?? []).map((e: any) => e.created_by).filter(Boolean)));
  const profilesRes = creatorIds.length ? await supabase.from("profiles").select("user_id,full_name,email").in("user_id", creatorIds) : { data: [] as any[] };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="SỔ QUẢN LÝ TTBYT"
        title={equipment.equipment_name}
        description="Thông tin thiết bị, mã QR tra cứu nhanh và lịch sử bàn giao/bảo trì."
        icon="network"
      />
      <MedicalEquipmentDetailClient
        equipment={equipment as any}
        departments={(departmentsRes.data ?? []) as any[]}
        initialEvents={(eventsRes.data ?? []) as any[]}
        profiles={(profilesRes.data ?? []) as any[]}
        canManage={canManage}
      />
    </div>
  );
}
