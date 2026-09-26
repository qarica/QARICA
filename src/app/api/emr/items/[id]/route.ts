import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function loadItemOrganization(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { data, error } = await admin.from("emr_rollout_items").select("id,organization_id,status,evidence_url").eq("id", id).maybeSingle();
  return { data, error };
}

async function callerOrganizationId(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin.from("profiles").select("organization_id").eq("user_id", userId).maybeSingle();
  return { organizationId: data?.organization_id ?? null, error };
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
  if (typeof body.department_id === "string" || body.department_id === null) { const v=body.department_id||null; if(v){const {data:d}=await admin.from("departments").select("id").eq("id",v).eq("organization_id",organizationId).eq("is_active",true).maybeSingle(); if(!d)return NextResponse.json({error:"Khoa/phòng không hợp lệ."},{status:400});} patch.department_id=v; }
  if (typeof body.owner_user_id === "string" || body.owner_user_id === null) { const v=body.owner_user_id||null; if(v){const {data:u}=await admin.from("profiles").select("user_id").eq("user_id",v).eq("organization_id",organizationId).eq("is_active",true).maybeSingle(); if(!u)return NextResponse.json({error:"Người phụ trách không hợp lệ."},{status:400});} patch.owner_user_id=v; }
  if (typeof body.is_go_live_gate === "boolean") patch.is_go_live_gate = body.is_go_live_gate;
  if (typeof body.evidence_url === "string" || body.evidence_url === null) { patch.evidence_url = body.evidence_url ? String(body.evidence_url).trim() : null; if (!patch.evidence_url) { patch.verified_at = null; patch.verified_by = null; } }
  if (body.verify_completed === true) { const effectiveStatus = typeof body.status === "string" ? body.status : existing.status; const effectiveEvidence = (typeof body.evidence_url === "string" || body.evidence_url === null) ? (body.evidence_url ? String(body.evidence_url).trim() : null) : existing.evidence_url; if (effectiveStatus !== "DONE" || !effectiveEvidence) return NextResponse.json({ error: "Chỉ xác minh khi hạng mục DONE và có minh chứng." }, { status: 400 }); patch.verified_at = new Date().toISOString(); patch.verified_by = auth.user.id; }
  if (body.verify_completed === false || (body.status && body.status !== "DONE")) { patch.verified_at = null; patch.verified_by = null; }

  const { data, error } = await admin
    .from("emr_rollout_items")
    .update(patch)
    .eq("id", id)
    .select("id,category,title,description,status,department_id,owner_user_id,due_date,priority,is_go_live_gate,evidence_url,verified_at,created_at,updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

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
