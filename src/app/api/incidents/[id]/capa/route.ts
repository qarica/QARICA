import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const [{ data: canInvestigate }, { data: canManageCapa }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: "incident.investigate" }),
    supabase.rpc("has_permission", { p_permission_code: "capa.manage" }),
  ]);
  const { id: incidentRecordId } = await params;
  const admin = createAdminClient();
  const { data: source } = await supabase.from("records").select("id,lifecycle_status").eq("id", incidentRecordId).eq("record_type", "INCIDENT").maybeSingle();
  if (!source) return NextResponse.json({ error: "Không tìm thấy sự cố hoặc ngoài phạm vi truy cập." }, { status: 404 });
  const [{ data: incident }, { data: links }] = await Promise.all([
    supabase.from("incidents").select("workflow_status").eq("record_id", incidentRecordId).maybeSingle(),
    supabase.from("record_links").select("target_record_id").eq("source_record_id", incidentRecordId).eq("relation_type", "GENERATED_CAPA"),
  ]);
  const ids = (links ?? []).map((x: any) => x.target_record_id).filter(Boolean);
  let linkedCapa: { id: string; code: string; status: string } | null = null;
  if (ids.length) {
    const { data: records } = await supabase.from("records").select("id,record_code,lifecycle_status").in("id", ids).eq("record_type", "CAPA").neq("lifecycle_status", "ARCHIVED").limit(1);
    const record = records?.[0];
    if (record) {
      const { data: capa } = await supabase.from("capas").select("workflow_status").eq("record_id", record.id).maybeSingle();
      linkedCapa = { id: record.id, code: record.record_code, status: String(capa?.workflow_status || record.lifecycle_status) };
    }
  }
  return NextResponse.json({ ok: true, can_create: !!canInvestigate && !!canManageCapa && source.lifecycle_status === "ACTIVE" && ["INVESTIGATING", "ACTION_FOLLOW_UP"].includes(String(incident?.workflow_status || "")) && !linkedCapa, linked_capa: linkedCapa });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const [{ data: canInvestigate }, { data: canManageCapa }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: "incident.investigate" }),
    supabase.rpc("has_permission", { p_permission_code: "capa.manage" }),
  ]);
  if (!canInvestigate || !canManageCapa) return NextResponse.json({ error: "Cần đồng thời quyền điều tra sự cố và quản lý CAPA để tạo CAPA từ sự cố." }, { status: 403 });
  const { id: incidentRecordId } = await params;
  const body: any = await request.json().catch(() => ({}));
  const admin = createAdminClient();
  const [{ data: source }, { data: caller }] = await Promise.all([
    admin.from("records").select("id,organization_id,record_code,title,work_year,lifecycle_status,owner_department_id").eq("id", incidentRecordId).eq("record_type", "INCIDENT").maybeSingle(),
    admin.from("profiles").select("user_id,organization_id,is_active,department_id,primary_department_id").eq("user_id", auth.user.id).maybeSingle(),
  ]);
  if (!source || source.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Không tìm thấy sự cố đang hoạt động." }, { status: 404 });
  if (!caller?.is_active || caller.organization_id !== source.organization_id) return NextResponse.json({ error: "Tài khoản ngoài phạm vi bệnh viện của sự cố." }, { status: 403 });
  const { data: incident } = await admin.from("incidents").select("id,workflow_status,verified_description,summary,lead_department_id,case_owner_user_id,rca_required").eq("record_id", incidentRecordId).maybeSingle();
  if (!incident) return NextResponse.json({ error: "Không tìm thấy dữ liệu nghiệp vụ của sự cố." }, { status: 404 });
  if (!["INVESTIGATING", "ACTION_FOLLOW_UP"].includes(String(incident.workflow_status))) return NextResponse.json({ error: "Chỉ tạo CAPA sau khi sự cố đã vào bước điều tra/RCA hoặc theo dõi hành động." }, { status: 409 });
  const { data: existingLinks } = await admin.from("record_links").select("target_record_id").eq("source_record_id", incidentRecordId).eq("relation_type", "GENERATED_CAPA");
  const existingIds = (existingLinks ?? []).map((x: any) => x.target_record_id).filter(Boolean);
  if (existingIds.length) { const { data: active } = await admin.from("records").select("id,record_code,title,lifecycle_status").in("id", existingIds).eq("record_type", "CAPA").neq("lifecycle_status", "ARCHIVED").limit(1).maybeSingle(); if (active) return NextResponse.json({ error: `Sự cố đã có CAPA liên kết ${active.record_code}.`, record_id: active.id, record_code: active.record_code }, { status: 409 }); }
  const problemStatement = String(body.problem_statement || incident.verified_description || incident.summary || source.title || "").trim();
  if (!problemStatement) return NextResponse.json({ error: "Cần có mô tả vấn đề làm căn cứ CAPA." }, { status: 400 });
  const priority = String(body.priority || (incident.rca_required ? "HIGH" : "NORMAL")).toUpperCase();
  if (!["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"].includes(priority)) return NextResponse.json({ error: "Mức ưu tiên CAPA không hợp lệ." }, { status: 400 });
  const ownerDepartmentId = incident.lead_department_id || source.owner_department_id || caller.primary_department_id || caller.department_id || null;
  const ownerUserId = incident.case_owner_user_id || auth.user.id;
  const title = String(body.title || `CAPA từ ${source.record_code} · ${source.title}`).trim();
  const effectivenessDueDate = body.effectiveness_due_date ? String(body.effectiveness_due_date) : null;
  const { data: code, error: codeError } = await admin.rpc("next_record_code", { p_org: source.organization_id, p_record_type: "CAPA", p_work_year: source.work_year });
  if (codeError || !code) return NextResponse.json({ error: codeError?.message || "Không cấp được mã CAPA." }, { status: 400 });
  const { data: record, error: recordError } = await admin.from("records").insert({ organization_id: source.organization_id, record_type: "CAPA", record_code: code, title, work_year: source.work_year, owner_department_id: ownerDepartmentId, owner_user_id: ownerUserId, lifecycle_status: "ACTIVE", created_by: auth.user.id }).select("id,record_code").single();
  if (recordError || !record) return NextResponse.json({ error: recordError?.message || "Không tạo được hồ sơ CAPA." }, { status: 400 });
  const rollback = async () => { await admin.from("records").update({ lifecycle_status: "ARCHIVED" }).eq("id", record.id); };
  const { data: capa, error: capaError } = await admin.from("capas").insert({ record_id: record.id, problem_statement: problemStatement, priority, lead_department_id: ownerDepartmentId, owner_user_id: ownerUserId, workflow_status: "DRAFT", approval_required: body.approval_required !== false, effectiveness_due_date: effectivenessDueDate }).select("id").single();
  if (capaError || !capa) { await rollback(); return NextResponse.json({ error: capaError?.message || "Không tạo được nội dung CAPA." }, { status: 400 }); }
  const { error: linkError } = await admin.from("record_links").insert({ source_record_id: incidentRecordId, target_record_id: record.id, relation_type: "GENERATED_CAPA", metadata: { source_record_type: "INCIDENT", source_record_code: source.record_code, source_incident_id: incident.id, rca_required: !!incident.rca_required }, created_by: auth.user.id });
  if (linkError) { await admin.from("capas").delete().eq("id", capa.id); await rollback(); return NextResponse.json({ error: `Không liên kết được CAPA với sự cố nguồn: ${linkError.message}` }, { status: 400 }); }
  await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: incidentRecordId, table_name: "record_links", row_id: record.id, action_type: "GENERATE_CAPA_FROM_INCIDENT", new_value: { capa_record_id: record.id, capa_id: capa.id, record_code: record.record_code, priority }, request_meta: { source: "qlcl-ui", source_record_type: "INCIDENT" } });
  return NextResponse.json({ ok: true, record_id: record.id, capa_id: capa.id, record_code: record.record_code, message: `Đã tạo ${record.record_code} và liên kết với sự cố nguồn.` });
}
