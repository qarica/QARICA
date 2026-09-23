import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { rpcErrorMessage } from "@/lib/rpc-compat";
import { createAdminClient } from "@/lib/supabase/admin";

const SCORING_METHODS = new Set(["NO_SCORE", "COMPLIANCE_PERCENTAGE", "WEIGHTED_SCORE"]);
const CREATE_RPC = "qlcl_create_checklist_template_v1";

export async function POST(request: Request) {
  const auth = await requireApiPermission("checklists.manage");
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const name = String(body.name || "").trim();
  const description = body.description ? String(body.description).trim() : null;
  const sourceCode = body.source_code ? String(body.source_code).trim().toUpperCase() : null;
  const ownerDepartmentId = String(body.owner_department_id || "").trim();
  const scoringMethod = String(body.scoring_method || "COMPLIANCE_PERCENTAGE").trim();

  if (!name) return NextResponse.json({ error: "Tên mẫu bảng kiểm là bắt buộc." }, { status: 400 });
  if (!ownerDepartmentId) return NextResponse.json({ error: "Cần chọn khoa/phòng quản lý mẫu." }, { status: 400 });
  if (!SCORING_METHODS.has(scoringMethod)) return NextResponse.json({ error: "Phương pháp tính kết quả không hợp lệ." }, { status: 400 });

  const admin = createAdminClient();
  const { data: tx, error } = await admin.rpc(CREATE_RPC, {
    p_actor_user_id: auth.user.id,
    p_name: name,
    p_description: description,
    p_source_code: sourceCode,
    p_owner_department_id: ownerDepartmentId,
    p_scoring_method: scoringMethod,
  });

  if (error) {
    const message = rpcErrorMessage(error, "Không tạo được mẫu bảng kiểm.");
    const status =
      /not active|chưa gắn|không hợp lệ.*tổ chức/i.test(message) ? 403 :
      /bắt buộc|không hợp lệ|đã ngưng/i.test(message) ? 409 :
      400;
    return NextResponse.json({ error: message }, { status });
  }

  const result = tx && typeof tx === "object" ? tx as Record<string, unknown> : {};
  const id = typeof result.id === "string" ? result.id : null;
  const code = typeof result.code === "string" ? result.code : null;
  const versionId = typeof result.version_id === "string" ? result.version_id : null;

  if (!id || !code || !versionId) {
    return NextResponse.json({ error: "Kết quả tạo mẫu bảng kiểm không hợp lệ." }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    id,
    code,
    name: typeof result.name === "string" ? result.name : name,
    version_id: versionId,
    version_no: 1,
    status: "DRAFT",
    transaction: "atomic",
  });
}
