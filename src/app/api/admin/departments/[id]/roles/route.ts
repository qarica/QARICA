import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { rpcErrorMessage } from "@/lib/rpc-compat";
import { createAdminClient } from "@/lib/supabase/admin";

const SET_ROLES_RPC = "qlcl_set_department_roles_v1";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("departments.manage");
  if (!auth.ok) return auth.response;
  const { id: departmentId } = await params;
  const body = await request.json();
  const headUserId = body.head_user_id ? String(body.head_user_id) : null;
  const networkUserIds = Array.from(new Set((Array.isArray(body.quality_network_user_ids) ? body.quality_network_user_ids : []).map(String).filter(Boolean)));

  const admin = createAdminClient();
  const { data: tx, error } = await admin.rpc(SET_ROLES_RPC, {
    p_department_id: departmentId,
    p_actor_user_id: auth.user.id,
    p_head_user_id: headUserId,
    p_network_user_ids: networkUserIds,
  });

  if (error) {
    const message = rpcErrorMessage(error, "Không thể lưu nhân sự và vai trò.");
    const status = /khoa\/phòng không thuộc/i.test(message) ? 404 : /tài khoản không hợp lệ/i.test(message) ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  const result = tx && typeof tx === "object" ? (tx as Record<string, unknown>) : {};
  return NextResponse.json({ ok: true, complete: result.complete === true, transaction: "atomic" });
}
