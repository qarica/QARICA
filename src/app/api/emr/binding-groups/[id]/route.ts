import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function callerOrganizationId(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await admin.from("profiles").select("organization_id").eq("user_id", userId).maybeSingle();
  return data?.organization_id ?? null;
}

// Updates sort_order and/or the group's own name. A rename cascades to every
// BIEU_MAU item of this org still storing the OLD name as free text in
// details.binding_group — otherwise those forms would silently fall back to
// "Chưa phân nhóm" the moment the catalog name changes underneath them.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("emr.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const organizationId = await callerOrganizationId(admin, auth.user.id);
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  if (body.sort_order !== undefined) {
    const sortOrder = Number(body.sort_order);
    if (!Number.isFinite(sortOrder)) return NextResponse.json({ error: "Số thứ tự không hợp lệ." }, { status: 400 });
    update.sort_order = sortOrder;
  }

  const { data: current, error: currentError } = await admin.from("emr_binding_groups").select("id,name").eq("id", id).eq("organization_id", organizationId).maybeSingle();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 400 });
  if (!current) return NextResponse.json({ error: "Không tìm thấy nhóm gáy." }, { status: 404 });

  let newName: string | null = null;
  if (body.name !== undefined) {
    newName = String(body.name || "").trim();
    if (!newName) return NextResponse.json({ error: "Tên nhóm gáy không được để trống." }, { status: 400 });
    if (newName !== current.name) {
      const { data: conflict } = await admin.from("emr_binding_groups").select("id").eq("organization_id", organizationId).eq("name", newName).maybeSingle();
      if (conflict) return NextResponse.json({ error: "Đã có nhóm gáy khác dùng tên này." }, { status: 400 });
      update.name = newName;
    }
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true, group: current });

  const { data, error } = await admin
    .from("emr_binding_groups")
    .update(update)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select("id,name,sort_order")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Không tìm thấy nhóm gáy." }, { status: 404 });

  if (newName && newName !== current.name) {
    const { data: affected } = await admin
      .from("emr_rollout_items")
      .select("id,details")
      .eq("organization_id", organizationId)
      .eq("category", "BIEU_MAU")
      .filter("details->>binding_group", "eq", current.name);
    for (const item of affected ?? []) {
      await admin.from("emr_rollout_items").update({ details: { ...(item.details as Record<string, unknown>), binding_group: newName } }).eq("id", item.id);
    }
  }

  return NextResponse.json({ ok: true, group: data });
}
