import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { queueAndDeliverZalo } from "@/lib/notification-delivery";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET chưa được cấu hình." }, { status: 500 });
  if (request.headers.get("authorization") !== "Bearer " + secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("notification_deliveries")
    .select("recipient_user_id")
    .eq("channel", "ZALO")
    .in("delivery_status", ["QUEUED", "FAILED"])
    .or("next_attempt_at.is.null,next_attempt_at.lte." + now)
    .lt("attempt_count", 5)
    .limit(1000);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const userIds = Array.from(new Set((data ?? []).map((row: any) => row.recipient_user_id).filter(Boolean)));
  const settled = await Promise.allSettled(userIds.map((userId) => queueAndDeliverZalo(admin, userId, [])));

  return NextResponse.json({
    ok: true,
    users: userIds.length,
    processed: settled.filter((x) => x.status === "fulfilled").length,
    failed: settled.filter((x) => x.status === "rejected").length,
  });
}
