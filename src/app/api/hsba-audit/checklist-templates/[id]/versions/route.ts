import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { rpcErrorMessage } from "@/lib/rpc-compat";
import { createAdminClient } from "@/lib/supabase/admin";

const CLONE_RPC = "qlcl_clone_hsba_checklist_version_v1";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("hsba_audit.manage");
  if (!auth.ok) return auth.response;

  const { id: templateId } = await params;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(CLONE_RPC, {
    p_template_id: templateId,
    p_actor_user_id: auth.user.id,
  });

  if (error) {
    const message = rpcErrorMessage(error, "Không tạo được phiên bản nháp mới.");
    const status = /không tìm thấy|ngoài phạm vi/i.test(message) ? 404 : /ngưng sử dụng|chưa có phiên bản/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  const result = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const versionId = typeof result.version_id === "string" ? result.version_id : null;
  if (!versionId) return NextResponse.json({ error: "Kết quả tạo phiên bản không hợp lệ." }, { status: 409 });

  return NextResponse.json({
    ok: true,
    existing: result.existing === true,
    version_id: versionId,
    version_no: result.version_no,
    item_count: result.item_count ?? 0,
  });
}
