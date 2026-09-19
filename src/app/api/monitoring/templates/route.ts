import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SCORING_METHODS = new Set(["NO_SCORE", "COMPLIANCE_PERCENTAGE", "WEIGHTED_SCORE"]);

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
  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("organization_id,is_active")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (callerError || !caller?.organization_id || !caller.is_active) {
    return NextResponse.json({ error: callerError?.message || "Tài khoản không hợp lệ hoặc chưa gắn bệnh viện." }, { status: 403 });
  }

  const { data: department, error: departmentError } = await admin
    .from("departments")
    .select("id,organization_id,is_active")
    .eq("id", ownerDepartmentId)
    .eq("organization_id", caller.organization_id)
    .maybeSingle();

  if (departmentError || !department?.is_active) {
    return NextResponse.json({ error: "Khoa/phòng quản lý mẫu không hợp lệ hoặc đã ngưng hoạt động." }, { status: 400 });
  }

  const { data: code, error: codeError } = await admin.rpc("qlcl_next_master_code_v1", {
    p_org: caller.organization_id,
    p_kind: "CHECKLIST",
    p_work_year: new Date().getFullYear(),
  });
  if (codeError || !code) {
    return NextResponse.json({ error: codeError?.message || "Không sinh được mã bảng kiểm." }, { status: 400 });
  }

  const { data: template, error: templateError } = await admin
    .from("checklist_templates")
    .insert({
      organization_id: caller.organization_id,
      code,
      source_code: sourceCode,
      code_scheme_version: 2,
      name,
      description,
      owner_department_id: ownerDepartmentId,
      is_active: true,
      created_by: auth.user.id,
    })
    .select("id,code,name")
    .single();

  if (templateError || !template) {
    return NextResponse.json({ error: templateError?.message || "Không tạo được mẫu bảng kiểm." }, { status: 400 });
  }

  const { data: version, error: versionError } = await admin
    .from("checklist_versions")
    .insert({
      checklist_template_id: template.id,
      version_no: 1,
      status: "DRAFT",
      scoring_method: scoringMethod,
    })
    .select("id,version_no,status")
    .single();

  if (versionError || !version) {
    await admin.from("checklist_templates").delete().eq("id", template.id);
    return NextResponse.json({ error: versionError?.message || "Không tạo được phiên bản đầu tiên của bảng kiểm." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    id: template.id,
    code: template.code,
    name: template.name,
    version_id: version.id,
    version_no: version.version_no,
    status: version.status,
  });
}
