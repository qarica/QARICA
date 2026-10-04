import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function loadItemVersionStatus(admin: ReturnType<typeof createAdminClient>, itemId: string, organizationId: string) {
  const { data: item } = await admin
    .from("hsba_checklist_items")
    .select("id,organization_id,checklist_version_id,hsba_checklist_versions(status,checklist_template_id,hsba_checklist_templates(organization_id))")
    .eq("id", itemId)
    .maybeSingle();
  if (!item || item.organization_id !== organizationId) return null;
  const version = (item as any).hsba_checklist_versions;
  if (!version) return { versionStatus: null as string | null };
  const template = version.hsba_checklist_templates;
  if (!template || template.organization_id !== organizationId) return null;
  return { versionStatus: version.status as string };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("hsba_audit.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const itemVersion = await loadItemVersionStatus(admin, id, organizationId);
  if (!itemVersion) return NextResponse.json({ error: "Không tìm thấy tiêu chí." }, { status: 404 });
  if (itemVersion.versionStatus && itemVersion.versionStatus !== "DRAFT") {
    return NextResponse.json({ error: "Chỉ được sửa tiêu chí khi phiên bản đang ở trạng thái Nháp." }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  if (body.content !== undefined) {
    const content = String(body.content || "").trim();
    if (!content) return NextResponse.json({ error: "Nội dung tiêu chí không được để trống." }, { status: 400 });
    update.content = content;
  }
  if (body.category !== undefined) update.category = body.category ? String(body.category).trim() || null : null;
  if (body.sort_order !== undefined) update.sort_order = Number(body.sort_order) || 0;
  if (body.is_active !== undefined) update.is_active = !!body.is_active;
  if (!Object.keys(update).length) return NextResponse.json({ error: "Không có thay đổi nào." }, { status: 400 });
  update.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from("hsba_checklist_items")
    .update(update)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select("id,content,category,sort_order,is_active,audit_type,checklist_version_id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Không tìm thấy tiêu chí." }, { status: 404 });
  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("hsba_audit.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const itemVersion = await loadItemVersionStatus(admin, id, organizationId);
  if (!itemVersion) return NextResponse.json({ error: "Không tìm thấy tiêu chí." }, { status: 404 });
  if (itemVersion.versionStatus && itemVersion.versionStatus !== "DRAFT") {
    return NextResponse.json({ error: "Chỉ được xoá tiêu chí khi phiên bản đang ở trạng thái Nháp." }, { status: 409 });
  }

  const { count, error: countError } = await admin
    .from("hsba_audit_item_results")
    .select("id", { count: "exact", head: true })
    .eq("checklist_item_id", id);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 400 });
  if (count) {
    return NextResponse.json(
      { error: `Tiêu chí này đã dùng trong ${count} lượt kiểm tra — ngừng sử dụng thay vì xoá.` },
      { status: 400 },
    );
  }

  const { error } = await admin.from("hsba_checklist_items").delete().eq("id", id).eq("organization_id", organizationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
