import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function loadItemOrganization(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { data, error } = await admin.from("emr_rollout_items").select("id,organization_id").eq("id", id).maybeSingle();
  return { data, error };
}

async function callerOrganizationId(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin.from("profiles").select("organization_id").eq("user_id", userId).maybeSingle();
  return { organizationId: data?.organization_id ?? null, error };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: existing, error: existingError } = await loadItemOrganization(admin, id);
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 400 });
  if (!existing || existing.organization_id !== organizationId) return NextResponse.json({ error: "Không tìm thấy mục này." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_by: auth.user.id, updated_at: new Date().toISOString() };
  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) return NextResponse.json({ error: "Tiêu đề không được để trống." }, { status: 400 });
    patch.title = title;
  }
  if (typeof body.description === "string" || body.description === null) patch.description = body.description ? String(body.description).trim() : null;
  if (typeof body.status === "string") {
    if (!["TODO", "IN_PROGRESS", "DONE", "BLOCKED"].includes(body.status)) return NextResponse.json({ error: "Trạng thái không hợp lệ." }, { status: 400 });
    patch.status = body.status;
  }

  const { data, error } = await admin
    .from("emr_rollout_items")
    .update(patch)
    .eq("id", id)
    .select("id,category,title,description,status,created_at,updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: existing, error: existingError } = await loadItemOrganization(admin, id);
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 400 });
  if (!existing || existing.organization_id !== organizationId) return NextResponse.json({ error: "Không tìm thấy mục này." }, { status: 404 });

  const { error } = await admin.from("emr_rollout_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
