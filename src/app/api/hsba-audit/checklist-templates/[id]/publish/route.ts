import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { rpcErrorMessage } from "@/lib/rpc-compat";
import { createAdminClient } from "@/lib/supabase/admin";

const PUBLISH_RPC = "qlcl_publish_hsba_checklist_version_v1";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("hsba_audit.manage");
  if (!auth.ok) return auth.response;

  const { id: templateId } = await params;
  const body = await request.json().catch(() => ({}));
  const versionId = String(body.version_id || "").trim();
  if (!versionId) return NextResponse.json({ error: "Thiếu phiên bản bảng kiểm." }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.rpc(PUBLISH_RPC, {
    p_template_id: templateId,
    p_version_id: versionId,
    p_actor_user_id: auth.user.id,
  });

  if (error) {
    const message = rpcErrorMessage(error, "Không thể phát hành phiên bản bảng kiểm.");
    const status = /không tìm thấy/i.test(message) ? 404 : /nháp|ít nhất 1 tiêu chí|trùng thao tác/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  const result = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  if (result.status !== "PUBLISHED") return NextResponse.json({ error: "Phiên bản chưa được phát hành thành công." }, { status: 409 });

  return NextResponse.json({ ok: true, version_id: result.version_id, status: result.status, published_at: result.published_at });
}
