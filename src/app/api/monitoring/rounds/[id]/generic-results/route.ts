import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const FIVE_S_FAMILY_CODES = new Set([
  "BK01.V1_QLCL.QĐ.06",
  "BK02.V1_QLCL.QĐ.06",
  "BK03.V1_QLCL.QĐ.06",
  "BK05.V1_QLCL.QĐ.06",
  "BK07.V1_QLCL.QĐ.06",
  "BK09.V1_QLCL.QĐ.06",
]);
const ALLOWED_RESULTS = new Set(["PASS", "FAIL", "NA", "PARTIAL"]);

type InputResponse = { item_id: string; result: string; score: number | null; chosen_option?: string | null; note?: string | null };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("monitoring.perform");
  if (!auth.ok) return auth.response;
  const { id: roundId } = await params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu bảng kiểm không hợp lệ." }, { status: 400 });
  }

  const monitoringDate = String(body.monitoring_date || "").trim();
  const staffName = String(body.staff_name || "").trim();
  const subject = String(body.subject || "").trim();
  const responses = Array.isArray(body.responses) ? (body.responses as InputResponse[]) : [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(monitoringDate)) return NextResponse.json({ error: "Ngày giám sát không hợp lệ." }, { status: 400 });
  if (!staffName) return NextResponse.json({ error: "Vui lòng nhập người thực hiện." }, { status: 400 });
  if (!subject) return NextResponse.json({ error: "Vui lòng nhập khoa/phòng hoặc đối tượng được đánh giá." }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: caller }, { data: round }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active,full_name").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("monitoring_rounds").select("id,record_id,checklist_version_id,scheduled_date,workflow_status").eq("id", roundId).maybeSingle(),
  ]);
  if (!caller?.organization_id || !caller.is_active) return NextResponse.json({ error: "Tài khoản không hợp lệ." }, { status: 403 });
  if (!round) return NextResponse.json({ error: "Không tìm thấy đợt giám sát." }, { status: 404 });
  if (round.workflow_status !== "IN_PROGRESS") return NextResponse.json({ error: "Đợt giám sát không ở trạng thái Đang kiểm." }, { status: 409 });

  const [{ data: record }, { data: version }, { data: existingResponses }] = await Promise.all([
    admin.from("records").select("id,record_code,organization_id,owner_department_id").eq("id", round.record_id).maybeSingle(),
    admin.from("checklist_versions").select("id,checklist_template_id,status").eq("id", round.checklist_version_id).maybeSingle(),
    admin.from("checklist_responses").select("id").eq("monitoring_round_id", round.id).limit(1),
  ]);
  if (!record || record.organization_id !== caller.organization_id) return NextResponse.json({ error: "Đợt giám sát không thuộc bệnh viện hiện tại." }, { status: 403 });
  if (existingResponses?.length) return NextResponse.json({ error: "Kết quả của đợt này đã được lưu." }, { status: 409 });
  if (!version || version.status !== "PUBLISHED") return NextResponse.json({ error: "Phiên bản bảng kiểm không hợp lệ." }, { status: 409 });

  const { data: template } = await admin.from("checklist_templates").select("id,code,name,is_active").eq("id", version.checklist_template_id).maybeSingle();
  if (!template?.is_active) return NextResponse.json({ error: "Mẫu bảng kiểm không hợp lệ." }, { status: 400 });
  if (FIVE_S_FAMILY_CODES.has(template.code)) return NextResponse.json({ error: "Bảng kiểm 5S phải dùng đúng màn hình chấm điểm 5S, không dùng màn hình này." }, { status: 400 });

  const { data: items } = await admin.from("checklist_items").select("id,content,allow_na").eq("checklist_version_id", version.id);
  const itemIds = new Set((items ?? []).map((x) => x.id));
  if (!itemIds.size || responses.length !== itemIds.size) return NextResponse.json({ error: `Phải đánh giá đầy đủ ${itemIds.size} nội dung trước khi lưu bảng kiểm.` }, { status: 409 });

  const seen = new Set<string>();
  for (const row of responses) {
    if (!itemIds.has(row.item_id) || seen.has(row.item_id) || !ALLOWED_RESULTS.has(row.result)) return NextResponse.json({ error: "Dữ liệu đánh giá không hợp lệ." }, { status: 400 });
    seen.add(row.item_id);
    if (row.result === "NA") {
      const item = (items ?? []).find((x) => x.id === row.item_id);
      if (!item?.allow_na) return NextResponse.json({ error: `Tiêu chí "${item?.content || row.item_id}" không cho phép "/".` }, { status: 400 });
    }
  }

  const savedAt = new Date();
  const savedAtIso = savedAt.toISOString();
  const recheckDueAtIso = new Date(savedAt.getTime() + 5 * 60 * 1000).toISOString();
  const failCount = responses.filter((row) => row.result === "FAIL").length;
  const nextStatus = failCount > 0 ? "IN_PROGRESS" : "AWAITING_CONFIRMATION";
  const context = { source_code: template.code, template_id: template.id, version_id: version.id, monitoring_date: monitoringDate, subject, staff_name: staffName, assessor_user_id: auth.user.id, assessor_name: caller.full_name || null, checklist_saved_at: savedAtIso };

  const responsePayload = responses.map((row) => ({
    monitoring_round_id: round.id,
    checklist_item_id: row.item_id,
    answer_value: { result: row.result, chosen_option: row.chosen_option || null, form_context: context, followup: row.result === "FAIL" ? { reported_at: savedAtIso, recheck_due_at: recheckDueAtIso, status: "PENDING_RECHECK" } : null },
    result_status: row.result,
    score: row.score,
    note: row.note || null,
    na_reason: null,
    answered_by: auth.user.id,
    answered_at: savedAtIso,
    followup_disposition: row.result === "FAIL" ? "IMMEDIATE_CORRECTION" : "NONE",
  }));

  const { data: savedResponses, error: responseError } = await admin.from("checklist_responses").insert(responsePayload).select("id");
  if (responseError || !savedResponses || savedResponses.length !== responses.length) {
    if (savedResponses?.length) await admin.from("checklist_responses").delete().in("id", savedResponses.map((x) => x.id));
    return NextResponse.json({ error: responseError?.message || "Không lưu được kết quả bảng kiểm." }, { status: 400 });
  }

  const { data: updatedRound, error: roundUpdateError } = await admin
    .from("monitoring_rounds")
    .update({ target_area: subject, completed_at: failCount > 0 ? null : savedAtIso, workflow_status: nextStatus })
    .eq("id", round.id)
    .eq("workflow_status", "IN_PROGRESS")
    .select("id,workflow_status")
    .maybeSingle();
  if (roundUpdateError || !updatedRound) {
    await admin.from("checklist_responses").delete().in("id", savedResponses.map((x) => x.id));
    return NextResponse.json({ error: roundUpdateError?.message || "Không thể cập nhật trạng thái đợt giám sát." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, round_id: round.id, record_id: record.id, record_code: record.record_code, status: updatedRound.workflow_status, fail_count: failCount, checklist_saved_at: savedAtIso, recheck_due_at: failCount > 0 ? recheckDueAtIso : null });
}
