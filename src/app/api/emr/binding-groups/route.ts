import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireApiPermission("emr.view");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data, error } = await admin.from("emr_binding_groups").select("id,name,code,sort_order,is_active").eq("organization_id", organizationId).order("sort_order").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, groups: data ?? [] });
}

// Declaring a new "Nhóm gáy" is a one-time master-data entry (the catalog),
// separate from assigning it to any particular Biểu mẫu item.
export async function POST(request: Request) {
  const auth = await requireApiPermission("emr.manage");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Tên nhóm gáy không được để trống." }, { status: 400 });
  // Mã nhóm (vd số La Mã "V") tách riêng khỏi tên đầy đủ — tùy chọn, không
  // bắt buộc theo đúng cách name/sort_order đã tùy chọn trước đó.
  const code = body.code !== undefined ? String(body.code || "").trim() || null : null;

  const { count } = await admin.from("emr_binding_groups").select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
  const { data, error } = await admin
    .from("emr_binding_groups")
    .upsert({ organization_id: organizationId, name, code, sort_order: count ?? 0, created_by: auth.user.id }, { onConflict: "organization_id,name", ignoreDuplicates: true })
    .select("id,name,code,sort_order,is_active")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (data) return NextResponse.json({ ok: true, group: data });

  // ignoreDuplicates swallows the row on a pre-existing name — look it up so
  // the caller still gets back a usable id (declaring an already-declared
  // name is a no-op, not an error).
  const existing = await admin.from("emr_binding_groups").select("id,name,code,sort_order,is_active").eq("organization_id", organizationId).eq("name", name).maybeSingle();
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 400 });
  return NextResponse.json({ ok: true, group: existing.data });
}
