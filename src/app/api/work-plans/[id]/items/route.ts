import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ITEM_SELECT = "id,work_plan_id,title,why_text,where_text,how_text,due_date,eisenhower_quadrant,status,assignee_user_id,created_at,updated_at";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("work_plans.manage");
  if (!auth.ok) return auth.response;
  const { id: planId } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: plan } = await admin.from("work_plans").select("id").eq("id", planId).eq("organization_id", organizationId).maybeSingle();
  if (!plan) return NextResponse.json({ error: "Không tìm thấy kế hoạch." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "Chưa nhập nội dung đầu việc (What)." }, { status: 400 });
  const quadrant = String(body.eisenhower_quadrant || "P2").trim().toUpperCase();
  if (!["P1", "P2", "P3", "P4"].includes(quadrant)) return NextResponse.json({ error: "Phân loại Eisenhower không hợp lệ." }, { status: 400 });

  // Mỗi đầu việc có đúng 1 người phụ trách, phải thuộc đúng tổ chức — không nhận
  // thẳng user_id từ client mà không kiểm tra.
  const assigneeId = String(body.assignee_user_id || "").trim();
  if (!assigneeId) return NextResponse.json({ error: "Chưa chọn người phụ trách đầu việc." }, { status: 400 });
  const { data: assignee } = await admin.from("profiles").select("user_id").eq("organization_id", organizationId).eq("user_id", assigneeId).eq("is_active", true).maybeSingle();
  if (!assignee) return NextResponse.json({ error: "Người phụ trách không thuộc tổ chức của bạn." }, { status: 400 });

  const { data: item, error: itemError } = await admin
    .from("work_plan_items")
    .insert({
      work_plan_id: planId,
      organization_id: organizationId,
      title,
      why_text: body.why_text ? String(body.why_text).trim() || null : null,
      where_text: body.where_text ? String(body.where_text).trim() || null : null,
      how_text: body.how_text ? String(body.how_text).trim() || null : null,
      due_date: body.due_date || null,
      eisenhower_quadrant: quadrant,
      assignee_user_id: assigneeId,
    })
    .select(ITEM_SELECT)
    .single();
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 400 });

  return NextResponse.json({ ok: true, item });
}
