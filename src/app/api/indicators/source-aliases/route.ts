import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requireApiPermission("indicators.manage");
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  const sourceSystem = String(body.source_system || "").trim();
  const sourceCode = String(body.source_code || "").trim();
  const sourceLabel = String(body.source_label || "").trim() || null;
  const definitionId = String(body.indicator_definition_id || "").trim();
  if (!sourceSystem || !sourceCode || !definitionId) return NextResponse.json({ error: "Thiếu thông tin ánh xạ nguồn." }, { status: 400 });

  const admin = createAdminClient();
  const { data: caller } = await admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle();
  if (!caller?.organization_id || !caller.is_active) return NextResponse.json({ error: "Tài khoản không hợp lệ." }, { status: 403 });
  const { data: definition } = await admin.from("indicator_definitions").select("id,organization_id").eq("id", definitionId).maybeSingle();
  if (!definition || definition.organization_id !== caller.organization_id) return NextResponse.json({ error: "Chỉ số nằm ngoài phạm vi bệnh viện." }, { status: 403 });

  const { data: existing } = await admin.from("indicator_source_aliases").select("id,indicator_definition_id").eq("organization_id", caller.organization_id).ilike("source_system", sourceSystem).ilike("source_code", sourceCode).eq("is_active", true).maybeSingle();
  if (existing && existing.indicator_definition_id !== definitionId) return NextResponse.json({ error: "Mã nguồn này đã được xác nhận cho một chỉ số khác. Hãy ngưng ánh xạ cũ trước khi thay đổi." }, { status: 409 });
  if (existing) return NextResponse.json({ ok: true, id: existing.id, unchanged: true });

  const { data: alias, error } = await admin.from("indicator_source_aliases").insert({
    organization_id: caller.organization_id,
    indicator_definition_id: definitionId,
    source_system: sourceSystem,
    source_code: sourceCode,
    source_label: sourceLabel,
    is_active: true,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "Mã nguồn này đã được ánh xạ." : error.message }, { status: error.code === "23505" ? 409 : 400 });
  await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, table_name: "indicator_source_aliases", row_id: alias.id, action_type: "CONFIRM_INDICATOR_SOURCE_ALIAS", new_value: { source_system: sourceSystem, source_code: sourceCode, indicator_definition_id: definitionId }, request_meta: { source: "qlcl-ui" } });
  return NextResponse.json({ ok: true, id: alias.id });
}
