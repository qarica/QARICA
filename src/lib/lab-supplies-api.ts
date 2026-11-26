import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Cột trả về cho danh mục/sổ — dùng chung giữa API và trang để form → body →
// API → SELECT luôn khớp (CLAUDE.md nguyên tắc 5).
export const ITEM_SELECT = "id,code,barcode,name,category,unit,manufacturer,storage_condition,min_stock,expiry_warning_days,is_active,notes,created_at,updated_at";
export const MOVEMENT_SELECT =
  "id,item_id,lot_id,movement_type,quantity_delta,movement_date,reference_no,counterparty,reason_code,note,stocktake_id,system_quantity,counted_quantity,created_by,created_at,item:lab_supply_items(code,name,unit),lot:lab_supply_lots(lot_number,expiry_date)";
export const LOT_BALANCE_SELECT = "lot_id,item_id,lot_number,expiry_date,created_at,balance";

export const clean = (value: unknown) => String(value ?? "").trim();
/** Mã vạch tuỳ chọn: tối đa 64 ký tự, không chứa ký tự điều khiển. Trả về { value } hoặc { error }. */
export function parseBarcode(raw: unknown): { value: string | null } | { error: string } {
  const value = String(raw ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!value) return { value: null };
  if (value.length > 64) return { error: "Mã vạch tối đa 64 ký tự." };
  return { value };
}

export const cleanOrNull = (value: unknown) => clean(value) || null;

/** Xác thực quyền + lấy tổ chức của người gọi (fail-closed). */
export async function labSuppliesContext(permission: "lab_supplies.view" | "lab_supplies.manage") {
  const auth = await requireApiPermission(permission);
  if (!auth.ok) return { ok: false as const, response: auth.response };
  const admin = createAdminClient();
  const { organizationId, error } = await callerOrganizationId(admin, auth.user.id);
  if (error) return { ok: false as const, response: NextResponse.json({ error: error.message }, { status: 400 }) };
  if (!organizationId) return { ok: false as const, response: NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 }) };
  return { ok: true as const, admin, organizationId, userId: auth.user.id };
}

export async function writeAudit(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  tableName: string,
  rowId: string | null,
  actionType: string,
  newValue: unknown,
  reason: string,
) {
  await admin.from("audit_logs").insert({
    actor_user_id: userId,
    table_name: tableName,
    row_id: rowId,
    action_type: actionType,
    new_value: newValue,
    reason,
    request_meta: { source: "qlcl-ui" },
  });
}
