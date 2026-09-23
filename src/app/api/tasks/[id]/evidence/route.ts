import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { EVIDENCE_ALLOWED_EXTENSIONS, evidenceFilePolicy } from "@/lib/evidence-file-policy";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 25 * 1024 * 1024;

function safeFileName(name: string) {
  const trimmed = name.trim() || "minh-chung";
  const cleaned = trimmed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (cleaned || "minh-chung").slice(-150);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("evidence.upload");
  if (!auth.ok) return auth.response;

  const { id: recordId } = await params;
  const formData = await request.formData();
  const fileValue = formData.get("file");
  const requestedTitle = String(formData.get("title") || "").trim();

  if (!(fileValue instanceof File)) {
    return NextResponse.json({ error: "Vui lòng chọn file minh chứng." }, { status: 400 });
  }
  if (fileValue.size <= 0) {
    return NextResponse.json({ error: "File minh chứng đang trống." }, { status: 400 });
  }
  if (fileValue.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Dung lượng file tối đa là 25 MB." }, { status: 400 });
  }

  const originalFileName = fileValue.name || "minh-chung";
  const filePolicy = evidenceFilePolicy(originalFileName);
  if (!filePolicy) {
    return NextResponse.json(
      { error: `Loại file không được phép. Chỉ chấp nhận: ${EVIDENCE_ALLOWED_EXTENSIONS.join(", ")}.` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const [{ data: caller, error: callerError }, { data: record, error: recordError }] = await Promise.all([
    admin.from("profiles").select("user_id,organization_id,primary_department_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("records").select("id,organization_id,record_type,lifecycle_status,title").eq("id", recordId).maybeSingle(),
  ]);

  if (callerError || !caller?.organization_id || !caller.is_active) {
    return NextResponse.json({ error: callerError?.message || "Tài khoản không hợp lệ hoặc chưa gắn bệnh viện." }, { status: 403 });
  }
  if (recordError || !record || record.record_type !== "ACTION") {
    return NextResponse.json({ error: recordError?.message || "Không tìm thấy công việc." }, { status: 404 });
  }
  if (record.organization_id !== caller.organization_id || record.lifecycle_status !== "ACTIVE") {
    return NextResponse.json({ error: "Công việc không thuộc phạm vi bệnh viện hiện tại hoặc đã ngưng hoạt động." }, { status: 403 });
  }

  const { data: action, error: actionError } = await admin
    .from("actions")
    .select("id,assignment_target_type,assignee_user_id,assignee_group_id,lead_department_id,workflow_status")
    .eq("record_id", recordId)
    .maybeSingle();
  if (actionError || !action) {
    return NextResponse.json({ error: actionError?.message || "Không tìm thấy nội dung công việc." }, { status: 404 });
  }

  const { data: canManage } = await auth.supabase.rpc("has_permission", { p_permission_code: "plans.manage" });
  let isAssignee = action.assignee_user_id === auth.user.id;
  if (action.assignment_target_type === "GROUP" && action.assignee_group_id) {
    // member_snapshot is JSONB; avoid PostgREST .contains() encoding here since it can
    // produce invalid JSON for some client/runtime combinations. Fetch and filter in JS.
    const { data: assignmentSnapshot, error: snapshotError } = await admin
      .from("work_group_assignment_snapshots")
      .select("member_snapshot")
      .eq("target_record_id", recordId)
      .eq("group_id", action.assignee_group_id)
      .eq("assignment_role", "ACTION_ASSIGNEE_GROUP")
      .maybeSingle();
    if (snapshotError) return NextResponse.json({ error: snapshotError.message }, { status: 400 });
    isAssignee = (Array.isArray(assignmentSnapshot?.member_snapshot) ? assignmentSnapshot.member_snapshot : [])
      .some((member: any) => String(member?.user_id || "").trim() === auth.user.id);
  }
  let departmentExecutionId: string | null = null;
  if (action.assignment_target_type === "DEPARTMENT" && caller.primary_department_id) {
    const { data: execution, error: executionError } = await admin.from("action_department_executions").select("id,workflow_status").eq("action_id", action.id).eq("department_id", caller.primary_department_id).maybeSingle();
    if (executionError) return NextResponse.json({ error: executionError.message }, { status: 400 });
    if (execution) {
      const { data: roleRows, error: roleError } = await admin.from("department_user_roles").select("id").eq("department_id", caller.primary_department_id).eq("user_id", auth.user.id).eq("is_active", true).in("role_type", ["HEAD","QUALITY_NETWORK_MEMBER"]);
      if (roleError) return NextResponse.json({ error: roleError.message }, { status: 400 });
      isAssignee = (roleRows ?? []).length > 0;
      departmentExecutionId = execution.id;
      if (!["IN_PROGRESS","RETURNED"].includes(String(execution.workflow_status))) return NextResponse.json({ error: "Khoa/Phòng chưa ở trạng thái thực hiện hoặc bổ sung minh chứng." }, { status: 409 });
    }
  }
  if (!isAssignee && !canManage) {
    return NextResponse.json({ error: "Chỉ cá nhân/nhóm được giao việc hoặc người quản lý kế hoạch mới được nộp minh chứng." }, { status: 403 });
  }
  if (action.workflow_status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "Chỉ được nộp minh chứng khi công việc đang thực hiện." }, { status: 409 });
  }

  // Nếu Action thuộc kế hoạch, việc nộp minh chứng chỉ được thực hiện khi
  // ít nhất một kế hoạch nguồn đang ở trạng thái IN_PROGRESS.
  const { data: planLinks, error: planLinksError } = await admin
    .from("program_action_links")
    .select("program_id")
    .eq("action_id", action.id);
  if (planLinksError) return NextResponse.json({ error: planLinksError.message }, { status: 400 });

  const programIds = Array.from(new Set((planLinks ?? []).map((row) => row.program_id).filter(Boolean)));
  if (programIds.length) {
    const { data: sourcePrograms, error: sourceProgramsError } = await admin
      .from("work_programs")
      .select("id,workflow_status")
      .in("id", programIds);
    if (sourceProgramsError) return NextResponse.json({ error: sourceProgramsError.message }, { status: 400 });

    const hasActiveSourcePlan = (sourcePrograms ?? []).some((program) => program.workflow_status === "IN_PROGRESS");
    if (!hasActiveSourcePlan) {
      return NextResponse.json(
        { error: "Kế hoạch nguồn hiện chưa ở trạng thái Đang triển khai. Không thể nộp minh chứng cho công việc lúc này." },
        { status: 409 },
      );
    }
  }

  const evidenceId = randomUUID();
  const storedFileName = safeFileName(originalFileName);
  const storageBucket = "qlcl-evidence";
  const storagePath = `${caller.organization_id}/${recordId}/${evidenceId}/${storedFileName}`;
  const title = requestedTitle || originalFileName;
  const mimeType = filePolicy.mimeType;

  const { error: metadataError } = await admin.from("evidence").insert({
    id: evidenceId,
    organization_id: caller.organization_id,
    title,
    evidence_type: "FILE",
    original_file_name: originalFileName,
    stored_file_name: storedFileName,
    mime_type: mimeType,
    file_size: fileValue.size,
    storage_bucket: storageBucket,
    storage_path: storagePath,
    owner_department_id: action.assignment_target_type === "DEPARTMENT" ? caller.primary_department_id : action.lead_department_id,
    validity_status: "PENDING",
    uploaded_by: auth.user.id,
  });
  if (metadataError) return NextResponse.json({ error: metadataError.message }, { status: 400 });

  const fileBuffer = Buffer.from(await fileValue.arrayBuffer());
  const { error: uploadError } = await admin.storage.from(storageBucket).upload(storagePath, fileBuffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (uploadError) {
    await admin.from("evidence").delete().eq("id", evidenceId);
    return NextResponse.json({ error: `Không tải được file minh chứng: ${uploadError.message}` }, { status: 400 });
  }

  const { error: linkError } = await admin.from("evidence_links").insert({
    evidence_id: evidenceId,
    record_id: recordId,
    evidence_role: "ACTION_RESULT",
    linked_by: auth.user.id,
    action_department_execution_id: departmentExecutionId,
  });
  if (linkError) {
    await admin.storage.from(storageBucket).remove([storagePath]);
    await admin.from("evidence").delete().eq("id", evidenceId);
    return NextResponse.json({ error: linkError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, evidence_id: evidenceId, title, file_name: originalFileName });
}
