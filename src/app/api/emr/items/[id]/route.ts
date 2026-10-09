import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMR_CATEGORY_FIELDS } from "@/lib/emr-categories";
import { autoCreateTrainingTaskIfNeeded } from "@/lib/emr-training-auto-create";

function sanitizeDetails(category: string, raw: unknown): Record<string, unknown> {
  const fields = (EMR_CATEGORY_FIELDS as any)[category] || [];
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const value = source[f.key];
    if (value === undefined || value === null || value === "") continue;
    if (f.type === "number") { const n = Number(value); if (Number.isFinite(n)) out[f.key] = n; continue; }
    out[f.key] = String(value).trim();
  }
  return out;
}

async function loadItemOrganization(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { data, error } = await admin.from("emr_rollout_items").select("id,organization_id,status,evidence_url,category,updated_by,title,description,details,due_date,priority,publish_status").eq("id", id).maybeSingle();
  return { data, error };
}

// Mirrors items/route.ts's sanitizeDepartmentIds: body.department_ids: string[],
// empty/omitted keeps "toàn viện", every id must be an active department in
// the caller's own organization.
async function sanitizeDepartmentIds(admin: ReturnType<typeof createAdminClient>, organizationId: string, raw: unknown): Promise<{ ids: string[] } | { error: string }> {
  if (!Array.isArray(raw)) return { ids: [] };
  const ids = Array.from(new Set(raw.map((v) => String(v || "").trim()).filter(Boolean)));
  if (!ids.length) return { ids: [] };
  const { data } = await admin.from("departments").select("id").eq("organization_id", organizationId).eq("is_active", true).in("id", ids);
  const valid = new Set((data ?? []).map((d: any) => d.id));
  if (ids.some((id) => !valid.has(id))) return { error: "Khoa/phòng không hợp lệ." };
  return { ids };
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
  let justVerified = false;
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
  if (body.department_ids !== undefined) {
    const departmentIdsResult = await sanitizeDepartmentIds(admin, organizationId, body.department_ids);
    if ("error" in departmentIdsResult) return NextResponse.json({ error: departmentIdsResult.error }, { status: 400 });
    patch.department_ids = departmentIdsResult.ids;
  }
  if (typeof body.owner_department_id === "string" || body.owner_department_id === null) { const v=body.owner_department_id||null; if(v){const {data:d}=await admin.from("departments").select("id").eq("id",v).eq("organization_id",organizationId).eq("is_active",true).maybeSingle(); if(!d)return NextResponse.json({error:"Đơn vị phụ trách không hợp lệ."},{status:400});} patch.owner_department_id=v; }
  if (typeof body.is_go_live_gate === "boolean") patch.is_go_live_gate = body.is_go_live_gate;
  if (typeof body.evidence_url === "string" || body.evidence_url === null) {
    patch.evidence_url = body.evidence_url ? String(body.evidence_url).trim() : null;
    // Phát hiện Trung bình: trước đây chỉ null hoá verified_at/verified_by khi
    // evidence_url bị XOÁ (rỗng) — đổi sang 1 minh chứng KHÁC (vẫn khác rỗng)
    // không làm mất hiệu lực xác minh cũ, dù xác minh đó đã chấm trên minh
    // chứng trước đó, không phải minh chứng mới này. Null hoá bất cứ khi nào
    // evidence_url thực sự đổi giá trị (rỗng hoặc khác), không chỉ khi rỗng —
    // nếu request này cũng xác minh lại ngay (verify_completed:true) thì nhánh
    // bên dưới chạy SAU sẽ set lại verified_at/verified_by dựa trên minh chứng
    // mới, không mất tính năng xác minh trong cùng 1 request.
    if (patch.evidence_url !== existing.evidence_url) { patch.verified_at = null; patch.verified_by = null; }
  }
  if (body.verify_completed === true) {
    const effectiveStatus = typeof body.status === "string" ? body.status : existing.status;
    const effectiveEvidence = (typeof body.evidence_url === "string" || body.evidence_url === null) ? (body.evidence_url ? String(body.evidence_url).trim() : null) : existing.evidence_url;
    if (effectiveStatus !== "DONE" || !effectiveEvidence) return NextResponse.json({ error: "Chỉ xác minh khi hạng mục DONE và có minh chứng." }, { status: 400 });
    // Kiểm soát "4 mắt": người xác minh phải khác người vừa cập nhật hạng mục
    // này gần nhất (thường là người đã chuyển sang DONE) — không được tự xác
    // minh việc do chính mình thực hiện, kể cả khi chuyển DONE và xác minh
    // trong cùng một request.
    //
    // Phát hiện Cao: trước đây điều kiện này chỉ kiểm tra "request có gửi
    // status=DONE", không kiểm tra "request có THỰC SỰ đang chuyển sang DONE"
    // (existing.status khác DONE trước đó) — vì UI luôn gửi nguyên form.status
    // mỗi lần PATCH kể cả không đổi, nên mọi lượt xác minh trên hạng mục đã
    // DONE sẵn (trường hợp bình thường nhất) đều rơi vào nhánh này và bị chặn,
    // dù người xác minh là ai. Thêm điều kiện existing.status khác DONE để chỉ
    // chặn đúng trường hợp chuyển DONE + xác minh trong cùng 1 request.
    const selfTransitionToDone = typeof body.status === "string" && body.status === "DONE" && existing.status !== "DONE";
    if (selfTransitionToDone || existing.updated_by === auth.user.id) {
      return NextResponse.json({ error: "Người xác minh phải khác người vừa cập nhật hạng mục này — không thể tự xác minh việc do chính mình thực hiện." }, { status: 403 });
    }
    patch.verified_at = new Date().toISOString();
    patch.verified_by = auth.user.id;
    justVerified = true;
  }
  if (body.verify_completed === false || (body.status && body.status !== "DONE")) { patch.verified_at = null; patch.verified_by = null; }
  if (body.details !== undefined) patch.details = sanitizeDetails(existing.category, body.details);

  // Báo cáo thực tế: "Danh mục biểu mẫu còn thiếu duyệt phát hành hoặc cập
  // nhật. Sau khi duyệt mới triển khai, áp dụng, tiến độ" — chỉ BIEU_MAU cần
  // duyệt (các danh mục khác không có khái niệm "phát hành"), và duyệt là 1
  // hành động riêng (body.publish:true), không trộn với các field khác trong
  // cùng request để tránh vừa sửa nội dung vừa tự duyệt luôn trong 1 lần gọi.
  let justPublished = false;
  if (body.publish === true) {
    if (existing.category !== "BIEU_MAU") return NextResponse.json({ error: "Chỉ Biểu mẫu mới cần duyệt phát hành." }, { status: 400 });
    if (existing.publish_status === "PUBLISHED") return NextResponse.json({ error: "Biểu mẫu đã được duyệt phát hành." }, { status: 400 });
    patch.publish_status = "PUBLISHED";
    patch.published_at = new Date().toISOString();
    patch.published_by = auth.user.id;
    justPublished = true;
  }

  // "Cập nhật" nội dung khai báo (title/description/details/due_date/
  // priority — KHÔNG gồm department_ids/owner_department_id/status/
  // evidence_url vốn là tác vụ vận hành/gán phạm vi, không phải nội dung biểu
  // mẫu) của 1 biểu mẫu ĐÃ duyệt tự đưa về Nháp, đúng yêu cầu "cập nhật cũng
  // cần duyệt lại". So sánh GIÁ TRỊ thực sự đổi, không chỉ field có mặt trong
  // body — modal sửa luôn gửi lại nguyên form (kể cả field không đổi), nếu chỉ
  // kiểm tra "có mặt trong patch" thì MỌI lần sửa (kể cả đổi is_go_live_gate)
  // đều bị coi là đổi nội dung và tự rút lại duyệt một cách sai lệch.
  //
  // record_types bên trong details là GÁN PHẠM VI (ma trận "Phạm vi áp dụng"
  // chọn loại hồ sơ bệnh án), không phải nội dung khai báo của biểu mẫu — so
  // sánh details SAU KHI loại record_types ra, nếu không mỗi lần tick/bỏ tick
  // loại hồ sơ bệnh án trong ma trận sẽ bị hiểu nhầm thành "sửa nội dung" và
  // tự rút biểu mẫu đã duyệt về Nháp.
  const detailsWithoutRecordTypes = (d: Record<string, unknown> | null | undefined) => { const rest = { ...(d || {}) }; delete rest.record_types; return rest; };
  const contentChanged = existing.category === "BIEU_MAU" && !justPublished && (
    (typeof patch.title === "string" && patch.title !== existing.title) ||
    ("description" in patch && patch.description !== existing.description) ||
    ("details" in patch && JSON.stringify(detailsWithoutRecordTypes(patch.details as Record<string, unknown>)) !== JSON.stringify(detailsWithoutRecordTypes(existing.details))) ||
    ("due_date" in patch && patch.due_date !== existing.due_date) ||
    (typeof patch.priority === "string" && patch.priority !== existing.priority)
  );
  if (contentChanged && existing.publish_status === "PUBLISHED") {
    patch.publish_status = "DRAFT";
    patch.published_at = null;
    patch.published_by = null;
  }

  // Chặn chuyển trạng thái triển khai / gán phạm vi áp dụng (khoa/phòng hoặc
  // loại hồ sơ bệnh án) khi biểu mẫu còn là Nháp (chưa duyệt phát hành) —
  // đúng yêu cầu "sau khi duyệt mới triển khai, áp dụng, tiến độ". Dùng
  // publish_status HIỆU LỰC sau patch (có thể vừa tự rút lại duyệt ở nhánh
  // contentChanged phía trên trong cùng request).
  const effectivePublishStatus = typeof patch.publish_status === "string" ? patch.publish_status : existing.publish_status;
  if (existing.category === "BIEU_MAU" && effectivePublishStatus === "DRAFT") {
    if (typeof body.status === "string" && body.status !== "TODO") {
      return NextResponse.json({ error: "Biểu mẫu cần được duyệt phát hành trước khi chuyển trạng thái triển khai." }, { status: 400 });
    }
    if (body.department_ids !== undefined) {
      return NextResponse.json({ error: "Biểu mẫu cần được duyệt phát hành trước khi gán phạm vi áp dụng." }, { status: 400 });
    }
    const existingRecordTypes = (existing.details as Record<string, unknown> | null)?.record_types;
    const nextRecordTypes = (patch.details as Record<string, unknown> | undefined)?.record_types;
    if ("details" in patch && nextRecordTypes !== existingRecordTypes) {
      return NextResponse.json({ error: "Biểu mẫu cần được duyệt phát hành trước khi gán phạm vi áp dụng." }, { status: 400 });
    }
  }

  const { data, error } = await admin
    .from("emr_rollout_items")
    .update(patch)
    .eq("id", id)
    .select("id,category,title,description,status,department_ids,owner_department_id,due_date,priority,is_go_live_gate,evidence_url,verified_at,verified_by,details,publish_status,published_at,published_by,created_at,updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (existing.category === "BIEU_MAU") await autoCreateTrainingTaskIfNeeded(admin, organizationId, auth.user.id, data);

  // Status transitions are logged into the SAME audit_logs table every other
  // module already writes to (and /admin/audit-log already reads generically
  // by table_name/row_id, falling back from record_id since EMR items have
  // none) — not a new EMR-specific history table/view.
  if (typeof body.status === "string" && body.status !== existing.status) {
    const { error: auditError } = await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, table_name: "emr_rollout_items", row_id: id, action_type: `EMR_ITEM_STATUS_${body.status}`, old_value: { status: existing.status }, new_value: { status: body.status }, request_meta: { source: "qlcl-ui" } });
    if (auditError) return NextResponse.json({ error: `Đã cập nhật nhưng không ghi được audit trail: ${auditError.message}` }, { status: 500 });
  }
  // Phát hiện Trung bình: xác minh go-live gate (verify_completed) không luôn
  // đi kèm đổi status trong cùng request (trường hợp bình thường nhất: hạng
  // mục đã DONE từ trước, xác minh sau đó) — nhánh audit log ở trên bỏ sót
  // chính hành động nhạy cảm nhất của cả module. Ghi riêng khi justVerified.
  if (justVerified) {
    const { error: auditError } = await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, table_name: "emr_rollout_items", row_id: id, action_type: "EMR_ITEM_VERIFY", new_value: { evidence_url: patch.evidence_url ?? existing.evidence_url, verified_at: patch.verified_at }, request_meta: { source: "qlcl-ui" } });
    if (auditError) return NextResponse.json({ error: `Đã cập nhật nhưng không ghi được audit trail: ${auditError.message}` }, { status: 500 });
  }
  if (justPublished) {
    const { error: auditError } = await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, table_name: "emr_rollout_items", row_id: id, action_type: "EMR_ITEM_PUBLISH", new_value: { published_at: patch.published_at }, request_meta: { source: "qlcl-ui" } });
    if (auditError) return NextResponse.json({ error: `Đã duyệt nhưng không ghi được audit trail: ${auditError.message}` }, { status: 500 });
  }

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

  const { error: auditError } = await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, table_name: "emr_rollout_items", row_id: id, action_type: "EMR_ITEM_DELETE", old_value: { category: existing.category, status: existing.status }, request_meta: { source: "qlcl-ui" } });
  if (auditError) return NextResponse.json({ error: `Đã xoá nhưng không ghi được audit trail: ${auditError.message}` }, { status: 500 });

  return NextResponse.json({ ok: true });
}
