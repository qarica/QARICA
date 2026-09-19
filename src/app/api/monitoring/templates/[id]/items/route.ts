import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ANSWER_TYPES = new Set(["PASS_FAIL", "YES_NO", "SINGLE_CHOICE", "MULTI_CHOICE", "NUMBER", "SCORE", "TEXT"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("checklists.manage");
  if (!auth.ok) return auth.response;

  const { id: templateId } = await params;
  const body = await request.json();
  const versionId = String(body.version_id || "").trim();
  const sectionId = String(body.section_id || "").trim();
  const content = String(body.content || "").trim();
  const answerType = String(body.answer_type || "PASS_FAIL").trim();
  const options = Array.isArray(body.options) ? body.options.map((x: unknown) => String(x).trim()).filter(Boolean) : [];

  if (!versionId) return NextResponse.json({ error: "Thiếu phiên bản bảng kiểm." }, { status: 400 });
  if (!sectionId) return NextResponse.json({ error: "Cần chọn nhóm mục cho tiêu chí." }, { status: 400 });
  if (!content) return NextResponse.json({ error: "Nội dung tiêu chí là bắt buộc." }, { status: 400 });
  if (!ANSWER_TYPES.has(answerType)) return NextResponse.json({ error: "Loại câu trả lời không hợp lệ." }, { status: 400 });
  if (["SINGLE_CHOICE", "MULTI_CHOICE"].includes(answerType) && options.length < 2) {
    return NextResponse.json({ error: "Tiêu chí lựa chọn cần ít nhất 02 phương án." }, { status: 400 });
  }

  const admin = createAdminClient();
  const [{ data: caller, error: callerError }, { data: template, error: templateError }, { data: version, error: versionError }, { data: section, error: sectionError }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("checklist_templates").select("id,owner_department_id,is_active").eq("id", templateId).maybeSingle(),
    admin.from("checklist_versions").select("id,checklist_template_id,status").eq("id", versionId).maybeSingle(),
    admin.from("checklist_sections").select("id,checklist_version_id").eq("id", sectionId).maybeSingle(),
  ]);

  if (callerError || !caller?.organization_id || !caller.is_active) return NextResponse.json({ error: callerError?.message || "Tài khoản không hợp lệ." }, { status: 403 });
  if (templateError || !template || !template.is_active) return NextResponse.json({ error: "Không tìm thấy mẫu bảng kiểm đang hoạt động." }, { status: 404 });
  if (versionError || !version || version.checklist_template_id !== templateId) return NextResponse.json({ error: "Phiên bản bảng kiểm không hợp lệ." }, { status: 400 });
  if (version.status !== "DRAFT") return NextResponse.json({ error: "Chỉ được chỉnh sửa phiên bản đang ở trạng thái Nháp." }, { status: 409 });
  if (sectionError || !section || section.checklist_version_id !== versionId) return NextResponse.json({ error: "Nhóm mục không thuộc phiên bản hiện tại." }, { status: 400 });

  if (!template.owner_department_id) return NextResponse.json({ error: "Mẫu bảng kiểm chưa có đơn vị quản lý." }, { status: 400 });
  const { data: department } = await admin.from("departments").select("organization_id").eq("id", template.owner_department_id).maybeSingle();
  if (!department || department.organization_id !== caller.organization_id) return NextResponse.json({ error: "Mẫu bảng kiểm không thuộc bệnh viện hiện tại." }, { status: 403 });

  const { data: last } = await admin.from("checklist_items").select("sequence_no").eq("checklist_version_id", versionId).eq("section_id", sectionId).order("sequence_no", { ascending: false }).limit(1).maybeSingle();
  const sequenceNo = Number(last?.sequence_no ?? 0) + 10;

  const scoreValue = body.score_value === "" || body.score_value == null ? null : Number(body.score_value);
  const weight = body.weight === "" || body.weight == null ? null : Number(body.weight);
  if (scoreValue !== null && !Number.isFinite(scoreValue)) return NextResponse.json({ error: "Điểm tiêu chí không hợp lệ." }, { status: 400 });
  if (weight !== null && (!Number.isFinite(weight) || weight < 0)) return NextResponse.json({ error: "Trọng số không hợp lệ." }, { status: 400 });

  const { data: item, error: itemError } = await admin.from("checklist_items").insert({
    checklist_version_id: versionId,
    section_id: sectionId,
    content,
    answer_type: answerType,
    is_required: body.is_required !== false,
    allow_na: body.allow_na === true,
    na_reason_required: body.na_reason_required === true,
    is_critical: body.is_critical === true,
    scoring_enabled: body.scoring_enabled === true,
    score_value: scoreValue,
    weight,
    finding_on_fail: body.finding_on_fail === true,
    evidence_required_on_fail: body.evidence_required_on_fail === true,
    sequence_no: sequenceNo,
  }).select("id,content,answer_type,sequence_no").single();

  if (itemError || !item) return NextResponse.json({ error: itemError?.message || "Không tạo được tiêu chí." }, { status: 400 });

  if (["SINGLE_CHOICE", "MULTI_CHOICE"].includes(answerType)) {
    const optionRows = options.map((label: string, index: number) => ({
      checklist_item_id: item.id,
      option_code: `OPT${index + 1}`,
      option_label: label,
      option_value: label,
      sort_order: index + 1,
    }));
    const { error: optionError } = await admin.from("checklist_item_options").insert(optionRows);
    if (optionError) {
      await admin.from("checklist_items").delete().eq("id", item.id);
      return NextResponse.json({ error: optionError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true, item_id: item.id });
}


export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("checklists.manage");
  if (!auth.ok) return auth.response;

  const { id: templateId } = await params;
  const body = await request.json();
  const versionId = String(body.version_id || "").trim();
  const itemId = String(body.item_id || "").trim();
  const sectionId = String(body.section_id || "").trim();
  const content = String(body.content || "").trim();
  const answerType = String(body.answer_type || "PASS_FAIL").trim();
  const options = Array.isArray(body.options) ? body.options.map((x: unknown) => String(x).trim()).filter(Boolean) : [];

  if (!versionId || !itemId || !sectionId) return NextResponse.json({ error: "Thiếu phiên bản, nhóm mục hoặc tiêu chí cần cập nhật." }, { status: 400 });
  if (!content) return NextResponse.json({ error: "Nội dung tiêu chí là bắt buộc." }, { status: 400 });
  if (!ANSWER_TYPES.has(answerType)) return NextResponse.json({ error: "Loại câu trả lời không hợp lệ." }, { status: 400 });
  if (["SINGLE_CHOICE", "MULTI_CHOICE"].includes(answerType) && options.length < 2) {
    return NextResponse.json({ error: "Tiêu chí lựa chọn cần ít nhất 02 phương án." }, { status: 400 });
  }

  const scoreValue = body.score_value === "" || body.score_value == null ? null : Number(body.score_value);
  const weight = body.weight === "" || body.weight == null ? null : Number(body.weight);
  if (scoreValue !== null && !Number.isFinite(scoreValue)) return NextResponse.json({ error: "Điểm tiêu chí không hợp lệ." }, { status: 400 });
  if (weight !== null && (!Number.isFinite(weight) || weight < 0)) return NextResponse.json({ error: "Trọng số không hợp lệ." }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: caller }, { data: template }, { data: version }, { data: section }, { data: item }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("checklist_templates").select("id,owner_department_id,is_active").eq("id", templateId).maybeSingle(),
    admin.from("checklist_versions").select("id,checklist_template_id,status").eq("id", versionId).maybeSingle(),
    admin.from("checklist_sections").select("id,checklist_version_id").eq("id", sectionId).maybeSingle(),
    admin.from("checklist_items").select("id,checklist_version_id").eq("id", itemId).maybeSingle(),
  ]);

  if (!caller?.organization_id || !caller.is_active) return NextResponse.json({ error: "Tài khoản không hợp lệ." }, { status: 403 });
  if (!template?.is_active) return NextResponse.json({ error: "Mẫu bảng kiểm đã ngưng hoặc không tồn tại." }, { status: 404 });
  if (!version || version.checklist_template_id !== templateId || version.status !== "DRAFT") return NextResponse.json({ error: "Chỉ được cập nhật phiên bản Nháp." }, { status: 409 });
  if (!section || section.checklist_version_id !== versionId) return NextResponse.json({ error: "Nhóm mục không thuộc phiên bản hiện tại." }, { status: 400 });
  if (!item || item.checklist_version_id !== versionId) return NextResponse.json({ error: "Tiêu chí không thuộc phiên bản hiện tại." }, { status: 400 });

  const { data: department } = template.owner_department_id
    ? await admin.from("departments").select("organization_id").eq("id", template.owner_department_id).maybeSingle()
    : { data: null };
  if (!department || department.organization_id !== caller.organization_id) return NextResponse.json({ error: "Mẫu bảng kiểm không thuộc bệnh viện hiện tại." }, { status: 403 });

  const { data: oldOptions } = await admin.from("checklist_item_options")
    .select("option_code,option_label,option_value,sort_order")
    .eq("checklist_item_id", itemId)
    .order("sort_order");

  const { error: itemError } = await admin.from("checklist_items").update({
    section_id: sectionId,
    content,
    answer_type: answerType,
    is_required: body.is_required !== false,
    allow_na: body.allow_na === true,
    na_reason_required: body.na_reason_required === true,
    is_critical: body.is_critical === true,
    scoring_enabled: body.scoring_enabled === true,
    score_value: scoreValue,
    weight,
    finding_on_fail: body.finding_on_fail === true,
    evidence_required_on_fail: body.evidence_required_on_fail === true,
  }).eq("id", itemId);
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 400 });

  const { error: deleteOptionsError } = await admin.from("checklist_item_options").delete().eq("checklist_item_id", itemId);
  if (deleteOptionsError) return NextResponse.json({ error: deleteOptionsError.message }, { status: 400 });

  if (["SINGLE_CHOICE", "MULTI_CHOICE"].includes(answerType)) {
    const optionRows = options.map((label: string, index: number) => ({
      checklist_item_id: itemId,
      option_code: `OPT${index + 1}`,
      option_label: label,
      option_value: label,
      sort_order: index + 1,
    }));
    const { error: optionError } = await admin.from("checklist_item_options").insert(optionRows);
    if (optionError) {
      if (oldOptions?.length) {
        await admin.from("checklist_item_options").insert(oldOptions.map((row) => ({ ...row, checklist_item_id: itemId })));
      }
      return NextResponse.json({ error: optionError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}
