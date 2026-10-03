import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMR_CATEGORY_FIELDS } from "@/lib/emr-categories";

function sanitizeDetails(category: string, raw: unknown): Record<string, unknown> {
  const fields = (EMR_CATEGORY_FIELDS as any)[category] || [];
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const value = source[f.key];
    if (value === undefined || value === null || value === "") continue;
    if (f.type === "number") { const n = Number(value); if (Number.isFinite(n)) out[f.key] = n; continue; }
    out[f.key] = String(value).trim();
  }
  return out;
}

async function loadItemOrganization(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { data, error } = await admin.from("emr_rollout_items").select("id,organization_id,status,evidence_url,category").eq("id", id).maybeSingle();
  return { data, error };
}

// Mirrors items/route.ts's sanitizeDepartmentIds: body.department_ids: string[],
// empty/omitted keeps "toàn viện", every id must be an active department in
// the caller's own organization.
async function sanitizeDepartmentIds(admin: ReturnType<typeof createAdminClient>, organizationId: string, raw: unknown): Promise<{ ids: string[] } | { error: string }> {
  if (!Array.isArray(raw)) return { ids: [] };
  const ids = Array.from(new Set(raw.map((v) => String(v || "").trim()).filter(Boolean)));
  if (!ids.length) return { ids: [] };
  const { data } = await admin.from("departments").select("id").eq("organization_id", organizationId).eq("is_active", true).in("id", ids);
  const valid = new Set((data ?? []).map((d: any) => d.id));
  if (ids.some((id) => !valid.has(id))) return { error: "Khoa/phòng không hợp lệ." };
  return { ids };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("emr.manage");
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
  if (typeof body.priority === "string") { if (!["LOW","MEDIUM","HIGH","CRITICAL"].includes(body.priority)) return NextResponse.json({ error: "Mức ưu tiên không hợp lệ." }, { status: 400 }); patch.priority = body.priority; }
  if (typeof body.due_date === "string" || body.due_date === null) patch.due_date = body.due_date || null;
  if (body.department_ids !== undefined) {
    const departmentIdsResult = await sanitizeDepartmentIds(admin, organizationId, body.department_ids);
    if ("error" in departmentIdsResult) return NextResponse.json({ error: departmentIdsResult.error }, { status: 400 });
    patch.department_ids = departmentIdsResult.ids;
  }
  if (typeof body.owner_department_id === "string" || body.owner_department_id === null) { const v=body.owner_department_id||null; if(v){const {data:d}=await admin.from("departments").select("id").eq("id",v).eq("organization_id",organizationId).eq("is_active",true).maybeSingle(); if(!d)return NextResponse.json({error:"Đơn vị phụ trách không hợp lệ."},{status:400});} patch.owner_department_id=v; }
  if (typeof body.is_go_live_gate === "boolean") patch.is_go_live_gate = body.is_go_live_gate;
  if (typeof body.evidence_url === "string" || body.evidence_url === null) { patch.evidence_url = body.evidence_url ? String(body.evidence_url).trim() : null; if (!patch.evidence_url) { patch.verified_at = null; patch.verified_by = null; } }
  if (body.verify_completed === true) { const effectiveStatus = typeof body.status === "string" ? body.status : existing.status; const effectiveEvidence = (typeof body.evidence_url === "string" || body.evidence_url === null) ? (body.evidence_url ? String(body.evidence_url).trim() : null) : existing.evidence_url; if (effectiveStatus !== "DONE" || !effectiveEvidence) return NextResponse.json({ error: "Chỉ xác minh khi hạng mục DONE và có minh chứng." }, { status: 400 }); patch.verified_at = new Date().toISOString(); patch.verified_by = auth.user.id; }
  if (body.verify_completed === false || (body.status && body.status !== "DONE")) { patch.verified_at = null; patch.verified_by = null; }
  if (body.details !== undefined) patch.details = sanitizeDetails(existing.category, body.details);

  const { data, error } = await admin
    .from("emr_rollout_items")
    .update(patch)
    .eq("id", id)
    .select("id,category,title,description,status,department_ids,owner_department_id,due_date,priority,is_go_live_gate,evidence_url,verified_at,verified_by,details,created_at,updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Status transitions are logged into the SAME audit_logs table every other
  // module already writes to (and /admin/audit-log already reads generically
  // by table_name/row_id, falling back from record_id since EMR items have
  // none) — not a new EMR-specific history table/view.
  if (typeof body.status === "string" && body.status !== existing.status) {
    const { error: auditError } = await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, table_name: "emr_rollout_items", row_id: id, action_type: `EMR_ITEM_STATUS_${body.status}`, old_value: { status: existing.status }, new_value: { status: body.status }, request_meta: { source: "qlcl-ui" } });
    if (auditError) return NextResponse.json({ error: `Đã cập nhật nhưng không ghi được audit trail: ${auditError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("emr.manage");
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
