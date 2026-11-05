import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const STATUS_LABEL: Record<string, string> = { IN_USE: "Đang sử dụng", MAINTENANCE: "Bảo trì/Sửa chữa", INACTIVE: "Ngưng sử dụng" };

export async function GET() {
  const auth = await requireApiPermission("medical_equipment.view");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: equipment, error } = await admin
    .from("medical_equipment")
    .select("sequence_no,equipment_name,model_code,manufacturer,origin_country,year_manufactured,year_in_use,machine_code,registration_number,contract_from,contract_to,valid_from,department_id,department_label,status,risk_classification,notes")
    .eq("organization_id", organizationId)
    .order("sequence_no", { ascending: true, nullsFirst: false })
    .order("equipment_name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const departmentIds = Array.from(new Set((equipment ?? []).map((e) => e.department_id).filter(Boolean)));
  const departmentsRes = departmentIds.length ? await admin.from("departments").select("id,name").in("id", departmentIds) : { data: [] as any[] };
  const departmentName = new Map((departmentsRes.data ?? []).map((d: any) => [d.id, d.name]));

  const headers = ["STT", "Tên thiết bị", "Ký hiệu/Model", "Hãng SX", "Nước SX", "Năm SX", "Năm SD", "Mã máy", "Số lưu hành", "Hợp đồng từ", "Hợp đồng đến", "Hiệu lực từ", "Khoa sử dụng", "Trạng thái", "Phân loại TTBYT", "Ghi chú"];
  const lines = [headers.map(csvCell).join(",")];
  for (const e of equipment ?? []) {
    lines.push(
      [
        e.sequence_no ?? "",
        e.equipment_name,
        e.model_code ?? "",
        e.manufacturer ?? "",
        e.origin_country ?? "",
        e.year_manufactured ?? "",
        e.year_in_use ?? "",
        e.machine_code ?? "",
        e.registration_number ?? "",
        e.contract_from ?? "",
        e.contract_to ?? "",
        e.valid_from ?? "",
        (e.department_id ? departmentName.get(e.department_id) : e.department_label) || "",
        STATUS_LABEL[e.status] || e.status,
        e.risk_classification ?? "",
        e.notes ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const bom = "﻿";
  return new NextResponse(bom + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="so-quan-ly-ttbyt.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
