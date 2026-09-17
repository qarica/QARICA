import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ALLOWED = new Set<string>([
  "PATIENT",
  "STAFF",
  "TASK_TECHNOLOGY",
  "TEAM",
  "WORK_ENVIRONMENT",
  "INFORMATION_SYSTEMS",
  "ORGANIZATION_MANAGEMENT",
  "INSTITUTIONAL_CONTEXT",
]);

async function incidentForRecord(recordId: string) {
  const supabase = await createClient();
  const { data: record } = await supabase
    .from("records")
    .select("id,lifecycle_status")
    .eq("id", recordId)
    .eq("record_type", "INCIDENT")
    .maybeSingle();
  if (!record) return { supabase, record: null, incident: null };
  const { data: incident } = await supabase
    .from("incidents")
    .select("id,workflow_status")
    .eq("record_id", recordId)
    .maybeSingle();
  return { supabase, record, incident };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: recordId } = await params;
  const { supabase, record, incident } = await incidentForRecord(recordId);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  if (!record || !incident) return NextResponse.json({ error: "Không tìm thấy sự cố hoặc ngoài phạm vi truy cập." }, { status: 404 });

  const { data, error } = await supabase
    .from("incident_contributing_factors")
    .select("factor_code,note,created_at,updated_at")
    .eq("incident_id", incident.id)
    .order("factor_code");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    ok: true,
    editable: record.lifecycle_status === "ACTIVE" && ["INVESTIGATION_REQUIRED", "INVESTIGATING"].includes(String(incident.workflow_status)),
    factors: data ?? [],
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: recordId } = await params;
  const { supabase, record, incident } = await incidentForRecord(recordId);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  if (!record || !incident) return NextResponse.json({ error: "Không tìm thấy sự cố hoặc ngoài phạm vi truy cập." }, { status: 404 });
  if (record.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Hồ sơ sự cố không còn hoạt động." }, { status: 409 });

  const [{ data: canInvestigate }, { data: canTriage }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: "incident.investigate" }),
    supabase.rpc("has_permission", { p_permission_code: "incident.triage" }),
  ]);
  if (!canInvestigate && !canTriage) return NextResponse.json({ error: "Bạn chưa có quyền cập nhật yếu tố góp phần." }, { status: 403 });

  const body: any = await request.json().catch(() => ({}));
  const rawFactors: string[] = Array.isArray(body.factors)
    ? body.factors.map((x: unknown) => String(x || "").trim().toUpperCase()).filter((x: string) => x.length > 0)
    : [];
  const factors: string[] = Array.from(new Set<string>(rawFactors));
  const invalid = factors.find((x: string) => !ALLOWED.has(x));
  if (invalid) return NextResponse.json({ error: `Yếu tố góp phần không hợp lệ: ${invalid}` }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("qlcl_save_incident_contributing_factors_v1", {
    p_incident_record_id: recordId,
    p_actor_user_id: auth.user.id,
    p_factor_codes: factors,
  });
  if (error) {
    const status = /only be edited|not active|not found/i.test(error.message || "") ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true, result: data, message: "Đã lưu các yếu tố góp phần của sự cố." });
}
