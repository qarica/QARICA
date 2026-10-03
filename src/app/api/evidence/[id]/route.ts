import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("evidence.upload");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: evidence, error: evidenceError } = await admin.from("evidence").select("id,organization_id,storage_bucket,storage_path").eq("id", id).maybeSingle();
  if (evidenceError) return NextResponse.json({ error: evidenceError.message }, { status: 400 });
  if (!evidence || evidence.organization_id !== organizationId) return NextResponse.json({ error: "Không tìm thấy minh chứng này." }, { status: 404 });

  const { error: unlinkError } = await admin.from("evidence_links").delete().eq("evidence_id", id);
  if (unlinkError) return NextResponse.json({ error: unlinkError.message }, { status: 400 });

  const { error: deleteError } = await admin.from("evidence").delete().eq("id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });

  if (evidence.storage_bucket && evidence.storage_path) {
    await admin.storage.from(evidence.storage_bucket).remove([evidence.storage_path]);
  }

  return NextResponse.json({ ok: true });
}
