import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
    .select("id,workflow_status")
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

  const [{ data: canView }, { data: canInvestigate }, { data: canClose }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: "incident.view_case" }),
    supabase.rpc("has_permission", { p_permission_code: "incident.investigate" }),
    supabase.rpc("has_permission", { p_permission_code: "incident.close" }),
  ]);
  if (!canView && !canInvestigate && !canClose) return NextResponse.json({ error: "Bạn chưa có quyền xem bài học kinh nghiệm." }, { status: 403 });

  const admin = createAdminClient();
  const { data: lesson, error } = await admin
    .from("incident_lessons_learned")
    .select("id,status,title,summary,learning_points,recommended_practice,audience,deidentified_confirmed,review_note,reviewed_by,reviewed_at,published_at,updated_at")
    .eq("incident_id", incident.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const isClosedIncident = incident.workflow_status === "CLOSED";
  const isPublished = lesson?.status === "PUBLISHED";
  return NextResponse.json({
    ok: true,
    incident_status: incident.workflow_status,
    editable: !isPublished && (isClosedIncident ? !!canClose : record.lifecycle_status === "ACTIVE" && (!!canInvestigate || !!canClose)),
    can_publish: !isPublished && isClosedIncident && !!canClose,
    lesson: lesson ?? null,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: recordId } = await params;
  const { supabase, record, incident } = await context(recordId);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  if (!record || !incident) return NextResponse.json({ error: "Không tìm thấy sự cố hoặc ngoài phạm vi truy cập." }, { status: 404 });
  const isClosedIncident = incident.workflow_status === "CLOSED";
  if (record.lifecycle_status !== "ACTIVE" && !isClosedIncident) return NextResponse.json({ error: "Hồ sơ sự cố không còn hoạt động." }, { status: 409 });

  const body: any = await request.json().catch(() => ({}));
  const publish = body.publish === true;
  const [{ data: canInvestigate }, { data: canClose }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: "incident.investigate" }),
    supabase.rpc("has_permission", { p_permission_code: "incident.close" }),
  ]);
  if (publish && !canClose) return NextResponse.json({ error: "Bạn chưa có quyền duyệt/phát hành bài học kinh nghiệm." }, { status: 403 });
  if (isClosedIncident && !canClose) return NextResponse.json({ error: "Sau khi đóng sự cố, chỉ người có quyền đóng sự cố mới được hoàn thiện bài học kinh nghiệm." }, { status: 403 });
  if (!publish && !isClosedIncident && !canInvestigate && !canClose) return NextResponse.json({ error: "Bạn chưa có quyền cập nhật bài học kinh nghiệm." }, { status: 403 });

  const payload = {
    title: String(body.title || "").trim(),
    summary: String(body.summary || "").trim(),
    learning_points: String(body.learning_points || "").trim(),
    recommended_practice: String(body.recommended_practice || "").trim(),
    audience: String(body.audience || "").trim(),
    review_note: String(body.review_note || "").trim(),
    deidentified_confirmed: body.deidentified_confirmed === true,
  };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("qlcl_save_incident_lesson_v1", {
    p_incident_record_id: recordId,
    p_actor_user_id: auth.user.id,
    p_payload: payload,
    p_publish: publish,
  });
  if (error) {
    const message = error.message || "Không lưu được bài học kinh nghiệm.";
    return NextResponse.json({ error: message }, { status: /only be published|required|invalid|outside organization|not found/i.test(message) ? 409 : 400 });
  }

  return NextResponse.json({
    ok: true,
    result: data,
    message: publish ? "Đã duyệt và phát hành bài học kinh nghiệm." : "Đã lưu bản nháp bài học kinh nghiệm.",
  });
}
