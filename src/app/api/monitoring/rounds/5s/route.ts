import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const SOURCE_CODE = "BK01.V1_QLCL.QĐ.06";
const ALLOWED_RESULTS = new Set(["PASS", "FAIL", "NA"]);
const MAX_IMAGE_SIZE = 12 * 1024 * 1024;

type InputResponse = { item_id: string; result: "PASS" | "FAIL" | "NA"; note?: string | null };
type ImageMeta = { key: string; item_id: string; captured_at?: string | null; latitude?: number | null; longitude?: number | null; accuracy?: number | null; source?: string | null; stage?: string | null };

function safeName(name: string) {
  return (name || "photo.jpg").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g,"d").replace(/Đ/g,"D").replace(/[^a-zA-Z0-9._-]+/g,"-").slice(-120) || "photo.jpg";
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("monitoring.perform");
  if (!auth.ok) return auth.response;

  const formData = await request.formData();
  const rawPayload = formData.get("payload");
  if (typeof rawPayload !== "string") return NextResponse.json({ error: "Thiếu dữ liệu bảng kiểm." }, { status: 400 });
  let body: any;
  try { body = JSON.parse(rawPayload); } catch { return NextResponse.json({ error: "Dữ liệu bảng kiểm không hợp lệ." }, { status: 400 }); }

  const templateId = String(body.template_id || "").trim();
  const versionId = String(body.version_id || "").trim();
  const monitoringDate = String(body.monitoring_date || "").trim();
  const staffName = String(body.staff_name || "").trim();
  const selectedAreas = Array.isArray(body.selected_areas) ? body.selected_areas.map((x: unknown) => String(x).trim()).filter(Boolean) : [];
  const otherArea = String(body.other_area || "").trim();
  const responses = Array.isArray(body.responses) ? body.responses as InputResponse[] : [];
  const images = Array.isArray(body.images) ? body.images as ImageMeta[] : [];

  if (!templateId || !versionId) return NextResponse.json({ error: "Thiếu thông tin bảng kiểm." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(monitoringDate)) return NextResponse.json({ error: "Ngày giám sát không hợp lệ." }, { status: 400 });
  if (!staffName) return NextResponse.json({ error: "Vui lòng nhập nhân viên thực hiện 5S." }, { status: 400 });
  if (!selectedAreas.length && !otherArea) return NextResponse.json({ error: "Vui lòng chọn hoặc nhập ít nhất một khu vực đánh giá." }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: caller }, { data: template }, { data: version }, { data: items }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active,full_name").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("checklist_templates").select("id,code,name,owner_department_id,is_active").eq("id", templateId).maybeSingle(),
    admin.from("checklist_versions").select("id,checklist_template_id,status,version_no").eq("id", versionId).maybeSingle(),
    admin.from("checklist_items").select("id,content,allow_na,sequence_no").eq("checklist_version_id", versionId),
  ]);

  if (!caller?.organization_id || !caller.is_active) return NextResponse.json({ error: "Tài khoản không hợp lệ." }, { status: 403 });
  if (!template || !template.is_active || template.code !== SOURCE_CODE) return NextResponse.json({ error: "Mẫu bảng kiểm 5S không hợp lệ." }, { status: 400 });
  if (!version || version.checklist_template_id !== templateId || version.status !== "PUBLISHED") return NextResponse.json({ error: "Chỉ được sử dụng phiên bản bảng kiểm đã phát hành." }, { status: 409 });
  if (!template.owner_department_id) return NextResponse.json({ error: "Mẫu bảng kiểm chưa có đơn vị quản lý." }, { status: 400 });
  const { data: ownerDepartment } = await admin.from("departments").select("organization_id").eq("id", template.owner_department_id).maybeSingle();
  if (!ownerDepartment || ownerDepartment.organization_id !== caller.organization_id) return NextResponse.json({ error: "Mẫu bảng kiểm không thuộc bệnh viện hiện tại." }, { status: 403 });

  const itemIds = new Set((items ?? []).map((x) => x.id));
  if (!itemIds.size || responses.length !== itemIds.size) return NextResponse.json({ error: `Phải đánh giá đầy đủ ${itemIds.size} nội dung trước khi lưu bảng kiểm.` }, { status: 409 });
  const seen = new Set<string>();
  for (const row of responses) {
    if (!itemIds.has(row.item_id) || seen.has(row.item_id) || !ALLOWED_RESULTS.has(row.result)) return NextResponse.json({ error: "Dữ liệu đánh giá có tiêu chí hoặc kết quả không hợp lệ." }, { status: 400 });
    seen.add(row.item_id);
    if (row.result === "NA") {
      const item = (items ?? []).find((x) => x.id === row.item_id);
      if (!item?.allow_na) return NextResponse.json({ error: `Tiêu chí “${item?.content || row.item_id}” không cho phép “/”.` }, { status: 400 });
    }
  }
  if (images.some((x) => !itemIds.has(x.item_id) || !x.key)) return NextResponse.json({ error: "Thông tin hình ảnh không hợp lệ." }, { status: 400 });

  const workYear = Number(monitoringDate.slice(0, 4));
  const areaList = [...selectedAreas, ...(otherArea ? otherArea.split(";").map((x) => x.trim()).filter(Boolean) : [])];
  const targetArea = areaList.join("; ");
  const savedAt = new Date();
  const savedAtIso = savedAt.toISOString();
  const recheckDueAtIso = new Date(savedAt.getTime() + 5 * 60 * 1000).toISOString();
  const failCount = responses.filter((row) => row.result === "FAIL").length;
  const initialStatus = failCount > 0 ? "IN_PROGRESS" : "AWAITING_CONFIRMATION";

  const { data: recordCode, error: codeError } = await admin.rpc("next_record_code", { p_org: caller.organization_id, p_record_type: "MONITORING", p_work_year: workYear });
  if (codeError || !recordCode) return NextResponse.json({ error: codeError?.message || "Không tạo được mã hồ sơ giám sát." }, { status: 400 });
  const { data: record, error: recordError } = await admin.from("records").insert({ organization_id: caller.organization_id, record_type: "MONITORING", record_code: recordCode, title: `Giám sát 5S - Bên ngoài bệnh viện - ${monitoringDate}`, work_year: workYear, owner_department_id: template.owner_department_id, owner_user_id: auth.user.id, lifecycle_status: "ACTIVE", created_by: auth.user.id }).select("id,record_code").single();
  if (recordError || !record) return NextResponse.json({ error: recordError?.message || "Không tạo được hồ sơ giám sát." }, { status: 400 });
  const { data: round, error: roundError } = await admin.from("monitoring_rounds").insert({ record_id: record.id, checklist_version_id: versionId, work_year: workYear, scheduled_date: monitoringDate, started_at: savedAtIso, completed_at: failCount > 0 ? null : savedAtIso, target_department_id: null, target_area: targetArea, lead_assessor_id: auth.user.id, workflow_status: initialStatus }).select("id").single();
  if (roundError || !round) { await admin.from("records").update({ lifecycle_status: "ARCHIVED" }).eq("id", record.id); return NextResponse.json({ error: roundError?.message || "Không tạo được đợt giám sát." }, { status: 400 }); }
  await admin.from("monitoring_assignments").insert({ monitoring_round_id: round.id, user_id: auth.user.id, assignment_role: "LEAD_ASSESSOR" });

  const context = { source_code: SOURCE_CODE, template_id: templateId, version_id: versionId, version_no: version.version_no, monitoring_date: monitoringDate, selected_areas: areaList, staff_name: staffName, assessor_user_id: auth.user.id, assessor_name: caller.full_name || null, checklist_saved_at: savedAtIso };
  const responsePayload = responses.map((row) => ({ monitoring_round_id: round.id, checklist_item_id: row.item_id, answer_value: { result: row.result, form_context: context, initial_images: [], followup: row.result === "FAIL" ? { reported_at: savedAtIso, recheck_due_at: recheckDueAtIso, status: "PENDING_RECHECK" } : null }, result_status: row.result, score: row.result === "PASS" ? 1 : row.result === "FAIL" ? 0 : null, note: row.note?.trim() || null, na_reason: null, answered_by: auth.user.id, answered_at: savedAtIso, followup_disposition: row.result === "FAIL" ? "IMMEDIATE_CORRECTION" : "NONE" }));
  const { data: savedResponses, error: responseError } = await admin.from("checklist_responses").insert(responsePayload).select("id,checklist_item_id,answer_value");
  if (responseError || !savedResponses || savedResponses.length !== responses.length) { await admin.from("monitoring_rounds").update({ workflow_status: "CANCELLED" }).eq("id", round.id); await admin.from("records").update({ lifecycle_status: "ARCHIVED" }).eq("id", record.id); return NextResponse.json({ error: responseError?.message || "Không lưu được kết quả bảng kiểm." }, { status: 400 }); }

  const responseByItem = new Map(savedResponses.map((x) => [x.checklist_item_id, x]));
  const imageLists = new Map<string, any[]>();
  for (const meta of images) {
    const file = formData.get(meta.key);
    if (!(file instanceof File) || !file.type.startsWith("image/") || file.size <= 0 || file.size > MAX_IMAGE_SIZE) continue;
    const response = responseByItem.get(meta.item_id);
    if (!response) continue;
    const evidenceId = randomUUID();
    const storedName = safeName(file.name || "photo.jpg");
    const bucket = "qlcl-evidence";
    const path = `${caller.organization_id}/${record.id}/monitoring/${round.id}/${meta.item_id}/${evidenceId}/${storedName}`;
    const item = (items ?? []).find((x) => x.id === meta.item_id);
    const { error: evidenceError } = await admin.from("evidence").insert({ id: evidenceId, organization_id: caller.organization_id, title: `5S · Ảnh ban đầu · ${item?.content || "Tiêu chí"}`, evidence_type: "FILE", original_file_name: file.name || storedName, stored_file_name: storedName, mime_type: file.type || "image/jpeg", file_size: file.size, storage_bucket: bucket, storage_path: path, owner_department_id: template.owner_department_id, validity_status: "PENDING", uploaded_by: auth.user.id });
    if (evidenceError) continue;
    const { error: uploadError } = await admin.storage.from(bucket).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || "image/jpeg", upsert: false });
    if (uploadError) { await admin.from("evidence").delete().eq("id", evidenceId); continue; }
    const descriptor = { evidence_id: evidenceId, captured_at: meta.captured_at || null, server_received_at: new Date().toISOString(), latitude: meta.latitude ?? null, longitude: meta.longitude ?? null, accuracy: meta.accuracy ?? null, source: meta.source || "upload", stage: "INITIAL" };
    imageLists.set(meta.item_id, [...(imageLists.get(meta.item_id) || []), descriptor]);
  }

  for (const [itemId, list] of imageLists.entries()) {
    const response = responseByItem.get(itemId); if (!response) continue;
    const value = typeof response.answer_value === "object" && response.answer_value !== null ? response.answer_value as Record<string, any> : {};
    await admin.from("checklist_responses").update({ answer_value: { ...value, initial_images: list } }).eq("id", response.id);
  }

  return NextResponse.json({ ok: true, round_id: round.id, record_id: record.id, record_code: record.record_code, status: initialStatus, fail_count: failCount, image_count: images.length, checklist_saved_at: savedAtIso, recheck_due_at: failCount > 0 ? recheckDueAtIso : null });
}
