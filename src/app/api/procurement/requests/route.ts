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
      "id,department_id,request_type,urgency,title,description,submitted_by,submitted_at,status,bgd_decided_at,bgd_note,tgd_decided_at,tgd_note,notified_at",
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

  const { data, error } = await admin
    .from("procurement_requests")
    .insert({
      organization_id: organizationId,
      department_id: departmentId,
      request_type: requestType,
      urgency: body.urgency === "URGENT" ? "URGENT" : "NORMAL",
      title,
      description: body.description ? String(body.description).trim() || null : null,
      submitted_by: auth.user.id,
      status: "SUBMITTED",
    })
    .select(
      "id,department_id,request_type,urgency,title,description,submitted_by,submitted_at,status,bgd_decided_at,bgd_note,tgd_decided_at,tgd_note,notified_at",
    )
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, request: data });
}
