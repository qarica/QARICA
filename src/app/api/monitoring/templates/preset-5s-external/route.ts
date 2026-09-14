import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SOURCE_CODE = "BK01.V1_QLCL.QĐ.06";
const TEMPLATE_NAME = "Bảng kiểm 5S - Khu vực: Bên ngoài bệnh viện";

const AREA_OPTIONS = [
  "Sảnh đón khách và cửa ra về",
  "Khu vực bãi đỗ xe",
  "Khu vực sân xung quanh bệnh viện",
  "Khu vực đường bao quanh khuôn viên BV",
  "Khu vực cầu thang bộ lối lên khu Văn Phòng",
  "Bảng hiệu của bệnh viện",
  "Khu vực phía trước các ki-ốt",
  "Khu vực tập kết rác thải y tế và rác thải thông thường",
];

const STRUCTURE = [
  {
    title: "Sàng lọc",
    items: ["Không có vật dụng thừa hoặc không cần thiết"],
  },
  {
    title: "Sắp xếp",
    items: ["Gọn gàng, ngay ngắn, đúng vị trí"],
  },
  {
    title: "Sạch sẽ",
    items: [
      "Không chất thải vương vãi",
      "Thùng đựng chất thải luôn đậy nắp",
      "Phân loại rác đúng quy định",
      "Không có vệt nước/ nước đọng, khô ráo",
      "Không vết bẩn/ vết đánh dấu/ các vật hoặc chất ô nhiễm khác",
      "Mọi bề mặt, khe kẽ luôn sạch khi quan sát bằng mắt thường",
    ],
  },
  {
    title: "Săn sóc",
    items: ["Đảm bảo 03 nội dung trên (Sàng lọc, Sắp xếp, Sạch sẽ)"],
  },
  {
    title: "Sẵn sàng",
    items: ["Ý thức tự giác thực hiện của nhân viên\nPhương tiện làm việc luôn trong trạng thái sẵn sàng"],
  },
];

export async function POST(request: Request) {
  const auth = await requireApiPermission("checklists.manage");
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const ownerDepartmentId = String(body.owner_department_id || "").trim();
  if (!ownerDepartmentId) return NextResponse.json({ error: "Cần chọn khoa/phòng quản lý mẫu." }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: caller }, { data: department }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("departments").select("id,organization_id,is_active").eq("id", ownerDepartmentId).maybeSingle(),
  ]);

  if (!caller?.organization_id || !caller.is_active) return NextResponse.json({ error: "Tài khoản không hợp lệ hoặc chưa gắn bệnh viện." }, { status: 403 });
  if (!department?.is_active || department.organization_id !== caller.organization_id) return NextResponse.json({ error: "Khoa/phòng quản lý mẫu không hợp lệ." }, { status: 400 });

  const { data: existingTemplates } = await admin
    .from("checklist_templates")
    .select("id,code,name,owner_department_id,is_active")
    .eq("code", SOURCE_CODE)
    .eq("owner_department_id", ownerDepartmentId)
    .limit(1);
  const existing = existingTemplates?.[0];
  if (existing) {
    return NextResponse.json({ ok: true, existing: true, id: existing.id, code: existing.code, name: existing.name });
  }

  const description = [
    "Biểu mẫu nguồn: BẢNG KIỂM 5S - KHU VỰC: BÊN NGOÀI BỆNH VIỆN.",
    `Mã biểu mẫu: ${SOURCE_CODE}.`,
    "Đánh giá Đạt (✓), KHÔNG ĐẠT (x) hoặc '/' đối với nội dung không thực hiện.",
    "Cho phép chọn vị trí Khác và nhập tên vị trí thực tế khi phát sinh ngoài danh sách chuẩn.",
    "Trường hợp KHÔNG ĐẠT, nhân viên thực hiện 5S phải khắc phục ngay (nếu có) hoặc điều động nhân viên HK thực hiện biện pháp khắc phục và kiểm tra lại trong vòng 05 phút sau khi báo.",
  ].join(" ");

  const { data: template, error: templateError } = await admin.from("checklist_templates").insert({
    code: SOURCE_CODE,
    name: TEMPLATE_NAME,
    description,
    owner_department_id: ownerDepartmentId,
    is_active: true,
    created_by: auth.user.id,
  }).select("id,code,name").single();
  if (templateError || !template) return NextResponse.json({ error: templateError?.message || "Không tạo được mẫu bảng kiểm 5S." }, { status: 400 });

  const { data: version, error: versionError } = await admin.from("checklist_versions").insert({
    checklist_template_id: template.id,
    version_no: 1,
    status: "DRAFT",
    scoring_method: "COMPLIANCE_PERCENTAGE",
  }).select("id,version_no,status").single();
  if (versionError || !version) {
    await admin.from("checklist_templates").delete().eq("id", template.id);
    return NextResponse.json({ error: versionError?.message || "Không tạo được phiên bản 1 của bảng kiểm 5S." }, { status: 400 });
  }

  const sectionsPayload = STRUCTURE.map((section, index) => ({
    checklist_version_id: version.id,
    title: section.title,
    description: null,
    sequence_no: (index + 1) * 10,
  }));
  const { data: sections, error: sectionError } = await admin.from("checklist_sections").insert(sectionsPayload).select("id,title,sequence_no").order("sequence_no", { ascending: true });
  if (sectionError || !sections || sections.length !== STRUCTURE.length) {
    await admin.from("checklist_templates").delete().eq("id", template.id);
    return NextResponse.json({ error: sectionError?.message || "Không tạo được nhóm mục 5S." }, { status: 400 });
  }

  const sectionIdByTitle = new Map(sections.map((section) => [section.title, section.id]));
  const itemsPayload = STRUCTURE.flatMap((section) => section.items.map((content, index) => ({
    checklist_version_id: version.id,
    section_id: sectionIdByTitle.get(section.title),
    content,
    answer_type: "PASS_FAIL",
    is_required: true,
    allow_na: true,
    na_reason_required: false,
    is_critical: false,
    scoring_enabled: true,
    score_value: 1,
    weight: 1,
    finding_on_fail: false,
    evidence_required_on_fail: false,
    default_severity: null,
    sequence_no: (index + 1) * 10,
    metadata: {
      source_code: SOURCE_CODE,
      source_form: "BẢNG KIỂM 5S - KHU VỰC: BÊN NGOÀI BỆNH VIỆN",
      area_options: AREA_OPTIONS,
      allow_other_area: true,
      allowed_results: ["PASS", "FAIL", "NA"],
      na_display: "/",
      fail_followup: "IMMEDIATE_CORRECTION_AND_RECHECK_5_MIN",
    },
  })));

  const { error: itemError } = await admin.from("checklist_items").insert(itemsPayload);
  if (itemError) {
    await admin.from("checklist_templates").delete().eq("id", template.id);
    return NextResponse.json({ error: itemError.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    existing: false,
    id: template.id,
    code: template.code,
    name: template.name,
    version_id: version.id,
    version_no: version.version_no,
    status: version.status,
    section_count: STRUCTURE.length,
    item_count: itemsPayload.length,
    area_options: AREA_OPTIONS,
    allow_other_area: true,
  });
}
