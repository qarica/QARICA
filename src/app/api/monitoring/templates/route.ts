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
  const sourceCode = body.source_code ? String(body.source_code).trim() : null;
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

  const year = new Date().getFullYear();
  const prefix = `BK-${year}-`;
  let template: { id: string; code: string; name: string } | null = null;
  let templateError: { message: string; code?: string } | null = null;
  // Retain existing codes. Only newly created templates receive the new internal code.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: latest, error: lookupError } = await admin.from("checklist_templates")
      .select("internal_code").eq("organization_id", caller.organization_id).like("internal_code", `${prefix}%`).order("internal_code", { ascending: false }).limit(1);
    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 400 });
    const last = Number(String(latest?.[0]?.internal_code || "").slice(prefix.length));
    const next = Number.isInteger(last) && last > 0 ? last + 1 : 1;
    if (next > 9999) return NextResponse.json({ error: "Đã hết mã bảng kiểm trong năm." }, { status: 409 });
    const code = `${prefix}${String(next).padStart(4, "0")}`;
    const result = await admin.from("checklist_templates").insert({
      code, internal_code: code, name, description, source_code: sourceCode, owner_department_id: ownerDepartmentId,
      organization_id: caller.organization_id,
      is_active: true, created_by: auth.user.id,
    }).select("id,code,name").single();
    template = result.data;
    templateError = result.error;
    if (!templateError || templateError.code !== "23505") break;
  }

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
