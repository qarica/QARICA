import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function callerOrganizationId(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await admin.from("profiles").select("organization_id").eq("user_id", userId).maybeSingle();
  return data?.organization_id ?? null;
}

export async function GET() {
  const auth = await requireApiPermission("emr.view");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const organizationId = await callerOrganizationId(admin, auth.user.id);
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data, error } = await admin.from("emr_binding_groups").select("id,name").eq("organization_id", organizationId).order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, groups: data ?? [] });
}

// Declaring a new "Nhóm gáy" is a one-time master-data entry (the catalog),
// separate from assigning it to any particular Biểu mẫu item.
export async function POST(request: Request) {
  const auth = await requireApiPermission("emr.manage");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const organizationId = await callerOrganizationId(admin, auth.user.id);
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Tên nhóm gáy không được để trống." }, { status: 400 });

  const { data, error } = await admin
    .from("emr_binding_groups")
    .upsert({ organization_id: organizationId, name, created_by: auth.user.id }, { onConflict: "organization_id,name", ignoreDuplicates: true })
    .select("id,name")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (data) return NextResponse.json({ ok: true, group: data });

  // ignoreDuplicates swallows the row on a pre-existing name — look it up so
  // the caller still gets back a usable id (declaring an already-declared
  // name is a no-op, not an error).
  const existing = await admin.from("emr_binding_groups").select("id,name").eq("organization_id", organizationId).eq("name", name).maybeSingle();
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 400 });
  return NextResponse.json({ ok: true, group: existing.data });
}
