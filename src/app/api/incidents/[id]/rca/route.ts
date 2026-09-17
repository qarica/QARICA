import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const FACTOR_CODES = new Set([
  "PATIENT",
  "STAFF",
  "TASK_TECHNOLOGY",
  "TEAM",
  "WORK_ENVIRONMENT",
  "INFORMATION_SYSTEMS",
  "ORGANIZATION_MANAGEMENT",
  "INSTITUTIONAL_CONTEXT",
]);

type TimelineInput = {
  event_time?: string | null;
  event_title?: string | null;
  event_description?: string | null;
  source_reference?: string | null;
};

type WhyInput = {
  why_level?: number | string | null;
  answer?: string | null;
  evidence_note?: string | null;
};

type FishboneInput = {
  category_code?: string | null;
  factor_text?: string | null;
  evidence_note?: string | null;
  is_root_candidate?: boolean | null;
};

type RootCauseInput = {
  category_code?: string | null;
  cause_statement?: string | null;
  evidence_basis?: string | null;
  action_required?: boolean | null;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function context(recordId: string) {
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
    .select("id,workflow_status,rca_required")
    .eq("record_id", recordId)
    .maybeSingle();

  return { supabase, record, incident };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: recordId } = await params;
  const { supabase, record, incident } = await context(recordId);
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  if (!record || !incident) return NextResponse.json({ error: "Không tìm thấy sự cố hoặc ngoài phạm vi truy cập." }, { status: 404 });

  const [{ data: canInvestigate }, { data: canTriage }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: "incident.investigate" }),
    supabase.rpc("has_permission", { p_permission_code: "incident.triage" }),
  ]);

  const { data: rca, error: rcaError } = await supabase
    .from("rca_analyses")
    .select("id,method,status,started_at,completed_at,conclusion")
    .eq("incident_id", incident.id)
    .maybeSingle();

  if (rcaError) return NextResponse.json({ error: rcaError.message }, { status: 400 });

  if (!rca) {
    return NextResponse.json({
      ok: true,
      required: !!incident.rca_required,
      editable: record.lifecycle_status === "ACTIVE" && incident.workflow_status === "INVESTIGATING" && (!!canInvestigate || !!canTriage),
      status: "NOT_STARTED",
      ready: false,
      timeline: [],
      five_whys: [],
      fishbone: [],
      root_causes: [],
      counts: { timeline: 0, five_whys: 0, fishbone: 0, root_causes: 0 },
    });
  }

  const [timelineRes, whyRes, fishboneRes, rootRes] = await Promise.all([
    supabase.from("rca_timeline_events").select("id,sequence_no,event_time,event_title,event_description,source_reference").eq("rca_analysis_id", rca.id).order("sequence_no"),
    supabase.from("rca_five_whys").select("id,why_level,answer,evidence_note").eq("rca_analysis_id", rca.id).order("why_level"),
    supabase.from("rca_fishbone_factors").select("id,category_code,factor_text,evidence_note,is_root_candidate").eq("rca_analysis_id", rca.id).order("category_code").order("created_at"),
    supabase.from("rca_root_causes").select("id,sequence_no,category_code,cause_statement,evidence_basis,action_required").eq("rca_analysis_id", rca.id).order("sequence_no"),
  ]);

  const firstError = timelineRes.error || whyRes.error || fishboneRes.error || rootRes.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 400 });

  const timeline = timelineRes.data ?? [];
  const fiveWhys = whyRes.data ?? [];
  const fishbone = fishboneRes.data ?? [];
  const rootCauses = rootRes.data ?? [];
  const ready = timeline.length >= 1 && fiveWhys.length >= 3 && fishbone.length >= 1 && rootCauses.length >= 1;

  return NextResponse.json({
    ok: true,
    required: !!incident.rca_required,
    editable: record.lifecycle_status === "ACTIVE" && incident.workflow_status === "INVESTIGATING" && (!!canInvestigate || !!canTriage),
    status: rca.status || "IN_PROGRESS",
    method: rca.method,
    started_at: rca.started_at,
    completed_at: rca.completed_at,
    conclusion: rca.conclusion,
    ready,
    timeline,
    five_whys: fiveWhys,
    fishbone,
    root_causes: rootCauses,
    counts: { timeline: timeline.length, five_whys: fiveWhys.length, fishbone: fishbone.length, root_causes: rootCauses.length },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: recordId } = await params;
  const { supabase, record, incident } = await context(recordId);
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  if (!record || !incident) return NextResponse.json({ error: "Không tìm thấy sự cố hoặc ngoài phạm vi truy cập." }, { status: 404 });
  if (record.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Hồ sơ sự cố không còn hoạt động." }, { status: 409 });
  if (!incident.rca_required) return NextResponse.json({ error: "Sự cố này chưa được xác định là cần RCA." }, { status: 409 });
  if (incident.workflow_status !== "INVESTIGATING") return NextResponse.json({ error: "Chỉ cập nhật RCA khi sự cố đang ở bước điều tra." }, { status: 409 });

  const [{ data: canInvestigate }, { data: canTriage }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: "incident.investigate" }),
    supabase.rpc("has_permission", { p_permission_code: "incident.triage" }),
  ]);
  if (!canInvestigate && !canTriage) return NextResponse.json({ error: "Bạn chưa có quyền cập nhật RCA." }, { status: 403 });

  const body: any = await request.json().catch(() => ({}));
  const rawTimeline: TimelineInput[] = Array.isArray(body.timeline) ? body.timeline : [];
  const rawWhys: WhyInput[] = Array.isArray(body.five_whys) ? body.five_whys : [];
  const rawFishbone: FishboneInput[] = Array.isArray(body.fishbone) ? body.fishbone : [];
  const rawRoots: RootCauseInput[] = Array.isArray(body.root_causes) ? body.root_causes : [];

  const timeline = rawTimeline
    .map((row) => ({
      event_time: cleanText(row.event_time) || null,
      event_title: cleanText(row.event_title),
      event_description: cleanText(row.event_description) || null,
      source_reference: cleanText(row.source_reference) || null,
    }))
    .filter((row) => row.event_title);

  const fiveWhys = rawWhys
    .map((row) => ({
      why_level: Number(row.why_level),
      answer: cleanText(row.answer),
      evidence_note: cleanText(row.evidence_note) || null,
    }))
    .filter((row) => row.answer);

  if (fiveWhys.some((row) => !Number.isInteger(row.why_level) || row.why_level < 1 || row.why_level > 5)) {
    return NextResponse.json({ error: "Five Why chỉ chấp nhận cấp từ 1 đến 5." }, { status: 400 });
  }
  if (new Set(fiveWhys.map((row) => row.why_level)).size !== fiveWhys.length) {
    return NextResponse.json({ error: "Không được trùng cấp Five Why." }, { status: 400 });
  }

  const fishbone = rawFishbone
    .map((row) => ({
      category_code: cleanText(row.category_code).toUpperCase(),
      factor_text: cleanText(row.factor_text),
      evidence_note: cleanText(row.evidence_note) || null,
      is_root_candidate: !!row.is_root_candidate,
    }))
    .filter((row) => row.factor_text);

  const invalidFishbone = fishbone.find((row) => !FACTOR_CODES.has(row.category_code));
  if (invalidFishbone) return NextResponse.json({ error: `Nhóm Fishbone không hợp lệ: ${invalidFishbone.category_code}` }, { status: 400 });

  const rootCauses = rawRoots
    .map((row) => ({
      category_code: cleanText(row.category_code).toUpperCase() || null,
      cause_statement: cleanText(row.cause_statement),
      evidence_basis: cleanText(row.evidence_basis) || null,
      action_required: row.action_required !== false,
    }))
    .filter((row) => row.cause_statement);

  const invalidRoot = rootCauses.find((row) => row.category_code && !FACTOR_CODES.has(row.category_code));
  if (invalidRoot) return NextResponse.json({ error: `Nhóm nguyên nhân gốc không hợp lệ: ${invalidRoot.category_code}` }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("qlcl_save_incident_rca_structure_v1", {
    p_incident_record_id: recordId,
    p_actor_user_id: auth.user.id,
    p_timeline: timeline,
    p_five_whys: fiveWhys,
    p_fishbone: fishbone,
    p_root_causes: rootCauses,
  });

  if (error) {
    const status = /not active|does not require RCA|only be edited|not found/i.test(error.message || "") ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true, result: data, message: "Đã lưu RCA có cấu trúc." });
}
