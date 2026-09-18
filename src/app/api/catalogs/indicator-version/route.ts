import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requireApiPermission("indicators.manage");
  if (!auth.ok) return auth.response;
  const body = await request.json();
  const admin = createAdminClient();
  const { data: caller } = await admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle();
  if (!caller?.is_active || !caller.organization_id) return NextResponse.json({ error: "Tài khoản không hợp lệ." }, { status: 403 });
  const { data: version } = await admin.from("indicator_definition_versions").select("id,status,indicator_definition_id").eq("id", String(body.version_id || "")).maybeSingle();
  if (version?.status !== "DRAFT") return NextResponse.json({ error: "Chỉ cập nhật bản nháp." }, { status: 409 });
  const { data: definition } = await admin.from("indicator_definitions").select("organization_id,is_active").eq("id", version.indicator_definition_id).maybeSingle();
  if (!definition?.is_active || definition.organization_id !== caller.organization_id) return NextResponse.json({ error: "Chỉ số không thuộc bệnh viện." }, { status: 403 });
  const unit = String(body.unit || "").trim();
  const frequency = String(body.frequency || "").trim();
  const calculationType = String(body.calculation_type || "").trim();
  if (!unit || !frequency || !calculationType) return NextResponse.json({ error: "Cần đơn vị đo, tần suất và cách tính." }, { status: 400 });
  const multiplier = Number(body.multiplier || 1);
  if (!Number.isFinite(multiplier) || multiplier <= 0) return NextResponse.json({ error: "Hệ số không hợp lệ." }, { status: 400 });
  const { error } = await admin.from("indicator_definition_versions").update({ unit, frequency, calculation_type: calculationType, desired_direction: String(body.desired_direction || "").trim() || null, multiplier }).eq("id", version.id);
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true });
}
