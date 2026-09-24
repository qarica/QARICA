import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Preset "Bàn giao người bệnh tại giường theo SBAR" — theo mô hình đã áp dụng thực tế
// tại BV ĐHYD TPHCM (Khoa Ngoại Tiêu hoá): 4 nhóm mục tương ứng 4 cấu phần SBAR
// (Situation/Background/Assessment/Recommendation), mỗi cấu phần có các tiêu chí
// PASS/FAIL để tính được tỷ lệ tuân thủ RIÊNG theo từng cấu phần (không chỉ tỷ lệ
// tuân thủ chung), giống cách bảng kiểm tuân thủ vệ sinh tay đã seed sẵn.
function isSbarHandoffTemplate(name: string) {
  const normalized = name.trim().toLocaleLowerCase("vi-VN");
  return normalized.includes("sbar") || (normalized.includes("bàn giao") && normalized.includes("giường"));
}

const SECTION_DEFS = [
  {
    code: "S",
    title: "1. Situation — Tình huống",
    description: "Thông tin nhận diện người bệnh và lý do bàn giao hiện tại.",
    items: [
      { content: "Nêu rõ họ tên, tuổi, chẩn đoán và lý do bàn giao hiện tại của người bệnh", is_critical: true },
      { content: "Nêu tình trạng cần lưu ý ngay tại thời điểm bàn giao (dấu hiệu sinh tồn bất thường, mức độ đau...)", is_critical: false },
    ],
  },
  {
    code: "B",
    title: "2. Background — Nền tảng",
    description: "Bối cảnh bệnh sử và diễn biến điều trị liên quan đến ca trực tiếp theo.",
    items: [
      { content: "Tóm tắt tiền sử bệnh, lý do nhập viện và diễn biến điều trị liên quan", is_critical: false },
      { content: "Nêu các thuốc/can thiệp đang thực hiện cần theo dõi tiếp", is_critical: false },
    ],
  },
  {
    code: "A",
    title: "3. Assessment — Đánh giá",
    description: "Nhận định lâm sàng và các nguy cơ an toàn người bệnh hiện tại.",
    items: [
      { content: "Nêu đánh giá lâm sàng hiện tại của điều dưỡng giao ca", is_critical: true },
      { content: "Nêu các nguy cơ/cảnh báo an toàn người bệnh cần chú ý (ngã, loét do áp lực, dị ứng, hít sặc...)", is_critical: false },
    ],
  },
  {
    code: "R",
    title: "4. Recommendation — Đề xuất",
    description: "Việc cần làm tiếp theo và xác nhận hai chiều giữa điều dưỡng giao/nhận.",
    items: [
      { content: "Nêu rõ việc cần theo dõi/thực hiện tiếp theo và thời điểm thực hiện", is_critical: true, finding_on_fail: true },
      { content: "Điều dưỡng nhận ca đọc lại (read-back) và xác nhận đã hiểu nội dung bàn giao", is_critical: true },
    ],
  },
] as const;

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
  if (!isSbarHandoffTemplate(template.name)) return NextResponse.json({ error: "Preset này chỉ áp dụng cho mẫu bàn giao người bệnh theo SBAR (tên mẫu cần chứa \"SBAR\" hoặc \"bàn giao ... giường\")." }, { status: 400 });
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

  const { data: sections, error: sectionError } = await admin.from("checklist_sections").insert(
    SECTION_DEFS.map((s, index) => ({
      checklist_version_id: versionId,
      title: s.title,
      description: s.description,
      sequence_no: (index + 1) * 10,
    })),
  ).select("id,title,sequence_no").order("sequence_no", { ascending: true });

  if (sectionError || !sections || sections.length !== SECTION_DEFS.length) {
    return NextResponse.json({ error: sectionError?.message || "Không tạo được cấu trúc bảng kiểm SBAR." }, { status: 400 });
  }

  const itemRows = SECTION_DEFS.flatMap((s, sIndex) =>
    s.items.map((item, iIndex) => ({
      checklist_version_id: versionId,
      section_id: sections[sIndex].id,
      content: item.content,
      answer_type: "PASS_FAIL",
      is_required: true,
      allow_na: false,
      na_reason_required: false,
      is_critical: item.is_critical,
      scoring_enabled: false,
      finding_on_fail: (item as { finding_on_fail?: boolean }).finding_on_fail === true,
      evidence_required_on_fail: false,
      sequence_no: (iIndex + 1) * 10,
      metadata: { sbar_component: s.code, sbar_component_label: s.title },
    })),
  );

  const { error: itemError } = await admin.from("checklist_items").insert(itemRows);
  if (itemError) {
    await admin.from("checklist_sections").delete().in("id", sections.map((x) => x.id));
    return NextResponse.json({ error: itemError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, sections: sections.length, items: itemRows.length });
}
