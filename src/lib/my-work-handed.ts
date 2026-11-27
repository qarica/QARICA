// "Đã chuyển đi": các việc người dùng đã chuyển cho người khác (hoặc ghi nhận giao cho người chưa có tài khoản),
// lấy từ nhật ký audit_logs (WORK_REASSIGN / WORK_HANDOVER_EXTERNAL) + tình trạng HIỆN TẠI của việc.
// Chỉ đọc; luôn lọc theo actor = chính người dùng nên không lộ việc của người khác.
export type HandedRow = {
  key: string;
  source: "REMINDER" | "ACTION" | "WORK_PLAN";
  title: string;
  toName: string;
  external: boolean;
  at: string;
  reason: string;
  statusLabel: string;
  recordId: string | null;
};

const REMINDER_STATUS: Record<string, string> = { OPEN: "Đang thực hiện", COMPLETED: "Đã hoàn thành", CANCELLED: "Đã hủy" };
const PLAN_STATUS: Record<string, string> = { OPEN: "Đang thực hiện", DONE: "Đã hoàn thành", CANCELLED: "Đã hủy" };
const ACTION_STATUS: Record<string, string> = { NOT_STARTED: "Chưa bắt đầu", IN_PROGRESS: "Đang thực hiện", RETURNED: "Bị trả lại", EVIDENCE_SUBMITTED: "Đã nộp minh chứng", VERIFYING: "Đang xác minh", COMPLETED: "Đã hoàn thành", CANCELLED: "Đã hủy" };

export async function loadHandedWork(admin: any, userId: string): Promise<{ rows: HandedRow[]; error: string | null }> {
  const logsRes = await admin
    .from("audit_logs")
    .select("id,record_id,table_name,row_id,action_type,new_value,reason,created_at")
    .eq("actor_user_id", userId)
    .in("action_type", ["WORK_REASSIGN", "WORK_HANDOVER_EXTERNAL"])
    .order("created_at", { ascending: false })
    .limit(200);
  if (logsRes.error) return { rows: [], error: logsRes.error.message };
  const logs = (logsRes.data ?? []) as any[];
  const reminderIds = Array.from(new Set(logs.filter((l) => l.table_name === "personal_reminders").map((l) => l.row_id)));
  const actionIds = Array.from(new Set(logs.filter((l) => l.table_name === "actions").map((l) => l.row_id)));
  const planIds = Array.from(new Set(logs.filter((l) => l.table_name === "work_plan_items").map((l) => l.row_id)));
  const toIds = Array.from(new Set(logs.map((l) => l.new_value?.owner_user_id).filter((v: string | undefined) => v && v !== userId)));
  const [remRes, actRes, planRes, profRes] = await Promise.all([
    reminderIds.length ? admin.from("personal_reminders").select("id,title,status").in("id", reminderIds) : { data: [], error: null },
    actionIds.length ? admin.from("actions").select("id,title,workflow_status").in("id", actionIds) : { data: [], error: null },
    planIds.length ? admin.from("work_plan_items").select("id,title,status").in("id", planIds) : { data: [], error: null },
    toIds.length ? admin.from("profiles").select("user_id,full_name,email").in("user_id", toIds) : { data: [], error: null },
  ]);
  const err = remRes.error || actRes.error || planRes.error || profRes.error;
  if (err) return { rows: [], error: err.message };
  const rem = new Map<string, any>((remRes.data ?? []).map((r: any) => [r.id, r]));
  const act = new Map<string, any>((actRes.data ?? []).map((r: any) => [r.id, r]));
  const plan = new Map<string, any>((planRes.data ?? []).map((r: any) => [r.id, r]));
  const name = new Map<string, string>((profRes.data ?? []).map((p: any) => [p.user_id, p.full_name || p.email || ""]));
  const rows: HandedRow[] = logs.map((l) => {
    const isAction = l.table_name === "actions";
    const isPlan = l.table_name === "work_plan_items";
    const src = isAction ? act.get(l.row_id) : isPlan ? plan.get(l.row_id) : rem.get(l.row_id);
    const external = l.action_type === "WORK_HANDOVER_EXTERNAL";
    return {
      key: String(l.id),
      source: isAction ? "ACTION" : isPlan ? "WORK_PLAN" : "REMINDER",
      title: src?.title || "(việc đã bị xóa)",
      toName: external ? String(l.new_value?.to_name || "") : name.get(l.new_value?.owner_user_id) || "—",
      external,
      at: l.created_at,
      reason: l.reason || "",
      statusLabel: src ? (isAction ? ACTION_STATUS[src.workflow_status] : isPlan ? PLAN_STATUS[src.status] : REMINDER_STATUS[src.status]) || String(isAction ? src.workflow_status : src.status) : "—",
      recordId: isAction ? l.record_id : null,
    };
  });
  return { rows, error: null };
}
