import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ITEM_SELECT = "id,work_plan_id,title,why_text,where_text,how_text,due_date,eisenhower_quadrant,status,assignee_user_id,created_at,updated_at";
const EDITABLE_FIELDS = ["title", "why_text", "where_text", "how_text", "due_date", "eisenhower_quadrant", "status", "assignee_user_id"];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const auth = await requireApiPermission("work_plans.manage");
  if (!auth.ok) return auth.response;
  const { id: planId, itemId } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] === undefined) continue;
    if (field === "status") {
      if (!["OPEN", "DONE", "CANCELLED"].includes(body.status)) return NextResponse.json({ error: "Trạng thái không hợp lệ." }, { status: 400 });
      update.status = body.status;
    } else if (field === "eisenhower_quadrant") {
      const quadrant = String(body.eisenhower_quadrant || "").trim().toUpperCase();
      if (!["P1", "P2", "P3", "P4"].includes(quadrant)) return NextResponse.json({ error: "Phân loại Eisenhower không hợp lệ." }, { status: 400 });
      update.eisenhower_quadrant = quadrant;
    } else if (field === "title") {
      const title = String(body.title || "").trim();
      if (!title) return NextResponse.json({ error: "Chưa nhập nội dung đầu việc." }, { status: 400 });
      update.title = title;
    } else if (field === "assignee_user_id") {
      const assigneeId = String(body.assignee_user_id || "").trim();
      if (!assigneeId) return NextResponse.json({ error: "Chưa chọn người phụ trách." }, { status: 400 });
      const { data: assignee } = await admin.from("profiles").select("user_id").eq("organization_id", organizationId).eq("user_id", assigneeId).eq("is_active", true).maybeSingle();
      if (!assignee) return NextResponse.json({ error: "Người phụ trách không thuộc tổ chức của bạn." }, { status: 400 });
      update.assignee_user_id = assigneeId;
    } else if (field === "due_date") {
      update.due_date = body.due_date || null;
    } else {
      update[field] = body[field] ? String(body[field]).trim() || null : null;
    }
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: "Không có thay đổi nào." }, { status: 400 });
  update.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from("work_plan_items")
    .update(update)
    .eq("id", itemId)
    .eq("work_plan_id", planId)
    .eq("organization_id", organizationId)
    .select(ITEM_SELECT)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Không tìm thấy đầu việc." }, { status: 404 });
  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const auth = await requireApiPermission("work_plans.manage");
  if (!auth.ok) return auth.response;
  const { id: planId, itemId } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { error, count } = await admin
    .from("work_plan_items")
    .delete({ count: "exact" })
    .eq("id", itemId)
    .eq("work_plan_id", planId)
    .eq("organization_id", organizationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!count) return NextResponse.json({ error: "Không tìm thấy đầu việc." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
