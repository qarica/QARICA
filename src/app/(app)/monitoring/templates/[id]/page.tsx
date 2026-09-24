import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChecklistPublishClient } from "@/components/checklist-publish-client";
import { ChecklistTemplateEditorClient } from "@/components/checklist-template-editor-client";
import { FiveSChecklistPreviewClient } from "@/components/five-s-checklist-preview-client";
import { HandHygienePresetLoader } from "@/components/hand-hygiene-preset-loader";
import { MonitoringScheduleClient } from "@/components/monitoring-schedule-client";
import { SbarHandoffPresetLoader } from "@/components/sbar-handoff-preset-loader";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function scoringLabel(value?: string | null) {
  if (value === "WEIGHTED_SCORE") return "Điểm có trọng số";
  if (value === "NO_SCORE") return "Không tính điểm";
  return "Tỷ lệ tuân thủ (%)";
}

export default async function ChecklistTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUserContext();
  if (!hasAnyPermission(user, ["checklists.view", "checklists.manage", "monitoring.perform"])) redirect("/dashboard?forbidden=1");

  const { id } = await params;
  const supabase = await createClient();
  const { data: template, error: templateError } = await supabase
    .from("checklist_templates")
    .select("id,code,source_code,name,description,owner_department_id,is_active,created_at,updated_at")
    .eq("id", id)
    .maybeSingle();

  if (templateError) return <div className="alert error">Không tải được mẫu bảng kiểm: {templateError.message}</div>;
  if (!template) notFound();

  const [versionsRes, departmentRes] = await Promise.all([
    supabase.from("checklist_versions").select("id,checklist_template_id,version_no,status,effective_from,effective_to,scoring_method,published_at,published_by,created_at").eq("checklist_template_id", id).order("version_no", { ascending: false }),
    template.owner_department_id ? supabase.from("departments").select("id,name,short_name").eq("id", template.owner_department_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);

  const versions = versionsRes.data ?? [];
  const currentVersion = versions[0] ?? null;
  let sections: any[] = [];
  let items: any[] = [];
  let options: any[] = [];
  let structureError: any = null;

  if (currentVersion) {
    const [sectionsRes, itemsRes] = await Promise.all([
      supabase.from("checklist_sections").select("id,checklist_version_id,title,description,sequence_no").eq("checklist_version_id", currentVersion.id).order("sequence_no", { ascending: true }),
      supabase.from("checklist_items").select("id,checklist_version_id,section_id,content,answer_type,is_required,allow_na,na_reason_required,is_critical,scoring_enabled,score_value,weight,finding_on_fail,evidence_required_on_fail,sequence_no,metadata").eq("checklist_version_id", currentVersion.id).order("sequence_no", { ascending: true }),
    ]);
    sections = sectionsRes.data ?? [];
    items = itemsRes.data ?? [];
    structureError = sectionsRes.error || itemsRes.error;
    const itemIds = items.map((x: any) => x.id);
    if (itemIds.length) {
      const optionsRes = await supabase.from("checklist_item_options").select("id,checklist_item_id,option_code,option_label,option_value,sort_order").in("checklist_item_id", itemIds).order("sort_order", { ascending: true });
      options = optionsRes.data ?? [];
      structureError = structureError || optionsRes.error;
    }
  }

  const optionMap = new Map<string, any[]>();
  for (const option of options) {
    const list = optionMap.get(option.checklist_item_id) ?? [];
    list.push(option);
    optionMap.set(option.checklist_item_id, list);
  }
  const itemMap = new Map<string, any[]>();
  for (const item of items) {
    const row = { ...item, options: optionMap.get(item.id) ?? [] };
    const list = itemMap.get(item.section_id) ?? [];
    list.push(row);
    itemMap.set(item.section_id, list);
  }
  const structure = sections.map((section: any) => ({ ...section, items: itemMap.get(section.id) ?? [] }));
  const firstError = versionsRes.error || (departmentRes as any).error || structureError;
  const canManage = user.permissions.includes("checklists.manage");
  const canPerform = user.permissions.includes("monitoring.perform");
  const isFiveS = template.source_code === "BK01.V1_QLCL.QĐ.06" || template.code === "BK01.V1_QLCL.QĐ.06";
  const isPublished = currentVersion?.status === "PUBLISHED";
  const departmentName = (departmentRes.data as any)?.name || "Chưa gắn đơn vị quản lý";
  const statusLabel = currentVersion?.status === "PUBLISHED" ? "Đã phát hành" : currentVersion?.status === "RETIRED" ? "Ngưng sử dụng" : currentVersion?.status === "DRAFT" ? "Bản nháp" : "Chưa có phiên bản";
  const statusTone = currentVersion?.status === "PUBLISHED" ? "success" : currentVersion?.status === "DRAFT" ? "warning" : "muted";

  return <div className="page-stack monitoring-template-shell">
    <style>{`
      .monitoring-template-shell{max-width:1180px;margin:0 auto;gap:13px!important}
      .monitoring-template-shell .template-hero{position:relative;overflow:hidden;border:1px solid #d9e5e4;border-radius:22px;background:linear-gradient(135deg,#fff 0%,#fbfdfd 62%,#eef7f5 100%);padding:20px 22px;display:grid;grid-template-columns:minmax(0,1fr) 235px;gap:24px;box-shadow:0 8px 28px rgba(27,52,58,.045)}
      .monitoring-template-shell .template-hero:after{content:"";position:absolute;width:250px;height:250px;border-radius:50%;right:-125px;bottom:-170px;background:rgba(15,118,110,.06);pointer-events:none}
      .monitoring-template-shell .template-breadcrumb{display:inline-flex;align-items:center;gap:5px;color:#64747a;font-size:11px;font-weight:700;margin-bottom:11px}
      .monitoring-template-shell .template-breadcrumb:hover{color:#1d3f73}
      .monitoring-template-shell .template-title-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .monitoring-template-shell .template-title-row h1{font-size:27px;line-height:1.16;letter-spacing:-.025em;margin:3px 0 5px}
      .monitoring-template-shell .template-description{margin:0;color:#66747a;font-size:12px;line-height:1.5;max-width:760px}
      .monitoring-template-shell .template-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:13px}
      .monitoring-template-shell .template-meta span{padding:5px 8px;border-radius:999px;background:#fff;border:1px solid #dce7e6;color:#536269;font-size:10.5px;font-weight:700}
      .monitoring-template-shell .template-side{position:relative;z-index:1;align-self:stretch;border:1px solid #dce7e5;background:rgba(255,255,255,.82);border-radius:16px;padding:13px;display:flex;flex-direction:column;justify-content:space-between;gap:12px}
      .monitoring-template-shell .template-side small{display:block;color:#7a898e;font-size:9px;font-weight:800;letter-spacing:.11em;text-transform:uppercase;margin-bottom:5px}
      .monitoring-template-shell .template-side strong{font-size:12px;line-height:1.4}
      .monitoring-template-shell .template-side-actions{display:flex;flex-direction:column;gap:7px}
      .monitoring-template-shell .template-side-actions .button{width:100%}
      .monitoring-template-shell>.kpi-grid{display:none!important}
      .monitoring-template-shell .panel{border-color:#dce5e7;border-radius:18px;box-shadow:0 4px 18px rgba(24,51,58,.035)}
      .monitoring-template-shell .panel-title{padding:14px 16px 11px!important}
      .monitoring-template-shell .panel-title h2{font-size:14px!important;line-height:1.35}
      .monitoring-template-shell .panel-title p{font-size:11px!important;line-height:1.45!important;margin-top:4px!important}
      .monitoring-template-shell .scope-note{border:1px solid #d8e7e4!important;background:#f4faf8!important;border-radius:13px!important;padding:10px 12px!important;font-size:11px!important;line-height:1.45!important;color:#4f6462!important}
      .monitoring-template-shell table th{background:#f7f9fa!important;font-size:9px!important;letter-spacing:.04em;color:#69777d!important}
      .monitoring-template-shell table td{padding:10px 12px!important;font-size:11.5px!important}
      .monitoring-template-shell tbody tr:hover{background:#f7fbfa!important}
      .monitoring-template-shell .status-badge{font-size:9.5px!important;padding:4px 7px!important}
      .monitoring-template-shell .button{border-radius:9px!important}
      .monitoring-template-shell .eyebrow{font-size:9px!important;letter-spacing:.12em!important}
      .monitoring-template-shell section.panel:has(.panel-title .eyebrow){border-left:3px solid #9ac7c2}
      @media(max-width:860px){
        .monitoring-template-shell{max-width:none}
        .monitoring-template-shell .template-hero{grid-template-columns:1fr;padding:17px;gap:13px}
        .monitoring-template-shell .template-side{display:grid;grid-template-columns:1fr auto;align-items:center}
        .monitoring-template-shell .template-side-actions{flex-direction:row;flex-wrap:wrap}.monitoring-template-shell .template-side-actions .button{width:auto}
      }
      @media(max-width:620px){
        .monitoring-template-shell{gap:10px!important}
        .monitoring-template-shell .template-hero{border-radius:17px;padding:14px}
        .monitoring-template-shell .template-title-row h1{font-size:22px}
        .monitoring-template-shell .template-side{grid-template-columns:1fr}
        .monitoring-template-shell .template-side-actions{display:grid;grid-template-columns:1fr}.monitoring-template-shell .template-side-actions .button{width:100%}
        .monitoring-template-shell .panel-title{padding:12px!important}
      }
    `}</style>

    <section className="template-hero">
      <div>
        <Link className="template-breadcrumb" href="/monitoring">← Giám sát & Bảng kiểm</Link>
        <div className="eyebrow">MẪU BẢNG KIỂM · {template.code || "CHƯA CÓ MÃ"}{template.source_code ? ` · Nguồn: ${template.source_code}` : ""}</div>
        <div className="template-title-row">
          <h1>{template.name}</h1>
          <span className={`status-badge ${statusTone}`}>{statusLabel}</span>
        </div>
        <p className="template-description">{template.description || "Mẫu bảng kiểm dùng để chuẩn hóa nội dung giám sát. Mỗi lần thực hiện sẽ được tạo thành một đợt giám sát riêng để bảo toàn lịch sử."}</p>
        <div className="template-meta">
          <span>{departmentName}</span>
          <span>{currentVersion ? `Phiên bản v${currentVersion.version_no}` : "Chưa có phiên bản"}</span>
          <span>{sections.length} nhóm mục</span>
          <span>{items.length} tiêu chí</span>
          <span>{scoringLabel(currentVersion?.scoring_method)}</span>
        </div>
      </div>
      <aside className="template-side">
        <div>
          <small>Chế độ sử dụng</small>
          <strong>{isPublished ? "Mẫu đã khóa nội dung. Tạo đợt riêng để đi giám sát thực tế." : "Đang cấu hình mẫu. Hoàn thiện và phát hành trước khi sử dụng thực tế."}</strong>
        </div>
        <div className="template-side-actions">
          {isPublished ? <MonitoringScheduleClient versionId={currentVersion?.id ?? null} canPerform={canPerform} /> : null}
          <Link className="button secondary" href="/monitoring">Quay về danh sách</Link>
        </div>
      </aside>
    </section>

    {firstError ? <div className="alert error">Một phần dữ liệu chưa tải được: {firstError.message}</div> : null}
    {isPublished ? <div className="scope-note"><strong>Phân tách rõ mẫu và lần thực hiện:</strong> trang này quản lý cấu trúc/phiên bản; mỗi lần đi chấm được tạo thành một đợt giám sát có mã, trạng thái và lịch sử riêng.</div> : null}

    <HandHygienePresetLoader
      templateId={template.id}
      templateName={template.name}
      versionId={currentVersion?.id ?? null}
      versionStatus={currentVersion?.status ?? null}
      sectionCount={sections.length}
      itemCount={items.length}
      canManage={canManage}
    />
    <SbarHandoffPresetLoader
      templateId={template.id}
      templateName={template.name}
      versionId={currentVersion?.id ?? null}
      versionStatus={currentVersion?.status ?? null}
      sectionCount={sections.length}
      itemCount={items.length}
      canManage={canManage}
    />
    <ChecklistTemplateEditorClient
      template={{ ...template, owner_department_name: departmentName }}
      version={currentVersion as any}
      versions={versions as any[]}
      sections={structure as any[]}
      canManage={canManage}
    />
    {currentVersion?.status === "DRAFT" && isFiveS ? <FiveSChecklistPreviewClient templateCode={template.source_code || template.code} sections={structure as any[]} /> : null}
    <ChecklistPublishClient
      templateId={template.id}
      versionId={currentVersion?.id ?? null}
      versionStatus={currentVersion?.status ?? null}
      itemCount={items.length}
      canManage={canManage}
    />
  </div>;
}
