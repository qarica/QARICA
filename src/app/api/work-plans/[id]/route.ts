import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT_COLUMNS = "id,title,smart_measurable,target_date,status,created_by,created_at,updated_at";
const EDITABLE_FIELDS = ["title", "smart_measurable", "target_date", "status"];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("work_plans.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] === undefined) continue;
    if (field === "status") {
      if (!["OPEN", "DONE", "CANCELLED"].includes(body.status)) {
        return NextResponse.json({ error: "Trạng thái không hợp lệ." }, { status: 400 });
      }
      update.status = body.status;
    } else if (field === "title") {
      const title = String(body.title || "").trim();
      if (!title) return NextResponse.json({ error: "Chưa nhập mục tiêu kế hoạch." }, { status: 400 });
      update.title = title;
    } else {
      update[field] = body[field] ? String(body[field]).trim() || null : null;
    }
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: "Không có thay đổi nào." }, { status: 400 });
  update.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from("work_plans")
    .update(update)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Không tìm thấy kế hoạch." }, { status: 404 });
  return NextResponse.json({ ok: true, plan: data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("work_plans.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  // on delete cascade đã xoá kèm work_plan_items/work_plan_item_raci (xem migration).
  const { error, count } = await admin
    .from("work_plans")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("organization_id", organizationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!count) return NextResponse.json({ error: "Không tìm thấy kế hoạch." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
