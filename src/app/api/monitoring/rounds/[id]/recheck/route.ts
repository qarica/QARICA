import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingRpcFunction, rpcErrorMessage } from "@/lib/rpc-compat";

export const runtime = "nodejs";
const MAX_IMAGE_SIZE = 12 * 1024 * 1024;
const RECHECK_RPC = "qlcl_monitoring_apply_recheck_v1";
type RecheckInput = { response_id: string; description: string; result: "PASS" | "FAIL" };
type ImageMeta = { key: string; response_id: string; captured_at?: string | null; latitude?: number | null; longitude?: number | null; accuracy?: number | null; source?: string | null };
type UploadedArtifact = { evidenceId: string; bucket: string; path: string };
function safeName(name: string) { return (name || "photo.jpg").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g,"d").replace(/Đ/g,"D").replace(/[^a-zA-Z0-9._-]+/g,"-").slice(-120) || "photo.jpg"; }

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
  if (typeof rawPayload !== "string") return NextResponse.json({ error: "Thiếu dữ liệu kiểm tra lại." }, { status: 400 });
  let body: any;
  try { body = JSON.parse(rawPayload); } catch { return NextResponse.json({ error: "Dữ liệu kiểm tra lại không hợp lệ." }, { status: 400 }); }
  const rows = Array.isArray(body.rows) ? body.rows as RecheckInput[] : [];
  const images = Array.isArray(body.images) ? body.images as ImageMeta[] : [];
  if (!rows.length) return NextResponse.json({ error: "Không có nội dung kiểm tra lại." }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: caller }, { data: round }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("monitoring_rounds").select("id,record_id,workflow_status,lead_assessor_id").eq("id", roundId).maybeSingle(),
  ]);
  if (!caller?.organization_id || !caller.is_active) return NextResponse.json({ error: "Tài khoản không hợp lệ." }, { status: 403 });
  if (!round) return NextResponse.json({ error: "Không tìm thấy đợt giám sát." }, { status: 404 });
  if (round.workflow_status !== "IN_PROGRESS") return NextResponse.json({ error: "Đợt giám sát không ở trạng thái chờ kiểm tra lại." }, { status: 409 });

  const { data: record } = await admin.from("records").select("organization_id,owner_department_id").eq("id", round.record_id).maybeSingle();
  if (!record || record.organization_id !== caller.organization_id) return NextResponse.json({ error: "Đợt giám sát không thuộc bệnh viện hiện tại." }, { status: 403 });
  const { data: failResponses, error: failError } = await admin.from("checklist_responses").select("id,checklist_item_id,answer_value,result_status").eq("monitoring_round_id", roundId).eq("result_status", "FAIL").contains("answer_value", { followup: { status: "PENDING_RECHECK" } });
  if (failError) return NextResponse.json({ error: failError.message }, { status: 400 });
  if (!failResponses?.length) return NextResponse.json({ error: "Đợt giám sát không có nội dung Không đạt cần kiểm tra lại." }, { status: 409 });
  const failIds = new Set(failResponses.map((x) => x.id));
  if (rows.length !== failIds.size) return NextResponse.json({ error: `Cần hoàn tất kiểm tra lại đủ ${failIds.size}/${failIds.size} nội dung Không đạt.` }, { status: 409 });
  const seen = new Set<string>();
  for (const row of rows) {
    if (!failIds.has(row.response_id) || seen.has(row.response_id)) return NextResponse.json({ error: "Có nội dung kiểm tra lại không hợp lệ hoặc bị trùng." }, { status: 400 });
    seen.add(row.response_id);
    if (!row.description?.trim()) return NextResponse.json({ error: "Vui lòng nhập biện pháp khắc phục cho tất cả tiêu chí Không đạt." }, { status: 400 });
    if (!new Set(["PASS", "FAIL"]).has(row.result)) return NextResponse.json({ error: "Kết quả kiểm tra lại không hợp lệ." }, { status: 400 });
  }
  if (images.some((x) => !failIds.has(x.response_id) || !x.key)) return NextResponse.json({ error: "Thông tin ảnh sau khắc phục không hợp lệ." }, { status: 400 });

  const now = new Date();
  const nowIso = now.toISOString();
  const imageLists = new Map<string, any[]>();
  const uploadedArtifacts: UploadedArtifact[] = [];
  for (const meta of images) {
    const file = formData.get(meta.key);
    if (!(file instanceof File) || !file.type.startsWith("image/") || file.size <= 0 || file.size > MAX_IMAGE_SIZE) continue;
    const evidenceId = randomUUID();
    const storedName = safeName(file.name || "photo.jpg");
    const bucket = "qlcl-evidence";
    const path = `${caller.organization_id}/${round.record_id}/monitoring/${round.id}/recheck/${meta.response_id}/${evidenceId}/${storedName}`;
    const { error: evidenceError } = await admin.from("evidence").insert({ id: evidenceId, organization_id: caller.organization_id, title: "5S · Ảnh sau khắc phục", evidence_type: "FILE", original_file_name: file.name || storedName, stored_file_name: storedName, mime_type: file.type || "image/jpeg", file_size: file.size, storage_bucket: bucket, storage_path: path, owner_department_id: record.owner_department_id, validity_status: "PENDING", uploaded_by: auth.user.id });
    if (evidenceError) continue;
    const { error: uploadError } = await admin.storage.from(bucket).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || "image/jpeg", upsert: false });
    if (uploadError) { await admin.from("evidence").delete().eq("id", evidenceId); continue; }
    uploadedArtifacts.push({ evidenceId, bucket, path });
    const descriptor = { evidence_id: evidenceId, captured_at: meta.captured_at || null, server_received_at: new Date().toISOString(), latitude: meta.latitude ?? null, longitude: meta.longitude ?? null, accuracy: meta.accuracy ?? null, source: meta.source || "upload", stage: "AFTER" };
    imageLists.set(meta.response_id, [...(imageLists.get(meta.response_id) || []), descriptor]);
  }

  const rpcRows = rows.map((row) => {
    const original = failResponses.find((x) => x.id === row.response_id)!;
    const answerValue = typeof original.answer_value === "object" && original.answer_value !== null ? original.answer_value as Record<string, any> : {};
    const followup = typeof answerValue.followup === "object" && answerValue.followup !== null ? answerValue.followup as Record<string, any> : {};
    const dueAt = followup.recheck_due_at ? new Date(followup.recheck_due_at) : null;
    const elapsedMinutes = followup.reported_at ? Math.max(0, Math.round((now.getTime() - new Date(followup.reported_at).getTime()) / 60000)) : null;
    const correction = { description: row.description.trim(), reported_at: followup.reported_at || null, recheck_due_at: followup.recheck_due_at || null, rechecked_at: nowIso, recheck_result: row.result, elapsed_minutes: elapsedMinutes, within_5_minutes: dueAt ? now.getTime() <= dueAt.getTime() : null, images_after: imageLists.get(row.response_id) || [] };
    return { response_id: row.response_id, description: row.description.trim(), result: row.result, correction };
  });

  const { data: tx, error: txError } = await admin.rpc(RECHECK_RPC, {
    p_round_id: roundId,
    p_actor_user_id: auth.user.id,
    p_rechecked_at: nowIso,
    p_rows: rpcRows,
  });

  if (txError) {
    await cleanupArtifacts(admin, uploadedArtifacts);
    if (isMissingRpcFunction(txError, RECHECK_RPC)) {
      return NextResponse.json({ error: "Chức năng kiểm tra lại chưa sẵn sàng trên cơ sở dữ liệu." }, { status: 503 });
    }
    const txMessage = rpcErrorMessage(txError, "Không thể hoàn tất kiểm tra lại.");
    return NextResponse.json({ error: txMessage }, { status: /must be in_progress|count mismatch|duplicate|invalid|required|already completed/i.test(txMessage) ? 409 : 400 });
  }

  const result = tx && typeof tx === "object" ? tx as Record<string, unknown> : {};
  const status = typeof result.status === "string" ? result.status : null;
  const stillFailCount = typeof result.still_fail_count === "number"
    ? result.still_fail_count
    : rows.filter((row) => row.result === "FAIL").length;

  if (!status || !["IN_PROGRESS", "AWAITING_CONFIRMATION"].includes(status)) {
    await cleanupArtifacts(admin, uploadedArtifacts);
    return NextResponse.json({ error: "Trạng thái sau kiểm tra lại không hợp lệ." }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    status,
    still_fail_count: stillFailCount,
    rechecked_at: nowIso,
    image_count: uploadedArtifacts.length,
    transaction: "atomic",
    result: tx,
  });
}
