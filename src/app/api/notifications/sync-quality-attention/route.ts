import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { routeForRecord } from "@/lib/record-route";
import { getWorkYear } from "@/lib/work-year";

function hcmToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

function daysTo(value: string | null | undefined, today: string) {
  if (!value) return null;
  const date = String(value).slice(0, 10);
  const a = Date.parse(`${today}T00:00:00+07:00`);
  const b = Date.parse(`${date}T00:00:00+07:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

function phaseFor(value: string | null | undefined, today: string, soonDays = 1) {
  const days = daysTo(value, today);
  if (days === null) return null;
  if (days < 0) return { phase: "OVERDUE", days, priority: "URGENT" };
  if (days === 0) return { phase: "DUE_TODAY", days, priority: "HIGH" };
  if (days <= soonDays) return { phase: "DUE_SOON", days, priority: "HIGH" };
  return null;
}

function dueMessage(phase: string, date: string | null | undefined, subject: string) {
  const clean = date ? String(date).slice(0, 10).split("-").reverse().join("/") : "—";
  if (phase === "OVERDUE") return `${subject} đã quá hạn ${clean}.`;
  if (phase === "DUE_TODAY") return `${subject} đến hạn hôm nay (${clean}).`;
  return `${subject} sẽ đến hạn vào ${clean}.`;
}

type Payload = {
  recipient_user_id: string;
  notification_type: string;
  priority: string;
  title: string;
  message: string;
  target_record_id: string;
  target_route: string;
  notification_event_key: string;
  is_read: boolean;
};

export async function POST() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const year = await getWorkYear();
  const today = hcmToday();
  const userId = auth.user.id;

  const [{ data: profile }, directivePermission, reportPermission, riskPermission, indicatorVerifyPermission, indicatorManagePermission, capaPermission, feedbackPermission, inspectionPermission, planPermission, findingPermission] = await Promise.all([
    supabase.from("profiles").select("primary_department_id").eq("user_id", userId).maybeSingle(),
    supabase.rpc("has_permission", { p_permission_code: "directives.manage" }),
    supabase.rpc("has_permission", { p_permission_code: "reports.manage" }),
    supabase.rpc("has_permission", { p_permission_code: "risk.manage" }),
    supabase.rpc("has_permission", { p_permission_code: "indicators.verify" }),
    supabase.rpc("has_permission", { p_permission_code: "indicators.manage" }),
    supabase.rpc("has_permission", { p_permission_code: "capa.manage" }),
    supabase.rpc("has_permission", { p_permission_code: "feedback.manage" }),
    supabase.rpc("has_permission", { p_permission_code: "inspections.manage" }),
    supabase.rpc("has_permission", { p_permission_code: "plans.manage" }),
    supabase.rpc("has_permission", { p_permission_code: "findings.manage" }),
  ]);

  const canManageDirectives = !!directivePermission.data;
  const canManageReports = !!reportPermission.data;
  const canManageRisks = !!riskPermission.data;
  const canVerifyIndicators = !!indicatorVerifyPermission.data || !!indicatorManagePermission.data;
  const canManageCapa = !!capaPermission.data;
  const canManageFeedback = !!feedbackPermission.data;
  const canManageInspections = !!inspectionPermission.data || !!planPermission.data;
  const canManageFindings = !!findingPermission.data;
  const primaryDepartmentId = profile?.primary_department_id || null;

  const { data: records, error: recordsError } = await supabase
    .from("records")
    .select("id,record_type,record_code,title,owner_user_id,owner_department_id")
    .eq("work_year", year)
    .eq("lifecycle_status", "ACTIVE");
  if (recordsError) return NextResponse.json({ error: recordsError.message }, { status: 400 });
  if (!records?.length) return NextResponse.json({ ok: true, created: 0, candidates: 0 });

  const recordIds = records.map((x: any) => x.id);
  const recordMap = new Map(records.map((x: any) => [x.id, x]));
  const mine = (recordId: string, ownerUserId?: string | null, departmentId?: string | null) => {
    const record: any = recordMap.get(recordId);
    return ownerUserId === userId || record?.owner_user_id === userId || (!!primaryDepartmentId && (departmentId === primaryDepartmentId || record?.owner_department_id === primaryDepartmentId));
  };

  const [directivesRes, reportsRes, risksRes, indicatorsRes, capasRes, feedbackRes, inspectionsRes, findingsRes] = await Promise.all([
    supabase.from("external_directives").select("id,record_id,workflow_status,implementation_due_date,report_due_date,lead_department_id,owner_user_id").in("record_id", recordIds),
    supabase.from("reporting_obligations").select("id,record_id,workflow_status,due_date,recipient_name,preparing_department_id,preparer_user_id").in("record_id", recordIds),
    supabase.from("risks").select("id,record_id,workflow_status,next_review_date,owner_user_id").in("record_id", recordIds),
    supabase.from("indicator_measurements").select("id,record_id,workflow_status,result_level,period_end").in("record_id", recordIds),
    supabase.from("capas").select("id,record_id,workflow_status,effectiveness_due_date").in("record_id", recordIds),
    supabase.from("feedback_records").select("id,record_id,workflow_status,response_due_at").in("record_id", recordIds),
    supabase.from("inspection_events").select("id,record_id,workflow_status,visit_date,authority").in("record_id", recordIds),
    supabase.from("findings").select("id,record_id,workflow_status,due_date,owner_user_id,severity").in("record_id", recordIds),
  ]);

  const queryErrors = [directivesRes, reportsRes, risksRes, indicatorsRes, capasRes, feedbackRes, inspectionsRes, findingsRes]
    .map((x: any) => x.error?.message)
    .filter(Boolean);

  const payload: Payload[] = [];
  const add = (recordId: string, type: string, priority: string, title: string, message: string, eventKey: string) => {
    const record: any = recordMap.get(recordId);
    if (!record) return;
    payload.push({
      recipient_user_id: userId,
      notification_type: type,
      priority,
      title,
      message: `${record.record_code || "QLCL"} · ${message}`,
      target_record_id: recordId,
      target_route: routeForRecord(record.record_type, recordId),
      notification_event_key: eventKey,
      is_read: false,
    });
  };

  for (const row of (directivesRes.data ?? []) as any[]) {
    if (["COMPLETED", "CANCELLED"].includes(String(row.workflow_status))) continue;
    if (!canManageDirectives && !mine(row.record_id, row.owner_user_id, row.lead_department_id)) continue;
    const due = row.report_due_date || row.implementation_due_date;
    const phase = phaseFor(due, today, 1);
    if (!phase) continue;
    add(row.record_id, `DIRECTIVE_${phase.phase}`, phase.priority, phase.phase === "OVERDUE" ? "Chỉ đạo/Yêu cầu quá hạn" : "Chỉ đạo/Yêu cầu sắp đến hạn", dueMessage(phase.phase, due, "Chỉ đạo/Yêu cầu"), `quality:directive:${row.id}:${phase.phase}:${String(due).slice(0,10)}`);
  }

  for (const row of (reportsRes.data ?? []) as any[]) {
    if (["COMPLETED", "CANCELLED"].includes(String(row.workflow_status))) continue;
    if (!canManageReports && !mine(row.record_id, row.preparer_user_id, row.preparing_department_id)) continue;
    const phase = phaseFor(row.due_date, today, 1);
    if (!phase) continue;
    const recipient = row.recipient_name ? ` Nơi nhận: ${row.recipient_name}.` : "";
    add(row.record_id, `REPORT_${phase.phase}`, phase.priority, phase.phase === "OVERDUE" ? "Báo cáo quá hạn" : "Báo cáo sắp đến hạn", `${dueMessage(phase.phase, row.due_date, "Báo cáo")}${recipient}`, `quality:report:${row.id}:${phase.phase}:${String(row.due_date).slice(0,10)}`);
  }

  for (const row of (risksRes.data ?? []) as any[]) {
    if (row.workflow_status === "RETIRED") continue;
    if (!canManageRisks && !mine(row.record_id, row.owner_user_id, null)) continue;
    const phase = phaseFor(row.next_review_date, today, 1);
    if (!phase) continue;
    add(row.record_id, `RISK_REVIEW_${phase.phase}`, phase.priority, phase.phase === "OVERDUE" ? "Rủi ro quá hạn rà soát" : "Rủi ro đến kỳ rà soát", dueMessage(phase.phase, row.next_review_date, "Kỳ rà soát rủi ro"), `quality:risk:${row.id}:${phase.phase}:${String(row.next_review_date).slice(0,10)}`);
  }

  if (canVerifyIndicators) {
    for (const row of (indicatorsRes.data ?? []) as any[]) {
      if (row.workflow_status === "SUBMITTED") {
        add(row.record_id, "INDICATOR_AWAITING_VERIFICATION", "HIGH", "Chỉ số chờ xác minh", "Dữ liệu chỉ số đã được gửi và đang chờ xác minh trước khi khóa.", `quality:indicator:${row.id}:SUBMITTED`);
      }
      if (row.result_level === "OUT_OF_TARGET") {
        const periodKey = row.period_end ? String(row.period_end).slice(0, 10) : "current";
        add(row.record_id, "INDICATOR_OUT_OF_TARGET", "HIGH", "Chỉ số lệch mục tiêu", "Kết quả kỳ đo đang ngoài mục tiêu. Cần xác minh dữ liệu và phân tích nguyên nhân trước khi quyết định Action/CAPA.", `quality:indicator:${row.id}:OUT_OF_TARGET:${periodKey}`);
      }
    }
  }

  if (canManageCapa) {
    for (const row of (capasRes.data ?? []) as any[]) {
      if (["CLOSED", "CANCELLED"].includes(String(row.workflow_status))) continue;
      if (row.workflow_status === "EFFECTIVENESS_REVIEW") {
        const phase = phaseFor(row.effectiveness_due_date, today, 1);
        add(row.record_id, "CAPA_EFFECTIVENESS_REVIEW", phase?.priority || "HIGH", "CAPA chờ đánh giá hiệu lực", row.effectiveness_due_date ? dueMessage(phase?.phase || "DUE_SOON", row.effectiveness_due_date, "Đánh giá hiệu lực CAPA") : "CAPA đã đến bước đánh giá hiệu lực; không đóng nếu chưa chứng minh kết quả thực tế.", `quality:capa:${row.id}:EFFECTIVENESS_REVIEW:${row.effectiveness_due_date || "none"}`);
      } else {
        const phase = phaseFor(row.effectiveness_due_date, today, 1);
        if (phase) add(row.record_id, `CAPA_EFFECTIVENESS_${phase.phase}`, phase.priority, "CAPA gần hạn đánh giá hiệu lực", dueMessage(phase.phase, row.effectiveness_due_date, "Đánh giá hiệu lực CAPA"), `quality:capa:${row.id}:${phase.phase}:${String(row.effectiveness_due_date).slice(0,10)}`);
      }
    }
  }

  if (canManageFeedback) {
    for (const row of (feedbackRes.data ?? []) as any[]) {
      if (["CLOSED", "CANCELLED"].includes(String(row.workflow_status))) continue;
      const phase = phaseFor(row.response_due_at, today, 1);
      if (!phase) continue;
      add(row.record_id, `FEEDBACK_RESPONSE_${phase.phase}`, phase.priority, phase.phase === "OVERDUE" ? "Phản ánh quá hạn phản hồi" : "Phản ánh cần phản hồi", dueMessage(phase.phase, row.response_due_at, "Hạn phản hồi"), `quality:feedback:${row.id}:${phase.phase}:${String(row.response_due_at).slice(0,10)}`);
    }
  }

  if (canManageInspections) {
    for (const row of (inspectionsRes.data ?? []) as any[]) {
      if (["COMPLETED", "CANCELLED"].includes(String(row.workflow_status))) continue;
      const phase = phaseFor(row.visit_date, today, 1);
      if (!phase) continue;
      const authority = row.authority ? ` Đoàn/cơ quan: ${row.authority}.` : "";
      add(row.record_id, `INSPECTION_${phase.phase}`, phase.priority, phase.phase === "OVERDUE" ? "Đợt kiểm tra chưa hoàn tất sau ngày đoàn" : "Tiếp đoàn sắp tới", `${dueMessage(phase.phase, row.visit_date, "Ngày đoàn đến")}${authority}`, `quality:inspection:${row.id}:${phase.phase}:${String(row.visit_date).slice(0,10)}`);
    }
  }

  for (const row of (findingsRes.data ?? []) as any[]) {
    if (["CLOSED", "CANCELLED"].includes(String(row.workflow_status))) continue;
    if (!canManageFindings && !mine(row.record_id, row.owner_user_id, null)) continue;
    const phase = phaseFor(row.due_date, today, 1);
    if (!phase) continue;
    const severity = row.severity ? ` Mức: ${row.severity}.` : "";
    add(row.record_id, `FINDING_${phase.phase}`, phase.priority, phase.phase === "OVERDUE" ? "Finding quá hạn" : "Finding sắp đến hạn", `${dueMessage(phase.phase, row.due_date, "Finding")}${severity}`, `quality:finding:${row.id}:${phase.phase}:${String(row.due_date).slice(0,10)}`);
  }

  if (!payload.length) return NextResponse.json({ ok: true, created: 0, candidates: 0, warnings: queryErrors.slice(0, 3) });

  const admin = createAdminClient();
  const { data: inserted, error: insertError } = await admin
    .from("notifications")
    .upsert(payload, { onConflict: "recipient_user_id,notification_event_key", ignoreDuplicates: true })
    .select("id");
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });

  return NextResponse.json({
    ok: true,
    created: inserted?.length || 0,
    candidates: payload.length,
    warnings: queryErrors.slice(0, 3),
  });
}
