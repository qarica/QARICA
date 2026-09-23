import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorMessage } from "@/lib/rpc-compat";

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
    supabase.from("incidents").select("id,workflow_status,rca_required").eq("record_id", incidentRecordId).maybeSingle(),
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
  let completedRcaId: string | null = null;
  if (incident?.id) {
    const { data: rca } = await admin.from("rca_analyses").select("id").eq("incident_id", incident.id).eq("status", "COMPLETED").order("completed_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    completedRcaId = rca?.id ? String(rca.id) : null;
  }
  const rcaReady = !incident?.rca_required || !!completedRcaId;
  return NextResponse.json({
    ok: true,
    can_create: !!canInvestigate && !!canManageCapa && source.lifecycle_status === "ACTIVE" && ["INVESTIGATING", "ACTION_FOLLOW_UP"].includes(String(incident?.workflow_status || "")) && rcaReady && !linkedCapa,
    linked_capa: linkedCapa,
    rca_required: !!incident?.rca_required,
    rca_ready: rcaReady,
    rca_analysis_id: completedRcaId,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const [{ data: canInvestigate }, { data: canManageCapa }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: "incident.investigate" }),
    supabase.rpc("has_permission", { p_permission_code: "capa.manage" }),
  ]);
  if (!canInvestigate || !canManageCapa) {
    return NextResponse.json({ error: "Cần đồng thời quyền điều tra sự cố và quản lý CAPA để tạo CAPA từ sự cố." }, { status: 403 });
  }

  const { id: incidentRecordId } = await params;
  const body: any = await request.json().catch(() => ({}));
  const priority = String(body.priority || "").trim().toUpperCase() || null;
  const effectivenessDueDate = body.effectiveness_due_date ? String(body.effectiveness_due_date) : null;
  const admin = createAdminClient();

  const { data: tx, error: txError } = await admin.rpc("qlcl_create_capa_from_incident_v1", {
    p_incident_record_id: incidentRecordId,
    p_actor_user_id: auth.user.id,
    p_title: String(body.title || "").trim() || null,
    p_problem_statement: String(body.problem_statement || "").trim() || null,
    p_priority: priority,
    p_approval_required: body.approval_required !== false,
    p_effectiveness_due_date: effectivenessDueDate,
  });

  if (txError) {
    const message = rpcErrorMessage(txError, "Không thể tạo CAPA từ sự cố.");
    return NextResponse.json(
      { error: message },
      { status: /đã có capa|không tìm thấy|không còn hoạt động|chỉ tạo capa|yêu cầu rca|không hợp lệ|đã ngưng|ngoài phạm vi/i.test(message) ? 409 : 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    record_id: tx?.record_id,
    capa_id: tx?.capa_id,
    record_code: tx?.record_code,
    rca_analysis_id: tx?.rca_analysis_id ?? null,
    message: tx?.record_code
      ? `Đã tạo ${tx.record_code} và liên kết với sự cố nguồn.`
      : "Đã tạo CAPA và liên kết với sự cố nguồn.",
    transaction: "atomic",
  });
}
