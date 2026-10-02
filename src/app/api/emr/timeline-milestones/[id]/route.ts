import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMR_CATEGORIES } from "@/lib/emr-categories";

const STATUSES = ["TODO", "IN_PROGRESS", "DONE", "BLOCKED"];

async function callerOrganizationId(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await admin.from("profiles").select("organization_id").eq("user_id", userId).maybeSingle();
  return data?.organization_id ?? null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("emr.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const organizationId = await callerOrganizationId(admin, auth.user.id);
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "Cần nhập tên đầu việc." }, { status: 400 });
  const status = String(body.status || "TODO");
  if (!STATUSES.includes(status)) return NextResponse.json({ error: "Trạng thái không hợp lệ." }, { status: 400 });
  const startDate = body.start_date ? String(body.start_date) : null;
  const endDate = body.end_date ? String(body.end_date) : null;
  const category = body.category ? String(body.category) : null;
  if (category && !EMR_CATEGORIES.some((c) => c.code === category)) return NextResponse.json({ error: "Danh mục EMR không hợp lệ." }, { status: 400 });

  const { data, error } = await admin
    .from("emr_timeline_milestones")
    .update({ title, start_date: startDate, end_date: endDate, status, category, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select("id,parent_id,title,start_date,end_date,status,category,sort_order,created_at")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Không tìm thấy đầu việc." }, { status: 404 });
  return NextResponse.json({ ok: true, milestone: data });
}

// Deleting a top-level "đầu việc lớn" cascades to its "đầu việc con" (FK
// on delete cascade) — a deliberate choice: a child never outlives the
// parent it was declared under.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("emr.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const organizationId = await callerOrganizationId(admin, auth.user.id);
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { error } = await admin.from("emr_timeline_milestones").delete().eq("id", id).eq("organization_id", organizationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
