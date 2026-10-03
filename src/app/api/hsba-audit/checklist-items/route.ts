import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { normalizeInternalAuditType } from "@/lib/internal-audit-types";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requireApiPermission("hsba_audit.view");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const auditType = normalizeInternalAuditType(new URL(request.url).searchParams.get("audit_type"));
  const { data, error } = await admin
    .from("hsba_checklist_items")
    .select("id,content,category,sort_order,is_active,audit_type")
    .eq("organization_id", organizationId)
    .eq("audit_type", auditType)
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
  const content = String(body.content || "").trim();
  if (!content) return NextResponse.json({ error: "Nội dung tiêu chí không được để trống." }, { status: 400 });
  const category = body.category ? String(body.category).trim() || null : null;
  const auditType = normalizeInternalAuditType(body.audit_type);

  const { count } = await admin
    .from("hsba_checklist_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("audit_type", auditType);
  const { data, error } = await admin
    .from("hsba_checklist_items")
    .insert({ organization_id: organizationId, content, category, sort_order: count ?? 0, audit_type: auditType })
    .select("id,content,category,sort_order,is_active,audit_type")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, item: data });
}
