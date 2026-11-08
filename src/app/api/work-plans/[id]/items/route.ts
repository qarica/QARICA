import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ITEM_SELECT = "id,work_plan_id,title,why_text,where_text,how_text,due_date,eisenhower_quadrant,status,created_at,updated_at";
const RACI_ROLES = ["R", "A", "C", "I"];

// RACI: đúng 1 người A (chịu trách nhiệm chính), ít nhất 1 người R (thực
// hiện) — nguyên tắc cốt lõi của RACI (xem bảng tổng hợp yêu cầu tường
// minh). Không khả thi làm declarative constraint trên nhiều dòng bằng SQL
// check constraint thường nên validate ở đây, trước khi ghi.
function validateRaci(raci: unknown): { ok: true; rows: { user_id: string; raci_role: string }[] } | { ok: false; error: string } {
  if (!Array.isArray(raci) || !raci.length) return { ok: false, error: "Chưa gán vai trò RACI nào cho đầu việc." };
  const rows: { user_id: string; raci_role: string }[] = [];
  for (const entry of raci) {
    const userId = String((entry as any)?.user_id || "").trim();
    const role = String((entry as any)?.raci_role || "").trim().toUpperCase();
    if (!userId) return { ok: false, error: "Thiếu người được gán vai trò RACI." };
    if (!RACI_ROLES.includes(role)) return { ok: false, error: `Vai trò RACI không hợp lệ: ${role}.` };
    rows.push({ user_id: userId, raci_role: role });
  }
  const accountableCount = rows.filter((r) => r.raci_role === "A").length;
  if (accountableCount !== 1) return { ok: false, error: "Mỗi đầu việc phải có đúng 1 người chữ A (chịu trách nhiệm chính)." };
  const responsibleCount = rows.filter((r) => r.raci_role === "R").length;
  if (responsibleCount < 1) return { ok: false, error: "Mỗi đầu việc phải có ít nhất 1 người chữ R (thực hiện)." };
  return { ok: true, rows };
}

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

  const raciCheck = validateRaci(body.raci);
  if (!raciCheck.ok) return NextResponse.json({ error: raciCheck.error }, { status: 400 });

  // Mọi người được gán phải thuộc đúng tổ chức — không nhận thẳng user_id từ
  // client mà không kiểm tra (CLAUDE.md: đã từng là lỗ hổng ở module khác).
  const userIds = Array.from(new Set(raciCheck.rows.map((r) => r.user_id)));
  const { data: validProfiles } = await admin.from("profiles").select("user_id").eq("organization_id", organizationId).in("user_id", userIds);
  const validUserIds = new Set((validProfiles ?? []).map((p) => p.user_id));
  const invalidUserId = userIds.find((uid) => !validUserIds.has(uid));
  if (invalidUserId) return NextResponse.json({ error: "Có người được gán không thuộc tổ chức của bạn." }, { status: 400 });

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
    })
    .select(ITEM_SELECT)
    .single();
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 400 });

  const { data: raciRows, error: raciError } = await admin
    .from("work_plan_item_raci")
    .insert(raciCheck.rows.map((r) => ({ work_plan_item_id: item.id, organization_id: organizationId, user_id: r.user_id, raci_role: r.raci_role })))
    .select("id,work_plan_item_id,user_id,raci_role");
  if (raciError) {
    // Bù trừ: xoá đầu việc vừa tạo nếu không gán được RACI, tránh để lại 1
    // đầu việc thiếu RACI (vi phạm đúng nguyên tắc RACI vừa validate ở trên).
    await admin.from("work_plan_items").delete().eq("id", item.id);
    return NextResponse.json({ error: raciError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, item: { ...item, raci: raciRows ?? [] } });
}
