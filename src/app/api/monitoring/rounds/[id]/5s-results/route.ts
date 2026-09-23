import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingRpcFunction, rpcErrorMessage } from "@/lib/rpc-compat";

export const runtime = "nodejs";
const FIVE_S_FAMILY_CODES = new Set([
  "BK01.V1_QLCL.QĐ.06",
  "BK02.V1_QLCL.QĐ.06",
  "BK03.V1_QLCL.QĐ.06",
  "BK05.V1_QLCL.QĐ.06",
  "BK07.V1_QLCL.QĐ.06",
  "BK09.V1_QLCL.QĐ.06",
]);
const ALLOWED_RESULTS = new Set(["PASS", "FAIL", "NA"]);
const MAX_IMAGE_SIZE = 12 * 1024 * 1024;
const SAVE_RESULTS_RPC = "qlcl_monitoring_save_initial_results_v1";

type InputResponse = { item_id: string; result: "PASS" | "FAIL" | "NA"; note?: string | null };
type ImageMeta = { key: string; item_id: string; captured_at?: string | null; latitude?: number | null; longitude?: number | null; accuracy?: number | null; source?: string | null };
type UploadedArtifact = { evidenceId: string; bucket: string; path: string };

function safeName(name: string) {
  return (name || "photo.jpg").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "photo.jpg";
}

