import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { inspectionCloseGate } from "@/lib/quality-gates";
import { isMissingRpcFunction, rpcErrorMessage } from "@/lib/rpc-compat";

const COUNTDOWN_RPC = "qlcl_generate_inspection_countdown_v1";
const CLOSE_RPC = "qlcl_close_inspection_v1";
const MILESTONES = [
  { offset: -30, title: "D-30 · Khởi động kế hoạch tiếp đoàn", result: "Phạm vi, đầu mối, tài liệu yêu cầu và kế hoạch chuẩn bị được xác định." },
  { offset: -14, title: "D-14 · Rà soát hồ sơ và khoảng trống", result: "Danh mục hồ sơ/minh chứng và các khoảng trống cần khắc phục được cập nhật." },
  { offset: -7, title: "D-7 · Kiểm tra chéo minh chứng", result: "Minh chứng đã được kiểm tra chéo; tồn tại có owner và hạn xử lý." },
  { offset: -3, title: "D-3 · Diễn tập và chốt hậu cần", result: "Hoàn tất diễn tập, phân công đón đoàn, phòng họp, thiết bị và đầu mối phối hợp." },
  { offset: -1, title: "D-1 · Kiểm tra sẵn sàng cuối", result: "Danh sách sẵn sàng cuối được xác nhận; vấn đề khẩn đã được xử lý/escalate." },
  { offset: 0, title: "D-Day · Điều phối tiếp đoàn", result: "Nhật ký yêu cầu, người phụ trách và tài liệu cung cấp trong ngày được ghi nhận." },
  { offset: 1, title: "D+1 · Tổng hợp yêu cầu sau đoàn", result: "Yêu cầu bổ sung, nhận xét ban đầu và đầu việc sau đoàn được tổng hợp." },
  { offset: 7, title: "D+7 · Chuyển tồn tại thành Finding/Action", result: "Tồn tại/kiến nghị được chuyển thành Finding → Action/CAPA có owner và deadline." },
];

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const [{ data: canInspect }, { data: canPlan }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: "inspections.manage" }),
    supabase.rpc("has_permission", { p_permission_code: "plans.manage" }),
  ]);
  if (!canInspect && !canPlan) return NextResponse.json({ error: "Bạn chưa có quyền quản lý tiếp đoàn." }, { status: 403 });

  const { id: recordId } = await params;
  const body: any = await request.json().catch(() => ({}));
  const command = String(body.action || "").toUpperCase();
  const { data: record } = await supabase.from("records").select("id,organization_id,record_code,title,work_year,lifecycle_status").eq("id", recordId).eq("record_type", "INSPECTION").maybeSingle();
  if (!record) return NextResponse.json({ error: "Không tìm thấy đợt tiếp đoàn hoặc ngoài phạm vi truy cập." }, { status: 404 });
  if (record.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Đợt tiếp đoàn không còn hoạt động." }, { status: 409 });

  const admin: any = createAdminClient();
  const { data: event, error } = await admin.from("inspection_events").select("id,visit_date,workflow_status").eq("record_id", recordId).maybeSingle();
  if (error || !event) return NextResponse.json({ error: error?.message || "Không tìm thấy dữ liệu tiếp đoàn." }, { status: 404 });

  const oldStatus = String(event.workflow_status || "PLANNING");
  const now = new Date().toISOString();
  let newStatus = oldStatus;
  let reason = String(body.comment || "").trim() || null;
  let message = "Đã cập nhật Inspection Mode.";

  if (command === "GENERATE_COUNTDOWN") {
    if (!["PLANNING", "PREPARATION"].includes(oldStatus)) return NextResponse.json({ error: "Chỉ được tạo countdown trong giai đoạn chuẩn bị." }, { status: 409 });
    if (!event.visit_date) return NextResponse.json({ error: "Chưa có ngày đoàn đến; hệ thống không tự bịa lịch." }, { status: 409 });

    const dept = String(body.lead_department_id || "").trim();
    const owner = String(body.assignee_user_id || "").trim();
    if (!dept || !owner) return NextResponse.json({ error: "Cần chọn khoa/phòng và người phụ trách countdown." }, { status: 400 });

    const { data: tx, error: txError } = await admin.rpc(COUNTDOWN_RPC, {
      p_inspection_record_id: recordId,
      p_lead_department_id: dept,
      p_assignee_user_id: owner,
      p_actor_user_id: auth.user.id,
    });
    if (!txError) {
      const created = typeof tx === "object" && tx && "created_actions" in tx ? Number((tx as Record<string, unknown>).created_actions || 0) : 0;
      return NextResponse.json({ ok: true, status: "PREPARATION", transaction: "atomic", result: tx, message: created ? `Đã tạo ${created} Action countdown.` : "Các mốc countdown đã tồn tại; không tạo trùng." });
    }
    if (!isMissingRpcFunction(txError, COUNTDOWN_RPC)) {
      const txMessage = rpcErrorMessage(txError, "Không thể tạo countdown tiếp đoàn.");
      return NextResponse.json({ error: txMessage }, { status: /duplicate|not active|not in a countdown|invalid|required/i.test(txMessage) ? 409 : 400 });
    }

    const [{ data: department }, { data: profile }, { data: existing }] = await Promise.all([
      admin.from("departments").select("id,organization_id,is_active").eq("id", dept).maybeSingle(),
      admin.from("profiles").select("user_id,organization_id,is_active").eq("user_id", owner).maybeSingle(),
      admin.from("inspection_action_links").select("offset_days").eq("inspection_event_id", event.id),
    ]);
    if (!department?.is_active || department.organization_id !== record.organization_id || !profile?.is_active || profile.organization_id !== record.organization_id) return NextResponse.json({ error: "Đơn vị hoặc người phụ trách không hợp lệ." }, { status: 400 });

    const used = new Set((existing || []).map((x: any) => Number(x.offset_days)));
    let created = 0;
    for (const milestone of MILESTONES) {
      if (used.has(milestone.offset)) continue;
      const { data: code, error: codeError } = await admin.rpc("next_record_code", { p_record_type: "ACTION", p_work_year: record.work_year });
      if (codeError || !code) return NextResponse.json({ error: codeError?.message || "Không cấp được mã Action countdown." }, { status: 400 });

      const due = addDays(event.visit_date, milestone.offset);
      const { data: actionRecord, error: recordError } = await admin.from("records").insert({ organization_id: record.organization_id, record_type: "ACTION", record_code: code, title: milestone.title, work_year: record.work_year, owner_department_id: dept, owner_user_id: owner, lifecycle_status: "ACTIVE", created_by: auth.user.id }).select("id").single();
      if (recordError || !actionRecord) return NextResponse.json({ error: recordError?.message || "Không tạo được Action countdown." }, { status: 400 });

      const { data: action, error: actionError } = await admin.from("actions").insert({ record_id: actionRecord.id, description: `Mốc ${milestone.offset < 0 ? `D${milestone.offset}` : milestone.offset === 0 ? "D-Day" : `D+${milestone.offset}`} cho ${record.record_code} · ${record.title}`, priority: milestone.offset >= -3 && milestone.offset <= 1 ? "HIGH" : "NORMAL", lead_department_id: dept, assignee_user_id: owner, start_date: null, due_date: due, expected_result: milestone.result, verification_requirement: "Có sản phẩm/minh chứng tương ứng và được xác minh trước khi hoàn thành.", workflow_status: "NOT_STARTED" }).select("id").single();
      if (actionError || !action) {
        await admin.from("records").update({ lifecycle_status: "ARCHIVED", updated_at: now }).eq("id", actionRecord.id);
        return NextResponse.json({ error: actionError?.message || "Không tạo được nội dung Action." }, { status: 400 });
      }

      const { error: canonicalLinkError } = await admin.from("record_links").insert({ source_record_id: recordId, target_record_id: actionRecord.id, relation_type: "HAS_ACTION", metadata: { source_record_type: "INSPECTION", offset_days: milestone.offset }, created_by: auth.user.id });
      if (canonicalLinkError) {
        await admin.from("actions").delete().eq("id", action.id);
        await admin.from("records").update({ lifecycle_status: "ARCHIVED", updated_at: now }).eq("id", actionRecord.id);
        return NextResponse.json({ error: `Không tạo được liên kết Inspection → Action: ${canonicalLinkError.message}` }, { status: 400 });
      }

      const { error: inspectionLinkError } = await admin.from("inspection_action_links").insert({ inspection_event_id: event.id, action_id: action.id, offset_days: milestone.offset });
      if (inspectionLinkError) {
        await admin.from("record_links").delete().eq("source_record_id", recordId).eq("target_record_id", actionRecord.id).eq("relation_type", "HAS_ACTION");
        await admin.from("actions").delete().eq("id", action.id);
        await admin.from("records").update({ lifecycle_status: "ARCHIVED", updated_at: now }).eq("id", actionRecord.id);
        return NextResponse.json({ error: `Không tạo được inspection action link: ${inspectionLinkError.message}` }, { status: 400 });
      }

      await admin.from("notifications").upsert({ recipient_user_id: owner, notification_type: "ACTION_ASSIGNED", priority: milestone.offset >= -3 && milestone.offset <= 1 ? "HIGH" : "NORMAL", title: "Công việc chuẩn bị tiếp đoàn", message: `${milestone.title} · hạn ${due}`, target_record_id: actionRecord.id, target_route: `/tasks/${actionRecord.id}`, notification_event_key: `inspection:${event.id}:${milestone.offset}:${owner}`, is_read: false }, { onConflict: "recipient_user_id,notification_event_key", ignoreDuplicates: true });
      created++;
    }

    newStatus = "PREPARATION";
    const { error: updateError } = await admin.from("inspection_events").update({ workflow_status: newStatus, updated_at: now }).eq("id", event.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    reason = reason || `Tạo ${created} Action countdown từ ngày đoàn đến ${event.visit_date}.`;
    message = created ? `Đã tạo ${created} Action countdown.` : "Các mốc countdown đã tồn tại; không tạo trùng.";
  } else if (command === "START_VISIT") {
    if (oldStatus !== "PREPARATION") return NextResponse.json({ error: "Đợt kiểm tra chưa ở giai đoạn chuẩn bị." }, { status: 409 });
    if (new Date().toISOString().slice(0, 10) < event.visit_date) return NextResponse.json({ error: "Chưa đến ngày đoàn làm việc." }, { status: 409 });
    newStatus = "ON_SITE";
    const { error: updateError } = await admin.from("inspection_events").update({ workflow_status: newStatus, updated_at: now }).eq("id", event.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    message = "Đã chuyển sang chế độ đoàn đang làm việc.";
  } else if (command === "COMPLETE_VISIT") {
    if (oldStatus !== "ON_SITE") return NextResponse.json({ error: "Đợt kiểm tra chưa ở trạng thái đoàn đang làm việc." }, { status: 409 });
    if (!reason) return NextResponse.json({ error: "Tóm tắt kết quả/kiến nghị ban đầu là bắt buộc." }, { status: 400 });
    newStatus = "FOLLOW_UP";
    const { error: updateError } = await admin.from("inspection_events").update({ workflow_status: newStatus, updated_at: now }).eq("id", event.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    message = "Đã chuyển sang theo dõi sau đoàn.";
  } else if (command === "CLOSE") {
    if (oldStatus !== "FOLLOW_UP") return NextResponse.json({ error: "Đợt kiểm tra chưa ở giai đoạn theo dõi sau đoàn." }, { status: 409 });
    const { data: links } = await admin.from("inspection_action_links").select("action_id").eq("inspection_event_id", event.id);
    const ids = (links || []).map((x: any) => x.action_id).filter(Boolean);
    const { data: actions } = ids.length ? await admin.from("actions").select("workflow_status").in("id", ids) : { data: [] };
    const incomplete = (actions || []).filter((x: any) => !["COMPLETED", "CANCELLED", "NOT_APPLICABLE"].includes(String(x.workflow_status))).length;
    const { count } = await admin.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId);
    const gate = inspectionCloseGate({ incompleteActionCount: incomplete, evidenceCount: count ?? 0, hasConclusion: !!reason });
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 409 });

    const { data: tx, error: txError } = await admin.rpc(CLOSE_RPC, {
      p_inspection_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_reason: reason,
    });
    if (!txError) return NextResponse.json({ ok: true, status: "CLOSED", message: "Đã đóng đợt tiếp đoàn; hồ sơ và tồn tại vẫn được giữ để truy vết.", transaction: "atomic", result: tx });
    if (!isMissingRpcFunction(txError, CLOSE_RPC)) {
      const txMessage = rpcErrorMessage(txError, "Không thể đóng đợt tiếp đoàn.");
      return NextResponse.json({ error: txMessage }, { status: /not active|must be follow_up|incomplete|evidence|required/i.test(txMessage) ? 409 : 400 });
    }

    newStatus = "CLOSED";
    const { error: eventError } = await admin.from("inspection_events").update({ workflow_status: newStatus, updated_at: now }).eq("id", event.id);
    if (eventError) return NextResponse.json({ error: eventError.message }, { status: 400 });
    const { error: recordError } = await admin.from("records").update({ lifecycle_status: "CLOSED", closed_at: now, updated_at: now }).eq("id", recordId);
    if (recordError) {
      await admin.from("inspection_events").update({ workflow_status: "FOLLOW_UP", updated_at: now }).eq("id", event.id);
      return NextResponse.json({ error: recordError.message }, { status: 400 });
    }
    await admin.from("record_status_history").insert({ record_id: recordId, old_status: "ACTIVE", new_status: "CLOSED", changed_by: auth.user.id, reason });
    message = "Đã đóng đợt tiếp đoàn; hồ sơ và tồn tại vẫn được giữ để truy vết.";
  } else {
    return NextResponse.json({ error: "Thao tác Inspection Mode không hợp lệ." }, { status: 400 });
  }

  const legacyAtomicCommand = command === "GENERATE_COUNTDOWN" || command === "CLOSE";
  await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "inspection_events", row_id: event.id, action_type: `INSPECTION_${command}`, old_value: { workflow_status: oldStatus }, new_value: { workflow_status: newStatus }, reason, request_meta: { source: "qlcl-ui", transaction: legacyAtomicCommand ? "legacy-fallback" : undefined } });
  return NextResponse.json({ ok: true, status: newStatus, message, transaction: legacyAtomicCommand ? "legacy-fallback" : "direct" });
}
