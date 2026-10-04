import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function loadVersionForOrg(admin: ReturnType<typeof createAdminClient>, versionId: string, organizationId: string) {
  const { data: version, error } = await admin
    .from("hsba_checklist_versions")
    .select("id,status,checklist_template_id,hsba_checklist_templates!inner(id,organization_id,audit_type)")
    .eq("id", versionId)
    .maybeSingle();
  if (error || !version) return null;
  const template = (version as any).hsba_checklist_templates;
  if (!template || template.organization_id !== organizationId) return null;
  return { id: version.id, status: version.status as string, auditType: template.audit_type as string };
}

export async function GET(request: Request) {
  const auth = await requireApiPermission("hsba_audit.view");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const versionId = new URL(request.url).searchParams.get("checklist_version_id");
  if (!versionId) return NextResponse.json({ error: "Thiếu phiên bản bảng kiểm." }, { status: 400 });
  const version = await loadVersionForOrg(admin, versionId, organizationId);
  if (!version) return NextResponse.json({ error: "Không tìm thấy phiên bản bảng kiểm." }, { status: 404 });

  const { data, error } = await admin
    .from("hsba_checklist_items")
    .select("id,content,category,sort_order,is_active,audit_type,checklist_version_id")
    .eq("checklist_version_id", versionId)
    .order("sort_order")
    .order("content");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("hsba_audit.manage");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const versionId = String(body.checklist_version_id || "").trim();
  const content = String(body.content || "").trim();
  if (!versionId) return NextResponse.json({ error: "Thiếu phiên bản bảng kiểm." }, { status: 400 });
  if (!content) return NextResponse.json({ error: "Nội dung tiêu chí không được để trống." }, { status: 400 });
  const category = body.category ? String(body.category).trim() || null : null;

  const version = await loadVersionForOrg(admin, versionId, organizationId);
  if (!version) return NextResponse.json({ error: "Không tìm thấy phiên bản bảng kiểm." }, { status: 404 });
  if (version.status !== "DRAFT") return NextResponse.json({ error: "Chỉ được thêm tiêu chí vào phiên bản đang ở trạng thái Nháp." }, { status: 409 });

  const { count } = await admin
    .from("hsba_checklist_items")
    .select("id", { count: "exact", head: true })
    .eq("checklist_version_id", versionId);
  const { data, error } = await admin
    .from("hsba_checklist_items")
    .insert({ organization_id: organizationId, content, category, sort_order: count ?? 0, audit_type: version.auditType, checklist_version_id: versionId })
    .select("id,content,category,sort_order,is_active,audit_type,checklist_version_id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, item: data });
}
