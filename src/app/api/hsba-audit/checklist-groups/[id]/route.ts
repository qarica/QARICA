import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function loadGroup(admin: ReturnType<typeof createAdminClient>, id: string, organizationId: string) {
  const { data, error } = await admin
    .from("hsba_checklist_groups")
    .select("id,organization_id,checklist_version_id,hsba_checklist_versions!inner(status)")
    .eq("id", id).eq("organization_id", organizationId).maybeSingle();
  if (error || !data) return null;
  return { row: data, status: (data as any).hsba_checklist_versions?.status as string };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("hsba_audit.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error } = await callerOrganizationId(admin, auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });
  const group = await loadGroup(admin, id, organizationId);
  if (!group) return NextResponse.json({ error: "Không tìm thấy nhóm." }, { status: 404 });
  if (group.status !== "DRAFT") return NextResponse.json({ error: "Chỉ được sửa nhóm trong phiên bản Nháp." }, { status: 409 });
  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    const name = String(body.name || "").trim();
    if (!name || name.length > 200) return NextResponse.json({ error: "Tên nhóm không hợp lệ." }, { status: 400 });
    update.name = name;
  }
  if (body.sort_order !== undefined) update.sort_order = Number(body.sort_order) || 0;
  if (body.is_active !== undefined) update.is_active = body.is_active === true;
  if (Object.keys(update).length === 1) return NextResponse.json({ error: "Không có thay đổi nào." }, { status: 400 });
  const { data, error: updateError } = await admin.from("hsba_checklist_groups").update(update)
    .eq("id", id).eq("organization_id", organizationId)
    .select("id,name,sort_order,is_active,checklist_version_id").single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
  return NextResponse.json({ ok: true, group: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("hsba_audit.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error } = await callerOrganizationId(admin, auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });
  const group = await loadGroup(admin, id, organizationId);
  if (!group) return NextResponse.json({ error: "Không tìm thấy nhóm." }, { status: 404 });
  if (group.status !== "DRAFT") return NextResponse.json({ error: "Chỉ được xoá nhóm trong phiên bản Nháp." }, { status: 409 });
  const { count, error: countError } = await admin.from("hsba_checklist_items").select("id", { count: "exact", head: true }).eq("group_id", id);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 400 });
  if (count) return NextResponse.json({ error: `Nhóm còn ${count} tiêu chí. Chuyển tiêu chí sang nhóm khác hoặc bỏ phân nhóm trước khi xoá.` }, { status: 409 });
  const { error: deleteError } = await admin.from("hsba_checklist_groups").delete().eq("id", id).eq("organization_id", organizationId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
