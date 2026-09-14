import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("monitoring.perform");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();

  const [{ data: caller }, { data: round }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("monitoring_rounds").select("id,record_id,workflow_status").eq("id", id).maybeSingle(),
  ]);
  if (!caller?.organization_id || !caller.is_active) return NextResponse.json({ error: "Tài khoản không hợp lệ." }, { status: 403 });
  if (!round) return NextResponse.json({ error: "Không tìm thấy đợt giám sát." }, { status: 404 });
  if (round.workflow_status !== "SCHEDULED") return NextResponse.json({ error: "Chỉ đợt ở trạng thái Cần kiểm mới được bắt đầu." }, { status: 409 });

  const { data: record } = await admin.from("records").select("organization_id").eq("id", round.record_id).maybeSingle();
  if (!record || record.organization_id !== caller.organization_id) return NextResponse.json({ error: "Đợt giám sát không thuộc bệnh viện hiện tại." }, { status: 403 });

  const now = new Date().toISOString();
  const { data: updated, error } = await admin.from("monitoring_rounds").update({ workflow_status: "IN_PROGRESS", started_at: now }).eq("id", id).eq("workflow_status", "SCHEDULED").select("id,workflow_status,started_at").maybeSingle();
  if (error || !updated) return NextResponse.json({ error: error?.message || "Không thể bắt đầu đợt giám sát." }, { status: 400 });
  return NextResponse.json({ ok: true, status: updated.workflow_status, started_at: updated.started_at });
}
