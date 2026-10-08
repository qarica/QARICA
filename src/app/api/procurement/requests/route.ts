import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requireApiPermission("procurement.view");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const status = new URL(request.url).searchParams.get("status");
  let query = admin
    .from("procurement_requests")
    .select(
      "id,department_id,request_type,urgency,title,description,quantity,unit_price,estimated_cost,submitted_by,submitted_at,status,bgd_decided_at,bgd_note,tgd_decided_at,tgd_note,notified_at",
    )
    .eq("organization_id", organizationId)
    .order("submitted_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, requests: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("procurement.manage");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const departmentId = String(body.department_id || "").trim();
  const requestType = ["NEW_PURCHASE", "REPAIR", "TRANSFER"].includes(body.request_type) ? body.request_type : null;
  const title = String(body.title || "").trim();
  if (!departmentId) return NextResponse.json({ error: "Chưa chọn khoa/phòng đề xuất." }, { status: 400 });
  if (!requestType) return NextResponse.json({ error: "Loại đề xuất không hợp lệ." }, { status: 400 });
  if (!title) return NextResponse.json({ error: "Tên đề xuất không được để trống." }, { status: 400 });

  const { data: department } = await admin.from("departments").select("id").eq("id", departmentId).eq("organization_id", organizationId).eq("is_active", true).maybeSingle();
  if (!department) return NextResponse.json({ error: "Khoa/phòng đề xuất không hợp lệ." }, { status: 400 });

  const quantity = body.quantity !== undefined && body.quantity !== null && body.quantity !== "" ? Number(body.quantity) : null;
  const unitPrice = body.unit_price !== undefined && body.unit_price !== null && body.unit_price !== "" ? Number(body.unit_price) : null;
  if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) return NextResponse.json({ error: "Số lượng không hợp lệ." }, { status: 400 });
  if (unitPrice !== null && (!Number.isFinite(unitPrice) || unitPrice < 0)) return NextResponse.json({ error: "Đơn giá không hợp lệ." }, { status: 400 });
  const estimatedCost = quantity !== null && unitPrice !== null ? quantity * unitPrice : null;

  const { data, error } = await admin
    .from("procurement_requests")
    .insert({
      organization_id: organizationId,
      department_id: departmentId,
      request_type: requestType,
      urgency: body.urgency === "URGENT" ? "URGENT" : "NORMAL",
      title,
      description: body.description ? String(body.description).trim() || null : null,
      quantity,
      unit_price: unitPrice,
      estimated_cost: estimatedCost,
      submitted_by: auth.user.id,
      status: "SUBMITTED",
    })
    .select(
      "id,department_id,request_type,urgency,title,description,quantity,unit_price,estimated_cost,submitted_by,submitted_at,status,bgd_decided_at,bgd_note,tgd_decided_at,tgd_note,notified_at",
    )
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "procurement_requests",
    row_id: data.id,
    action_type: "PROCUREMENT_REQUEST_CREATE",
    new_value: { title: data.title, request_type: data.request_type, department_id: data.department_id, estimated_cost: data.estimated_cost },
    request_meta: { source: "qlcl-ui" },
  });
  if (auditError) return NextResponse.json({ error: `Đã lưu nhưng không ghi được audit trail: ${auditError.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, request: data });
}
