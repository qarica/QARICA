import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("checklists.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const [{ data: caller }, { data: template }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("checklist_templates").select("id,owner_department_id,is_active").eq("id", id).maybeSingle(),
  ]);
  if (!caller?.is_active || !caller.organization_id) return NextResponse.json({ error: "Tài khoản không hợp lệ." }, { status: 403 });
  if (!template) return NextResponse.json({ error: "Không tìm thấy bảng kiểm." }, { status: 404 });
  const { data: department } = await admin.from("departments").select("organization_id").eq("id", template.owner_department_id).maybeSingle();
  if (department?.organization_id !== caller.organization_id) return NextResponse.json({ error: "Bảng kiểm không thuộc bệnh viện hiện tại." }, { status: 403 });

  const body = await request.json();
  const operation = String(body.operation || "");
  if (operation === "draft") {
    if (!template.is_active) return NextResponse.json({ error: "Bảng kiểm đã ngưng sử dụng." }, { status: 409 });
    const { data: versions } = await admin.from("checklist_versions").select("id,status,version_no,scoring_method").eq("checklist_template_id", id).order("version_no", { ascending: false }).limit(1);
    const latest = versions?.[0];
    if (!latest || latest.status === "DRAFT") return NextResponse.json({ error: "Đã có bản nháp hoặc chưa có phiên bản." }, { status: 409 });
    const { data: draft, error: draftError } = await admin.from("checklist_versions").insert({ checklist_template_id: id, version_no: latest.version_no + 1, status: "DRAFT", scoring_method: latest.scoring_method }).select("id").single();
    if (draftError || !draft) return NextResponse.json({ error: draftError?.message || "Không tạo được bản nháp." }, { status: 400 });
    const rollback = async (message: string) => { await admin.from("checklist_versions").delete().eq("id", draft.id); return NextResponse.json({ error: message }, { status: 400 }); };
    const { data: sections, error: sectionsError } = await admin.from("checklist_sections").select("id,title,description,sequence_no").eq("checklist_version_id", latest.id).order("sequence_no");
    if (sectionsError) return rollback(sectionsError.message);
    const sectionIds = new Map<string, string>();
    for (const section of sections || []) {
      const { data: copy, error } = await admin.from("checklist_sections").insert({ checklist_version_id: draft.id, title: section.title, description: section.description, sequence_no: section.sequence_no }).select("id").single();
      if (error || !copy) return rollback(error?.message || "Không sao chép được nhóm mục.");
      sectionIds.set(section.id, copy.id);
    }
    const { data: items, error: itemsError } = await admin.from("checklist_items").select("id,section_id,content,answer_type,is_required,allow_na,na_reason_required,is_critical,scoring_enabled,score_value,weight,finding_on_fail,evidence_required_on_fail,sequence_no,metadata").eq("checklist_version_id", latest.id).order("sequence_no");
    if (itemsError) return rollback(itemsError.message);
    const itemIds = new Map<string, string>();
    for (const item of items || []) {
      const { id: sourceId, section_id, ...fields } = item;
      const { data: copy, error } = await admin.from("checklist_items").insert({ ...fields, checklist_version_id: draft.id, section_id: sectionIds.get(section_id) || null }).select("id").single();
      if (error || !copy) return rollback(error?.message || "Không sao chép được nội dung.");
      itemIds.set(sourceId, copy.id);
    }
    if (itemIds.size) {
      const { data: options, error: optionsError } = await admin.from("checklist_item_options").select("checklist_item_id,option_code,option_label,option_value,sort_order").in("checklist_item_id", [...itemIds.keys()]);
      if (optionsError) return rollback(optionsError.message);
      if (options?.length) {
        const { error } = await admin.from("checklist_item_options").insert(options.map(option => ({ ...option, checklist_item_id: itemIds.get(option.checklist_item_id) })));
        if (error) return rollback(error.message);
      }
    }
    return NextResponse.json({ ok: true, version_id: draft.id });
  }
  if (operation === "retire") {
    if (!template.is_active) return NextResponse.json({ error: "Bảng kiểm đã ngưng sử dụng." }, { status: 409 });
    const { error } = await admin.from("checklist_templates").update({ is_active: false }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (operation !== "update" || !template.is_active) return NextResponse.json({ error: "Thao tác không hợp lệ." }, { status: 400 });
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim() || null;
  const sourceCode = String(body.source_code || "").trim() || null;
  if (!name) return NextResponse.json({ error: "Tên bảng kiểm là bắt buộc." }, { status: 400 });
  const { data: latest } = await admin.from("checklist_versions").select("status").eq("checklist_template_id", id).order("version_no", { ascending: false }).limit(1);
  if (latest?.[0]?.status !== "DRAFT") return NextResponse.json({ error: "Nội dung đã phát hành cần được cập nhật qua phiên bản nháp mới." }, { status: 409 });
  const { error } = await admin.from("checklist_templates").update({ name, description, source_code: sourceCode }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
