import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { rpcErrorMessage } from "@/lib/rpc-compat";
import { createAdminClient } from "@/lib/supabase/admin";

const PUBLISH_RPC = "qlcl_publish_indicator_version_v1";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("indicators.manage");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const versionId = String(body.version_id || "").trim();
  if (!versionId) return NextResponse.json({ error: "Thiếu phiên bản cần phát hành." }, { status: 400 });

  const admin = createAdminClient();
  const { data: caller } = await admin
    .from("profiles")
    .select("organization_id,is_active")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const { data: definition } = await admin
    .from("indicator_definitions")
    .select("id,organization_id,is_active")
    .eq("id", id)
    .maybeSingle();

  if (!caller?.organization_id || !caller.is_active || !definition || definition.organization_id !== caller.organization_id) {
    return NextResponse.json({ error: "Không có quyền phát hành chỉ số này." }, { status: 403 });
  }

  const { data: version } = await admin
    .from("indicator_definition_versions")
    .select("id,version_no,status,calculation_type,desired_direction,frequency")
    .eq("id", versionId)
    .eq("indicator_definition_id", id)
    .maybeSingle();

  if (!version || version.status !== "DRAFT") {
    return NextResponse.json({ error: "Chỉ phiên bản Nháp mới được phát hành." }, { status: 409 });
  }
  if (!version.calculation_type || !version.desired_direction || !version.frequency) {
    return NextResponse.json({ error: "Phiên bản chưa đủ công thức/tần suất để phát hành." }, { status: 409 });
  }

  const publishedAt = new Date().toISOString();
  const { data: tx, error } = await admin.rpc(PUBLISH_RPC, {
    p_indicator_definition_id: id,
    p_version_id: versionId,
    p_actor_user_id: auth.user.id,
    p_published_at: publishedAt,
  });

  if (error) {
    const message = rpcErrorMessage(error, "Không thể phát hành phiên bản chỉ số.");
    const status =
      /outside current organization|not active/i.test(message) ? 403 :
      /must be draft|missing calculation|publish race|not found|required/i.test(message) ? 409 :
      400;
    return NextResponse.json({ error: message }, { status });
  }

  const result = tx && typeof tx === "object" ? tx as Record<string, unknown> : {};
  const persistedStatus = typeof result.status === "string" ? result.status : null;
  if (persistedStatus !== "PUBLISHED") {
    return NextResponse.json({ error: "Phiên bản chỉ số chưa được phát hành thành công." }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    version_no: version.version_no,
    status: persistedStatus,
    transaction: "atomic",
    result: tx,
  });
}
