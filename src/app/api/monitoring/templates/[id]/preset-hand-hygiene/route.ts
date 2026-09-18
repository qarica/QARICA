import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

function isHandHygieneTemplate(name: string) {
  const normalized = name.trim().toLocaleLowerCase("vi-VN");
  return normalized.includes("vệ sinh tay") && normalized.includes("tuân thủ");
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("checklists.manage");
  if (!auth.ok) return auth.response;

  const { id: templateId } = await params;
  const body = await request.json();
  const versionId = String(body.version_id || "").trim();
  if (!versionId) return NextResponse.json({ error: "Thiếu phiên bản bảng kiểm." }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: caller }, { data: template }, { data: version }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("checklist_templates").select("id,name,owner_department_id,is_active").eq("id", templateId).maybeSingle(),
    admin.from("checklist_versions").select("id,checklist_template_id,status").eq("id", versionId).maybeSingle(),
  ]);

  if (!caller?.organization_id || !caller.is_active) return NextResponse.json({ error: "Tài khoản không hợp lệ hoặc chưa gắn bệnh viện." }, { status: 403 });
  if (!template || !template.is_active) return NextResponse.json({ error: "Không tìm thấy mẫu bảng kiểm đang hoạt động." }, { status: 404 });
  if (!isHandHygieneTemplate(template.name)) return NextResponse.json({ error: "Preset này chỉ áp dụng cho mẫu tuân thủ vệ sinh tay." }, { status: 400 });
  if (!version || version.checklist_template_id !== templateId) return NextResponse.json({ error: "Phiên bản bảng kiểm không hợp lệ." }, { status: 400 });
  if (version.status !== "DRAFT") return NextResponse.json({ error: "Chỉ được nạp nội dung vào phiên bản Nháp." }, { status: 409 });
  if (!template.owner_department_id) return NextResponse.json({ error: "Mẫu bảng kiểm chưa có đơn vị quản lý." }, { status: 400 });

  const { data: ownerDepartment } = await admin.from("departments").select("organization_id").eq("id", template.owner_department_id).maybeSingle();
  if (!ownerDepartment || ownerDepartment.organization_id !== caller.organization_id) return NextResponse.json({ error: "Mẫu bảng kiểm không thuộc bệnh viện hiện tại." }, { status: 403 });

  const [{ count: sectionCount }, { count: itemCount }] = await Promise.all([
    admin.from("checklist_sections").select("id", { count: "exact", head: true }).eq("checklist_version_id", versionId),
    admin.from("checklist_items").select("id", { count: "exact", head: true }).eq("checklist_version_id", versionId),
  ]);

  if ((sectionCount ?? 0) > 0 || (itemCount ?? 0) > 0) {
    return NextResponse.json({ ok: true, already_seeded: true, message: "Phiên bản đã có nội dung; hệ thống không nạp chồng preset." });
  }

  const { data: sections, error: sectionError } = await admin.from("checklist_sections").insert([
    {
      checklist_version_id: versionId,
      title: "1. Quan sát cơ hội vệ sinh tay",
      description: "Ghi nhận lặp lại từng cơ hội vệ sinh tay. Kế hoạch QLCL bệnh viện quy định quan sát trực tiếp theo 5 thời điểm, tối thiểu 30 cơ hội/khoa/tháng.",
      sequence_no: 10,
    },
    {
      checklist_version_id: versionId,
      title: "2. Kết luận và phản hồi sau giám sát",
      description: "Ghi nhận nhận xét, nguyên nhân không tuân thủ và nội dung phản hồi/khắc phục sau đợt giám sát.",
      sequence_no: 20,
    },
  ]).select("id,title,sequence_no").order("sequence_no", { ascending: true });

  if (sectionError || !sections || sections.length !== 2) {
    return NextResponse.json({ error: sectionError?.message || "Không tạo được cấu trúc bảng kiểm vệ sinh tay." }, { status: 400 });
  }

  const observationSectionId = sections[0].id;
  const conclusionSectionId = sections[1].id;

  const observationMetadata = {
    form_mode: "HAND_HYGIENE_OPPORTUNITY_LOG",
    repeatable: true,
    minimum_opportunities_per_department_month: 30,
    target_compliance_percent: 80,
    numerator_definition: "Số cơ hội vệ sinh tay được thực hiện đúng thời điểm và đúng kỹ thuật",
    denominator_definition: "Tổng số cơ hội vệ sinh tay hợp lệ được quan sát",
    formula: "B/A × 100",
    moments: [
      { code: "M1", label: "Trước khi tiếp xúc người bệnh" },
      { code: "M2", label: "Trước thủ thuật sạch/vô khuẩn" },
      { code: "M3", label: "Sau nguy cơ phơi nhiễm dịch cơ thể" },
      { code: "M4", label: "Sau khi tiếp xúc người bệnh" },
      { code: "M5", label: "Sau khi tiếp xúc môi trường xung quanh người bệnh" },
    ],
    staff_groups: ["Bác sĩ", "Điều dưỡng", "Hộ sinh", "Kỹ thuật viên", "Hộ lý", "Khác"],
    actions: [
      { code: "HANDRUB", label: "Chà tay bằng dung dịch chứa cồn" },
      { code: "HANDWASH", label: "Rửa tay bằng xà phòng và nước" },
      { code: "MISSED", label: "Không thực hiện vệ sinh tay" },
    ],
    technique_values: [
      { code: "CORRECT", label: "Đúng kỹ thuật" },
      { code: "INCORRECT", label: "Chưa đúng kỹ thuật" },
    ],
    compliance_rule: "Đạt khi có thực hiện vệ sinh tay đúng thời điểm và đúng kỹ thuật.",
    sources: ["Kế hoạch hoạt động QLCL bệnh viện 2026", "TMMC-GQM-SOP01 AT-10", "WHO My 5 Moments for Hand Hygiene"],
  };

  const { error: itemError } = await admin.from("checklist_items").insert([
    {
      checklist_version_id: versionId,
      section_id: observationSectionId,
      content: "Nhật ký quan sát các cơ hội vệ sinh tay",
      answer_type: "TEXT",
      is_required: true,
      allow_na: false,
      na_reason_required: false,
      is_critical: true,
      scoring_enabled: false,
      finding_on_fail: false,
      evidence_required_on_fail: false,
      sequence_no: 10,
      metadata: observationMetadata,
    },
    {
      checklist_version_id: versionId,
      section_id: conclusionSectionId,
      content: "Nhận xét chung / nguyên nhân không tuân thủ",
      answer_type: "TEXT",
      is_required: false,
      allow_na: false,
      na_reason_required: false,
      is_critical: false,
      scoring_enabled: false,
      finding_on_fail: false,
      evidence_required_on_fail: false,
      sequence_no: 10,
      metadata: { field_role: "SUMMARY_NOTE", excluded_from_compliance_denominator: true },
    },
    {
      checklist_version_id: versionId,
      section_id: conclusionSectionId,
      content: "Phản hồi cho đơn vị / hành động khắc phục / đề nghị tái giám sát",
      answer_type: "TEXT",
      is_required: false,
      allow_na: false,
      na_reason_required: false,
      is_critical: false,
      scoring_enabled: false,
      finding_on_fail: false,
      evidence_required_on_fail: false,
      sequence_no: 20,
      metadata: { field_role: "FOLLOWUP_NOTE", excluded_from_compliance_denominator: true },
    },
  ]);

  if (itemError) {
    await admin.from("checklist_sections").delete().in("id", sections.map((x) => x.id));
    return NextResponse.json({ error: itemError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, sections: 2, items: 3 });
}
