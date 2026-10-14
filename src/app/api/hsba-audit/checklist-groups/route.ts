import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function draftVersion(admin: ReturnType<typeof createAdminClient>, versionId: string, organizationId: string) {
  const { data, error } = await admin
    .from("hsba_checklist_versions")
    .select("id,status,hsba_checklist_templates!inner(organization_id)")
    .eq("id", versionId)
    .maybeSingle();
  if (error || !data) return null;
  const template = (data as any).hsba_checklist_templates;
  if (template?.organization_id !== organizationId || data.status !== "DRAFT") return null;
  return data;
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("hsba_audit.manage");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error } = await callerOrganizationId(admin, auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const versionId = String(body.checklist_version_id || "").trim();
  const name = String(body.name || "").trim();
  if (!versionId || !name) return NextResponse.json({ error: "Thiếu phiên bản hoặc tên nhóm." }, { status: 400 });
  if (name.length > 200) return NextResponse.json({ error: "Tên nhóm tối đa 200 ký tự." }, { status: 400 });
  if (!(await draftVersion(admin, versionId, organizationId))) return NextResponse.json({ error: "Chỉ được sửa nhóm trong phiên bản Nháp." }, { status: 409 });
  const { count } = await admin.from("hsba_checklist_groups").select("id", { count: "exact", head: true }).eq("checklist_version_id", versionId);
  const { data, error: insertError } = await admin.from("hsba_checklist_groups")
    .insert({ organization_id: organizationId, checklist_version_id: versionId, name, sort_order: count ?? 0 })
    .select("id,name,sort_order,is_active,checklist_version_id").single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });
  return NextResponse.json({ ok: true, group: data });
}
