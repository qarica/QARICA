import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { normalizeInternalAuditType } from "@/lib/internal-audit-types";
import type { ChecklistTemplateSummary, ChecklistVersionSummary } from "@/lib/hsba-checklist-template-types";
import { rpcErrorMessage } from "@/lib/rpc-compat";
import { createAdminClient } from "@/lib/supabase/admin";

const CREATE_RPC = "qlcl_create_hsba_checklist_template_v1";

export async function GET(request: Request) {
  const auth = await requireApiPermission("hsba_audit.view");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const auditType = normalizeInternalAuditType(new URL(request.url).searchParams.get("audit_type"));

  const { data: templates, error: templatesError } = await admin
    .from("hsba_checklist_templates")
    .select("id,name,description,is_active")
    .eq("organization_id", organizationId)
    .eq("audit_type", auditType)
    .order("name");
  if (templatesError) return NextResponse.json({ error: templatesError.message }, { status: 400 });

  const templateIds = (templates ?? []).map((t) => t.id);
  const [versionsRes, itemsRes] = await Promise.all([
    templateIds.length
      ? admin.from("hsba_checklist_versions").select("id,checklist_template_id,version_no,status,published_at").in("checklist_template_id", templateIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    templateIds.length ? admin.from("hsba_checklist_items").select("id,checklist_version_id").eq("is_active", true) : Promise.resolve({ data: [] as any[], error: null }),
  ]);
  if (versionsRes.error) return NextResponse.json({ error: versionsRes.error.message }, { status: 400 });

  const itemCountByVersion = new Map<string, number>();
  for (const item of itemsRes.data ?? []) {
    if (!item.checklist_version_id) continue;
    itemCountByVersion.set(item.checklist_version_id, (itemCountByVersion.get(item.checklist_version_id) || 0) + 1);
  }

  const versionsByTemplate = new Map<string, any[]>();
  for (const v of versionsRes.data ?? []) {
    const list = versionsByTemplate.get(v.checklist_template_id) || [];
    list.push(v);
    versionsByTemplate.set(v.checklist_template_id, list);
  }

  const toSummary = (v: any): ChecklistVersionSummary => ({
    id: v.id,
    version_no: v.version_no,
    status: v.status,
    published_at: v.published_at,
    item_count: itemCountByVersion.get(v.id) || 0,
  });

  const result: ChecklistTemplateSummary[] = (templates ?? []).map((t) => {
    const versions = (versionsByTemplate.get(t.id) || []).sort((a, b) => b.version_no - a.version_no);
    const published = versions.find((v) => v.status === "PUBLISHED");
    const draft = versions.find((v) => v.status === "DRAFT");
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      is_active: t.is_active,
      published_version: published ? toSummary(published) : null,
      draft_version: draft ? toSummary(draft) : null,
    };
  });

  return NextResponse.json({ ok: true, templates: result });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("hsba_audit.manage");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const auditType = normalizeInternalAuditType(body.audit_type);
  const name = String(body.name || "").trim();
  const description = body.description ? String(body.description).trim() || null : null;
  if (!name) return NextResponse.json({ error: "Tên mẫu bảng kiểm là bắt buộc." }, { status: 400 });

  const admin = createAdminClient();
  const { data: tx, error } = await admin.rpc(CREATE_RPC, {
    p_actor_user_id: auth.user.id,
    p_audit_type: auditType,
    p_name: name,
    p_description: description,
  });

  if (error) {
    const message = rpcErrorMessage(error, "Không tạo được mẫu bảng kiểm.");
    const status = /không hợp lệ.*tổ chức/i.test(message) ? 403 : /bắt buộc|không hợp lệ/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  const result = tx && typeof tx === "object" ? (tx as Record<string, unknown>) : {};
  const id = typeof result.id === "string" ? result.id : null;
  const versionId = typeof result.version_id === "string" ? result.version_id : null;
  if (!id || !versionId) return NextResponse.json({ error: "Kết quả tạo mẫu bảng kiểm không hợp lệ." }, { status: 409 });

  return NextResponse.json({
    ok: true,
    template: {
      id,
      name,
      description,
      is_active: true,
      published_version: null,
      draft_version: { id: versionId, version_no: 1, status: "DRAFT", published_at: null, item_count: 0 },
    } satisfies ChecklistTemplateSummary,
  });
}
