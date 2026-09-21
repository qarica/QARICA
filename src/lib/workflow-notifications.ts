import { routeForRecord } from "@/lib/record-route";

type AdminClient = any;

type WorkflowNotificationInput = {
  admin: AdminClient;
  recordId: string;
  recipientUserIds: Array<string | null | undefined>;
  eventKey: string;
  notificationType: string;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  title: string;
  message: string;
};

export async function notifyWorkflowEvent(input: WorkflowNotificationInput) {
  const recipients = [...new Set(input.recipientUserIds.map((x) => String(x || "").trim()).filter(Boolean))];
  if (!recipients.length) return { created: 0 };

  const { data: record, error: recordError } = await input.admin
    .from("records")
    .select("id,record_type,record_code")
    .eq("id", input.recordId)
    .maybeSingle();
  if (recordError || !record) return { created: 0, error: recordError?.message || "record-not-found" };

  const payload = recipients.map((recipientUserId) => ({
    recipient_user_id: recipientUserId,
    notification_type: input.notificationType,
    priority: input.priority || "HIGH",
    title: input.title,
    message: `${record.record_code || "QARICA"} · ${input.message}`,
    target_record_id: input.recordId,
    target_route: routeForRecord(record.record_type, input.recordId),
    notification_event_key: `workflow:${input.eventKey}:${input.recordId}`,
    is_read: false,
  }));

  const { data, error } = await input.admin
    .from("notifications")
    .upsert(payload, { onConflict: "recipient_user_id,notification_event_key", ignoreDuplicates: true })
    .select("id");
  return { created: data?.length || 0, error: error?.message };
}