async function cleanupArtifacts(admin: ReturnType<typeof createAdminClient>, artifacts: UploadedArtifact[]) {
  for (const artifact of artifacts) {
    await admin.storage.from(artifact.bucket).remove([artifact.path]);
    await admin.from("evidence").delete().eq("id", artifact.evidenceId);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("monitoring.perform");
  if (!auth.ok) return auth.response;
  const { id: roundId } = await params;

  const formData = await request.formData();
  const rawPayload = formData.get("payload");
  if (typeof rawPayload !== "string") return NextResponse.json({ error: "Thiếu dữ liệu bảng kiểm." }, { status: 400 });
  let body: any;
  try { body = JSON.parse(rawPayload); } catch { return NextResponse.json({ error: "Dữ liệu bảng kiểm không hợp lệ." }, { status: 400 }); }

  const monitoringDate = String(body.monitoring_date || "").trim();
  const staffName = String(body.staff_name || "").trim();
  const selectedAreas = Array.isArray(body.selected_areas) ? body.selected_areas.map((x: unknown) => String(x).trim()).filter(Boolean) : [];
  const otherArea = String(body.other_area || "").trim();
  const responses = Array.isArray(body.responses) ? body.responses as InputResponse[] : [];
  const images = Array.isArray(body.images) ? body.images as ImageMeta[] : [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(monitoringDate)) return NextResponse.json({ error: "Ngày giám sát không hợp lệ." }, { status: 400 });
  if (!staffName) return NextResponse.json({ error: "Vui lòng nhập nhân viên thực hiện 5S." }, { status: 400 });
  if (!selectedAreas.length && !otherArea) return NextResponse.json({ error: "Vui lòng chọn hoặc nhập ít nhất một khu vực đánh giá." }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: caller }, { data: round }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active,full_name").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("monitoring_rounds").select("id,record_id,checklist_version_id,scheduled_date,workflow_status").eq("id", roundId).maybeSingle(),
  ]);
  if (!caller?.organization_id || !caller.is_active) return NextResponse.json({ error: "Tài khoản không hợp lệ." }, { status: 403 });
  if (!round) return NextResponse.json({ error: "Không tìm thấy đợt giám sát." }, { status: 404 });
  if (round.workflow_status !== "IN_PROGRESS") return NextResponse.json({ error: "Đợt giám sát không ở trạng thái Đang kiểm." }, { status: 409 });
  if (round.scheduled_date && round.scheduled_date !== monitoringDate) return NextResponse.json({ error: "Ngày giám sát phải đúng với ngày đã lập cho đợt này." }, { status: 409 });

  const [{ data: record }, { data: version }, { data: existingResponses }] = await Promise.all([
    admin.from("records").select("id,record_code,organization_id,owner_department_id").eq("id", round.record_id).maybeSingle(),
    admin.from("checklist_versions").select("id,checklist_template_id,status,version_no").eq("id", round.checklist_version_id).maybeSingle(),
    admin.from("checklist_responses").select("id").eq("monitoring_round_id", round.id).limit(1),
  ]);
  if (!record || record.organization_id !== caller.organization_id) return NextResponse.json({ error: "Đợt giám sát không thuộc bệnh viện hiện tại." }, { status: 403 });
  if (existingResponses?.length) return NextResponse.json({ error: "Kết quả ban đầu của đợt này đã được lưu." }, { status: 409 });
  if (!version || version.status !== "PUBLISHED") return NextResponse.json({ error: "Phiên bản bảng kiểm không hợp lệ." }, { status: 409 });

  const [{ data: template }, { data: items }] = await Promise.all([
    admin.from("checklist_templates").select("id,code,name,owner_department_id,is_active").eq("id", version.checklist_template_id).maybeSingle(),
    admin.from("checklist_items").select("id,content,allow_na,sequence_no").eq("checklist_version_id", version.id),
  ]);
  if (!template?.is_active || !FIVE_S_FAMILY_CODES.has(template.code)) return NextResponse.json({ error: "Mẫu bảng kiểm 5S không hợp lệ." }, { status: 400 });

  const itemIds = new Set((items ?? []).map((x) => x.id));
  if (!itemIds.size || responses.length !== itemIds.size) return NextResponse.json({ error: `Phải đánh giá đầy đủ ${itemIds.size} nội dung trước khi lưu bảng kiểm.` }, { status: 409 });
  const seen = new Set<string>();
  for (const row of responses) {
    if (!itemIds.has(row.item_id) || seen.has(row.item_id) || !ALLOWED_RESULTS.has(row.result)) return NextResponse.json({ error: "Dữ liệu đánh giá không hợp lệ." }, { status: 400 });
    seen.add(row.item_id);
    if (row.result === "NA") {
      const item = (items ?? []).find((x) => x.id === row.item_id);
      if (!item?.allow_na) return NextResponse.json({ error: `Tiêu chí “${item?.content || row.item_id}” không cho phép “/”.` }, { status: 400 });
    }
  }
  if (images.some((x) => !itemIds.has(x.item_id) || !x.key)) return NextResponse.json({ error: "Thông tin hình ảnh không hợp lệ." }, { status: 400 });

  const areaList = [...selectedAreas, ...(otherArea ? otherArea.split(";").map((x) => x.trim()).filter(Boolean) : [])];
  const targetArea = areaList.join("; ");
  const savedAt = new Date();
  const savedAtIso = savedAt.toISOString();
  const recheckDueAtIso = new Date(savedAt.getTime() + 5 * 60 * 1000).toISOString();
  const failCount = responses.filter((row) => row.result === "FAIL").length;
  const context = { source_code: template.code, template_id: template.id, version_id: version.id, version_no: version.version_no, monitoring_date: monitoringDate, selected_areas: areaList, staff_name: staffName, assessor_user_id: auth.user.id, assessor_name: caller.full_name || null, checklist_saved_at: savedAtIso };

  // Upload PENDING evidence first. The core DB save is committed afterwards in one transaction.
  const imageLists = new Map<string, any[]>();
  const uploadedArtifacts: UploadedArtifact[] = [];
  for (const meta of images) {
    const file = formData.get(meta.key);
    if (!(file instanceof File) || !file.type.startsWith("image/") || file.size <= 0 || file.size > MAX_IMAGE_SIZE) continue;
    const evidenceId = randomUUID();
    const storedName = safeName(file.name || "photo.jpg");
    const bucket = "qlcl-evidence";
    const path = `${caller.organization_id}/${record.id}/monitoring/${round.id}/${meta.item_id}/${evidenceId}/${storedName}`;
    const item = (items ?? []).find((x) => x.id === meta.item_id);
    const { error: evidenceError } = await admin.from("evidence").insert({ id: evidenceId, organization_id: caller.organization_id, title: `5S · Ảnh ban đầu · ${item?.content || "Tiêu chí"}`, evidence_type: "FILE", original_file_name: file.name || storedName, stored_file_name: storedName, mime_type: file.type || "image/jpeg", file_size: file.size, storage_bucket: bucket, storage_path: path, owner_department_id: record.owner_department_id, validity_status: "PENDING", uploaded_by: auth.user.id });
    if (evidenceError) continue;
    const { error: uploadError } = await admin.storage.from(bucket).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || "image/jpeg", upsert: false });
    if (uploadError) { await admin.from("evidence").delete().eq("id", evidenceId); continue; }
    uploadedArtifacts.push({ evidenceId, bucket, path });
    const descriptor = { evidence_id: evidenceId, captured_at: meta.captured_at || null, server_received_at: new Date().toISOString(), latitude: meta.latitude ?? null, longitude: meta.longitude ?? null, accuracy: meta.accuracy ?? null, source: meta.source || "upload", stage: "INITIAL" };
    imageLists.set(meta.item_id, [...(imageLists.get(meta.item_id) || []), descriptor]);
  }

  const rpcResponses = responses.map((row) => ({
    item_id: row.item_id,
    result: row.result,
    note: row.note?.trim() || null,
    answer_value: { result: row.result, form_context: context, initial_images: imageLists.get(row.item_id) || [], followup: row.result === "FAIL" ? { reported_at: savedAtIso, recheck_due_at: recheckDueAtIso, status: "PENDING_RECHECK" } : null },
  }));

  const { data: tx, error: txError } = await admin.rpc(SAVE_RESULTS_RPC, {
    p_round_id: round.id,
    p_actor_user_id: auth.user.id,
    p_target_area: targetArea,
    p_saved_at: savedAtIso,
    p_recheck_due_at: recheckDueAtIso,
    p_responses: rpcResponses,
  });

  if (txError) {
    await cleanupArtifacts(admin, uploadedArtifacts);
    if (isMissingRpcFunction(txError, SAVE_RESULTS_RPC)) {
      return NextResponse.json({ error: "Chức năng lưu kết quả giám sát chưa sẵn sàng trên cơ sở dữ liệu." }, { status: 503 });
    }
    const txMessage = rpcErrorMessage(txError, "Không lưu được kết quả bảng kiểm.");
    return NextResponse.json({ error: txMessage }, { status: /already exist|must be in_progress|count mismatch|invalid|duplicate|does not allow|outside current organization/i.test(txMessage) ? 409 : 400 });
  }

  const result = tx && typeof tx === "object" ? tx as Record<string, unknown> : {};
  const status = typeof result.status === "string" ? result.status : null;
  const persistedFailCount = typeof result.fail_count === "number" ? result.fail_count : failCount;
  if (!status || !["IN_PROGRESS", "AWAITING_CONFIRMATION"].includes(status)) {
    await cleanupArtifacts(admin, uploadedArtifacts);
    return NextResponse.json({ error: "Trạng thái đợt giám sát sau khi lưu không hợp lệ." }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    round_id: round.id,
    record_id: record.id,
    record_code: record.record_code,
    status,
    fail_count: persistedFailCount,
    image_count: uploadedArtifacts.length,
    checklist_saved_at: savedAtIso,
    recheck_due_at: persistedFailCount > 0 ? recheckDueAtIso : null,
    transaction: "atomic",
    result: tx,
  });
}
