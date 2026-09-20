import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { taskVerificationPermissions } from "@/lib/task-verification-policy";

const WORKFLOW_ACTIONS = new Set(["START", "RESUME", "SUBMIT", "BEGIN_VERIFY", "APPROVE", "RETURN"]);
const VERIFIER_ACTIONS = new Set(["BEGIN_VERIFY", "APPROVE", "RETURN"]);
const EXECUTION_ACTIONS = new Set(["START", "RESUME", "SUBMIT"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("tasks.view");
  if (!auth.ok) return auth.response;

  const { id: recordId } = await params;
  const body = await request.json();
  const requestedAction = String(body.action || "").trim().toUpperCase();
  const note = body.note ? String(body.note).trim() : "";
  if (!WORKFLOW_ACTIONS.has(requestedAction)) {
    return NextResponse.json({ error: "Thao tác workflow không hợp lệ." }, { status: 400 });
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
    .select("id,assignment_target_type,assignee_user_id,assignee_group_id,workflow_status")
    .eq("record_id", recordId)
    .maybeSingle();
  if (actionError || !action) {
    return NextResponse.json({ error: actionError?.message || "Không tìm thấy nội dung công việc." }, { status: 404 });
  }

  const [{ data: planLinks, error: planLinksError }, { data: sourceLinks, error: sourceLinksError }] = await Promise.all([
    admin.from("program_action_links").select("program_id").eq("action_id", action.id),
    admin.from("record_links").select("source_record_id").eq("target_record_id", recordId).eq("relation_type", "HAS_ACTION"),
  ]);
  if (planLinksError || sourceLinksError) return NextResponse.json({ error: planLinksError?.message || sourceLinksError?.message }, { status: 400 });
  const sourceRecordIds = Array.from(new Set((sourceLinks ?? []).map((row) => row.source_record_id).filter(Boolean)));
  const { data: sourceRecords, error: sourceRecordsError } = sourceRecordIds.length
    ? await admin.from("records").select("record_type").in("id", sourceRecordIds).eq("organization_id", caller.organization_id)
    : { data: [], error: null };
  if (sourceRecordsError) return NextResponse.json({ error: sourceRecordsError.message }, { status: 400 });
  const sourceRecordTypes = Array.from(new Set((sourceRecords ?? []).map((row) => String(row.record_type || "")).filter(Boolean)));
  const verifierPermissions = taskVerificationPermissions(sourceRecordTypes, (planLinks ?? []).length > 0);
  const permissionResults = await Promise.all(verifierPermissions.map((permission) => auth.supabase.rpc("has_permission", { p_permission_code: permission })));
  const canManage = permissionResults.some((result) => result.data === true);
  let isAssignee = action.assignee_user_id === auth.user.id;
  let groupRecipientIds: string[] = [];
  if (action.assignment_target_type === "GROUP" && action.assignee_group_id) {
    const { data: assignmentSnapshot, error: snapshotError } = await admin
      .from("work_group_assignment_snapshots")
      .select("member_snapshot")
      .eq("target_record_id", recordId)
      .eq("group_id", action.assignee_group_id)
      .eq("assignment_role", "ACTION_ASSIGNEE_GROUP")
      .maybeSingle();
    if (snapshotError) return NextResponse.json({ error: snapshotError.message }, { status: 400 });

    const snapshotIds = Array.from(new Set(
      (Array.isArray(assignmentSnapshot?.member_snapshot) ? assignmentSnapshot.member_snapshot : [])
        .map((row: any) => String(row?.user_id || "").trim())
        .filter(Boolean),
    ));
    isAssignee = snapshotIds.includes(auth.user.id);

    if (snapshotIds.length) {
      const { data: activeProfiles, error: activeProfilesError } = await admin
        .from("profiles")
        .select("user_id")
        .in("user_id", snapshotIds)
        .eq("organization_id", caller.organization_id)
        .eq("is_active", true);
      if (activeProfilesError) return NextResponse.json({ error: activeProfilesError.message }, { status: 400 });
      groupRecipientIds = Array.from(new Set((activeProfiles ?? []).map((row) => row.user_id).filter(Boolean))) as string[];
    }
  }

  let departmentExecution: any = null;
  let departmentRecipientIds: string[] = [];
  if (action.assignment_target_type === "DEPARTMENT" && caller.primary_department_id) {
    const { data: execution, error: executionError } = await admin.from("action_department_executions").select("id,department_id,workflow_status").eq("action_id",action.id).eq("department_id",caller.primary_department_id).maybeSingle();
    if (executionError) return NextResponse.json({error:executionError.message},{status:400});
    departmentExecution=execution;
    if (execution) {
      const {data: roles,error:rolesError}=await admin.from("department_user_roles").select("user_id").eq("department_id",caller.primary_department_id).eq("is_active",true).in("role_type",["HEAD","QUALITY_NETWORK_MEMBER"]);
      if (rolesError) return NextResponse.json({error:rolesError.message},{status:400});
      departmentRecipientIds=Array.from(new Set((roles??[]).map((x:any)=>x.user_id).filter(Boolean))) as string[];
      isAssignee=departmentRecipientIds.includes(auth.user.id);
    }
  }

  const executionRecipientIds = action.assignment_target_type === "GROUP"
    ? groupRecipientIds
    : action.assignment_target_type === "DEPARTMENT"
      ? departmentRecipientIds
      : (action.assignee_user_id ? [action.assignee_user_id] : []);

  if (VERIFIER_ACTIONS.has(requestedAction) && !canManage) {
    return NextResponse.json({ error: "Bạn không có quyền xác minh công việc này." }, { status: 403 });
  }
  if (!VERIFIER_ACTIONS.has(requestedAction) && !isAssignee && !canManage) {
    return NextResponse.json({ error: "Chỉ cá nhân, thành viên nhóm, hoặc Trưởng/Phụ trách và thành viên Mạng lưới QLCL của khoa/phòng được giao mới được cập nhật công việc này." }, { status: 403 });
  }

  // Công việc gắn với kế hoạch chỉ được bắt đầu/tiếp tục/gửi xác minh khi
  // ít nhất một kế hoạch nguồn đang thực sự ở trạng thái IN_PROGRESS.
  // Các bước xác minh đã nộp vẫn được phép xử lý để không làm kẹt hồ sơ.
  if (EXECUTION_ACTIONS.has(requestedAction)) {
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
          { error: "Kế hoạch nguồn hiện chưa ở trạng thái Đang triển khai. Không thể thực hiện hoặc gửi xác minh công việc lúc này." },
          { status: 409 },
        );
      }
    }
  }

  if (requestedAction === "SUBMIT") {
    if (action.workflow_status !== "IN_PROGRESS") {
      return NextResponse.json({ error: "Chỉ công việc đang thực hiện mới được gửi xác minh." }, { status: 409 });
    }

    let evidenceCountQuery = admin.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId);
    if (action.assignment_target_type === "DEPARTMENT" && departmentExecution) evidenceCountQuery = evidenceCountQuery.eq("action_department_execution_id", departmentExecution.id);
    const { count: evidenceCount, error: evidenceError } = await evidenceCountQuery;
    if (evidenceError) return NextResponse.json({ error: evidenceError.message }, { status: 400 });
    if (!evidenceCount) {
      return NextResponse.json({ error: "Cần nộp ít nhất 01 minh chứng trước khi gửi xác minh." }, { status: 400 });
    }

    if (action.assignment_target_type === "DEPARTMENT" && departmentExecution) {
      const submittedAt=new Date().toISOString();
      const {error:executionSubmitError}=await admin.from("action_department_executions").update({workflow_status:"SUBMITTED",submitted_at:submittedAt,submitted_by:auth.user.id,updated_at:submittedAt}).eq("id",departmentExecution.id).in("workflow_status",["NOT_STARTED","IN_PROGRESS"]);
      if (executionSubmitError) return NextResponse.json({error:executionSubmitError.message},{status:400});
      // Execution của từng khoa là nguồn trạng thái thật. Action cha chỉ tổng hợp:
      // còn khoa chưa nộp => IN_PROGRESS; tất cả đã nộp/xác minh/waive => EVIDENCE_SUBMITTED.
      const {data:pendingExecutions,error:pendingError}=await admin.from("action_department_executions").select("id").eq("action_id",action.id).not("workflow_status","in","(SUBMITTED,VERIFIED,WAIVED)").limit(1);
      if (pendingError) return NextResponse.json({error:pendingError.message},{status:400});
      if ((pendingExecutions??[]).length) return NextResponse.json({ok:true,department_execution_status:"SUBMITTED",workflow_status:"IN_PROGRESS"});

      const { error: aggregateSubmitError } = await admin
        .from("actions")
        .update({
          workflow_status: "EVIDENCE_SUBMITTED",
          submitted_at: submittedAt,
          verified_at: null,
          verified_by: null,
          completion_note: null,
        })
        .eq("id", action.id)
        .eq("workflow_status", "IN_PROGRESS");
      if (aggregateSubmitError) return NextResponse.json({ error: aggregateSubmitError.message }, { status: 400 });
      return NextResponse.json({ ok: true, department_execution_status: "SUBMITTED", workflow_status: "EVIDENCE_SUBMITTED" });
    }

    const { error: submitError } = await admin
      .from("actions")
      .update({
        workflow_status: "EVIDENCE_SUBMITTED",
        submitted_at: new Date().toISOString(),
        verified_at: null,
        verified_by: null,
        completion_note: null,
      })
      .eq("id", action.id)
      .eq("workflow_status", "IN_PROGRESS");
    if (submitError) return NextResponse.json({ error: submitError.message }, { status: 400 });

    return NextResponse.json({ ok: true, workflow_status: "EVIDENCE_SUBMITTED" });
  }

  if (requestedAction === "BEGIN_VERIFY") {
    if (action.workflow_status !== "EVIDENCE_SUBMITTED") {
      return NextResponse.json({ error: "Công việc chưa ở trạng thái sẵn sàng xác minh." }, { status: 409 });
    }
    const { error } = await admin
      .from("actions")
      .update({ workflow_status: "VERIFYING" })
      .eq("id", action.id)
      .eq("workflow_status", "EVIDENCE_SUBMITTED");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, workflow_status: "VERIFYING" });
  }

  if (requestedAction === "RETURN") {
    if (note.length < 5) {
      return NextResponse.json({ error: "Vui lòng ghi rõ nội dung cần bổ sung." }, { status: 400 });
    }
    if (action.assignment_target_type === "DEPARTMENT") {
      const targetExecutionId = body.department_execution_id ? String(body.department_execution_id).trim() : "";
      if (!targetExecutionId) return NextResponse.json({error:"Cần chọn đúng khoa/phòng cần trả lại bổ sung."},{status:400});
      const {data:submittedExecutions,error:submittedExecutionsError}=await admin.from("action_department_executions").select("id").eq("action_id",action.id).eq("id",targetExecutionId).eq("workflow_status","SUBMITTED");
      if (submittedExecutionsError) return NextResponse.json({error:submittedExecutionsError.message},{status:400});
      if (!(submittedExecutions??[]).length) return NextResponse.json({error:"Không có khoa/phòng nào đang chờ bổ sung."},{status:409});
      const returnedAt=new Date().toISOString();
      const {error:returnExecutionError}=await admin.from("action_department_executions").update({workflow_status:"RETURNED",note,verified_at:null,verified_by:null,completed_at:null,completed_by:null,updated_at:returnedAt}).in("id",(submittedExecutions??[]).map((x:any)=>x.id));
      if (returnExecutionError) return NextResponse.json({error:returnExecutionError.message},{status:400});
      const { data: targetDepartment } = await admin.from("action_department_executions").select("department_id").eq("id", targetExecutionId).maybeSingle();
      if (targetDepartment?.department_id) {
        const { data: recipientRoles } = await admin.from("department_user_roles").select("user_id").eq("department_id", targetDepartment.department_id).eq("is_active", true).in("role_type", ["HEAD","QUALITY_NETWORK_MEMBER"]);
        const recipientIds = Array.from(new Set((recipientRoles ?? []).map((row: any) => row.user_id).filter(Boolean))) as string[];
        if (recipientIds.length) {
          const eventStamp = Date.now();
          await admin.from("notifications").insert(recipientIds.map((recipientUserId) => ({
            recipient_user_id: recipientUserId,
            notification_type: "ACTION_RETURNED",
            priority: "HIGH",
            title: "Công việc cần bổ sung",
            message: `${record.title}: ${note}`,
            target_record_id: recordId,
            target_route: `/tasks/${recordId}`,
            notification_event_key: `action-returned:${action.id}:${targetExecutionId}:${recipientUserId}:${eventStamp}`,
          })));
        }
      }
      return NextResponse.json({ok:true,workflow_status:action.workflow_status,department_execution_status:"RETURNED"});
    }
    if (action.workflow_status !== "VERIFYING") return NextResponse.json({ error: "Chỉ công việc đang xác minh mới được trả lại bổ sung." }, { status: 409 });
    const { error } = await admin
      .from("actions")
      .update({ workflow_status: "RETURNED", completion_note: note, verified_at: null, verified_by: null })
      .eq("id", action.id)
      .eq("workflow_status", "VERIFYING");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (executionRecipientIds.length) {
      const eventStamp = Date.now();
      await admin.from("notifications").insert(executionRecipientIds.map((recipientUserId) => ({
        recipient_user_id: recipientUserId,
        notification_type: "ACTION_RETURNED",
        priority: "HIGH",
        title: "Công việc cần bổ sung",
        message: `${record.title}: ${note}`,
        target_record_id: recordId,
        target_route: `/tasks/${recordId}`,
        notification_event_key: `action-returned:${action.id}:${recipientUserId}:${eventStamp}`,
      })));
    }
    return NextResponse.json({ ok: true, workflow_status: "RETURNED" });
  }

  if (requestedAction === "APPROVE") {
    let evidenceLinksQuery = admin.from("evidence_links").select("evidence_id").eq("record_id", recordId);
    const targetExecutionId = action.assignment_target_type === "DEPARTMENT" && body.department_execution_id ? String(body.department_execution_id).trim() : "";
    if (action.assignment_target_type === "DEPARTMENT") {
      if (!targetExecutionId) return NextResponse.json({error:"Cần chọn đúng khoa/phòng cần xác minh."},{status:400});
      evidenceLinksQuery = evidenceLinksQuery.eq("action_department_execution_id",targetExecutionId);
    } else if (action.workflow_status !== "VERIFYING") {
      return NextResponse.json({ error: "Chỉ công việc đang xác minh mới được xác nhận hoàn thành." }, { status: 409 });
    }
    const { data: evidenceLinks, error: evidenceLinksError } = await evidenceLinksQuery;
    if (evidenceLinksError) {
      return NextResponse.json({ error: evidenceLinksError.message }, { status: 400 });
    }
    const evidenceIds = (evidenceLinks ?? []).map((row) => row.evidence_id).filter(Boolean);

    const verifiedAt = new Date().toISOString();

    if (action.assignment_target_type === "DEPARTMENT") {
      const {data:submittedExecutions,error:submittedExecutionsError}=await admin.from("action_department_executions").select("id,department_id").eq("action_id",action.id).eq("id",targetExecutionId).eq("workflow_status","SUBMITTED");
      if (submittedExecutionsError) return NextResponse.json({error:submittedExecutionsError.message},{status:400});
      if (!(submittedExecutions??[]).length) return NextResponse.json({error:"Không có khoa/phòng nào đang chờ xác minh."},{status:409});
      // Xác minh Action tại thời điểm này áp dụng cho các execution đã gửi; mỗi đơn vị chỉ cần một người hợp lệ thực hiện.
      const submittedIds=(submittedExecutions??[]).map((x:any)=>x.id);
      if (!evidenceIds.length) return NextResponse.json({error:"Khoa/Phòng chưa có minh chứng để xác minh."},{status:409});
      const {error:evidenceUpdateError}=await admin.from("evidence").update({validity_status:"VALID"}).in("id",evidenceIds).eq("validity_status","PENDING");
      if (evidenceUpdateError) return NextResponse.json({error:evidenceUpdateError.message},{status:400});
      const {error:verifyExecutionsError}=await admin.from("action_department_executions").update({workflow_status:"VERIFIED",verified_at:verifiedAt,verified_by:auth.user.id,completed_at:verifiedAt,completed_by:auth.user.id,note:note||null,updated_at:verifiedAt}).in("id",submittedIds);
      if (verifyExecutionsError) {
        await admin.from("evidence").update({validity_status:"PENDING"}).in("id",evidenceIds).eq("validity_status","VALID");
        return NextResponse.json({error:verifyExecutionsError.message},{status:400});
      }
      const {data:remainingExecutions,error:remainingExecutionsError}=await admin.from("action_department_executions").select("id").eq("action_id",action.id).not("workflow_status","in","(VERIFIED,WAIVED)").limit(1);
      if (remainingExecutionsError) return NextResponse.json({error:remainingExecutionsError.message},{status:400});
      if ((remainingExecutions??[]).length) {
        return NextResponse.json({ok:true,workflow_status:action.workflow_status,department_execution_status:"VERIFIED",aggregate_complete:false});
      }
      const {error:aggregateCompleteError}=await admin.from("actions").update({workflow_status:"COMPLETED",verified_at:verifiedAt,verified_by:auth.user.id,completion_note:note||null}).eq("id",action.id).in("workflow_status",["IN_PROGRESS","EVIDENCE_SUBMITTED","VERIFYING"]);
      if (aggregateCompleteError) return NextResponse.json({error:aggregateCompleteError.message},{status:400});
      return NextResponse.json({ok:true,workflow_status:"COMPLETED",department_execution_status:"VERIFIED",aggregate_complete:true,verified_at:verifiedAt});
    }

    const { error } = await admin
      .from("actions")
      .update({
        workflow_status: "COMPLETED",
        verified_at: verifiedAt,
        verified_by: auth.user.id,
        completion_note: note || null,
      })
      .eq("id", action.id)
      .eq("workflow_status", "VERIFYING");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (evidenceIds.length) {
      const { error: evidenceUpdateError } = await admin
        .from("evidence")
        .update({ validity_status: "VALID" })
        .in("id", evidenceIds)
        .eq("validity_status", "PENDING");

      if (evidenceUpdateError) {
        await admin
          .from("actions")
          .update({ workflow_status: "VERIFYING", verified_at: null, verified_by: null, completion_note: null })
          .eq("id", action.id)
          .eq("workflow_status", "COMPLETED");
        return NextResponse.json({ error: `Không thể cập nhật trạng thái minh chứng: ${evidenceUpdateError.message}` }, { status: 400 });
      }
    }

    if (executionRecipientIds.length) {
      const eventStamp = Date.now();
      await admin.from("notifications").insert(executionRecipientIds.map((recipientUserId) => ({
        recipient_user_id: recipientUserId,
        notification_type: "ACTION_VERIFIED",
        priority: "NORMAL",
        title: "Công việc đã được xác minh hoàn thành",
        message: record.title,
        target_record_id: recordId,
        target_route: `/tasks/${recordId}`,
        notification_event_key: `action-verified:${action.id}:${recipientUserId}:${eventStamp}`,
      })));
    }
    return NextResponse.json({ ok: true, workflow_status: "COMPLETED", verified_at: verifiedAt });
  }

  if (action.assignment_target_type === "DEPARTMENT" && departmentExecution) {
    const executionFrom = requestedAction === "START" ? "NOT_STARTED" : "RETURNED";
    if (departmentExecution.workflow_status !== executionFrom) {
      return NextResponse.json({ error: "Trạng thái thực hiện của khoa/phòng hiện không phù hợp với thao tác này. Vui lòng tải lại trang." }, { status: 409 });
    }
    const updatedAt = new Date().toISOString();
    const { error: executionStartError } = await admin.from("action_department_executions")
      .update({ workflow_status: "IN_PROGRESS", updated_at: updatedAt })
      .eq("id", departmentExecution.id)
      .eq("workflow_status", executionFrom);
    if (executionStartError) return NextResponse.json({ error: executionStartError.message }, { status: 400 });

    // Action cha là trạng thái tổng hợp. Một khoa bắt đầu/tiếp tục không được
    // chặn khoa khác chỉ vì Action cha đã IN_PROGRESS.
    if (action.workflow_status === "NOT_STARTED" || action.workflow_status === "RETURNED") {
      const { error: aggregateStartError } = await admin.from("actions")
        .update({ workflow_status: "IN_PROGRESS", completion_note: null, verified_at: null, verified_by: null })
        .eq("id", action.id)
        .eq("workflow_status", action.workflow_status);
      if (aggregateStartError) {
        await admin.from("action_department_executions").update({ workflow_status: executionFrom, updated_at: updatedAt }).eq("id", departmentExecution.id).eq("workflow_status", "IN_PROGRESS");
        return NextResponse.json({ error: aggregateStartError.message }, { status: 400 });
      }
    } else if (action.workflow_status !== "IN_PROGRESS") {
      await admin.from("action_department_executions").update({ workflow_status: executionFrom, updated_at: updatedAt }).eq("id", departmentExecution.id).eq("workflow_status", "IN_PROGRESS");
      return NextResponse.json({ error: "Action cha hiện không ở trạng thái cho phép khoa/phòng thực hiện." }, { status: 409 });
    }

    return NextResponse.json({ ok: true, workflow_status: "IN_PROGRESS", department_execution_status: "IN_PROGRESS" });
  }

  const allowedFrom = requestedAction === "START" ? "NOT_STARTED" : "RETURNED";
  if (action.workflow_status !== allowedFrom) {
    return NextResponse.json({ error: "Trạng thái hiện tại không phù hợp với thao tác này. Vui lòng tải lại trang." }, { status: 409 });
  }

  const { error: updateError } = await admin
    .from("actions")
    .update({ workflow_status: "IN_PROGRESS", completion_note: null, verified_at: null, verified_by: null })
    .eq("id", action.id)
    .eq("workflow_status", allowedFrom);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  return NextResponse.json({ ok: true, workflow_status: "IN_PROGRESS" });
}
