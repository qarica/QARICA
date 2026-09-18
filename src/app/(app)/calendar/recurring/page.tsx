import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { RecurringWorkClient } from "@/components/recurring-work-client";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { QLCL_RECURRING_BLUEPRINTS } from "@/lib/qlcl-recurring-blueprints";
import { createClient } from "@/lib/supabase/server";

export default async function RecurringWorkPage() {
  const { user } = await requireUserContext();
  if (!hasAnyPermission(user, ["dashboard.view", "plans.view", "plans.manage"])) redirect("/dashboard?forbidden=1");

  const supabase = await createClient();
  const [templatesRes, departmentsRes, profilesRes, groupsRes, runsRes, checklistVersionsRes] = await Promise.all([
    supabase
      .from("recurring_work_templates")
      .select("id,title,description,recurrence_rule,start_date,end_date,due_offset_days,lead_department_id,assignment_target_type,assignee_user_id,assignee_group_id,expected_result,evidence_requirement,priority,is_active,source_code,source_label,source_criteria,automation_kind,automation_ref_id,automation_target_department_id,automation_target_area,automation_report_recipient,automation_report_method,automation_report_type,created_at,updated_at")
      .order("is_active", { ascending: false })
      .order("title"),
    supabase.from("departments").select("id,name,short_name,is_active").eq("is_active", true).order("name"),
    supabase.from("profiles").select("user_id,full_name,email,primary_department_id,is_active").eq("is_active", true).order("full_name", { ascending: true, nullsFirst: false }),
    supabase.from("work_groups").select("id,code,name,lead_department_id,leader_user_id,is_active").eq("is_active", true).order("name"),
    supabase.from("recurring_work_runs").select("id,template_id,planned_date,generated_action_id,generated_output_record_id,status").order("planned_date", { ascending: false }).limit(1000),
    supabase.from("checklist_versions").select("id,checklist_template_id,version_no,status").eq("status","PUBLISHED").order("published_at",{ascending:false}),
  ]);

  const firstError = [templatesRes, departmentsRes, profilesRes, groupsRes, runsRes, checklistVersionsRes].find((result) => result.error)?.error;
  const departmentMap = new Map((departmentsRes.data ?? []).map((row: any) => [row.id, row.name]));
  const profileMap = new Map((profilesRes.data ?? []).map((row: any) => [row.user_id, row.full_name || row.email || row.user_id]));
  const groupMap = new Map((groupsRes.data ?? []).map((row: any) => [row.id, [row.code, row.name].filter(Boolean).join(" · ")]));
  const checklistTemplateIds = Array.from(new Set((checklistVersionsRes.data ?? []).map((row: any) => row.checklist_template_id)));
  const checklistTemplatesRes = checklistTemplateIds.length
    ? await supabase.from("checklist_templates").select("id,code,source_code,name,short_name,is_active,organization_id").in("id", checklistTemplateIds).eq("is_active", true)
    : { data: [] as any[], error: null };
  const checklistTemplateMap = new Map((checklistTemplatesRes.data ?? []).map((row: any) => [row.id, row]));
  const checklists = (checklistVersionsRes.data ?? []).map((row: any) => {
    const template = checklistTemplateMap.get(row.checklist_template_id) as any;
    return template ? { id: row.id, code: template.code || "", source_code: template.source_code || "", label: `${template.code ? template.code + " · " : ""}${template.short_name || template.name}${template.source_code ? ` · Nguồn ${template.source_code}` : ""} · v${row.version_no}` } : null;
  }).filter(Boolean) as { id: string; code: string; source_code: string; label: string }[];

  const normalize = (value: unknown) => String(value ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").trim();
  const departments = (departmentsRes.data ?? []) as any[];
  const profiles = (profilesRes.data ?? []) as any[];
  const sourceCodeSet = new Set((templatesRes.data ?? []).map((row: any) => String(row.source_code || "")).filter(Boolean));
  const blueprints = QLCL_RECURRING_BLUEPRINTS.map((blueprint) => {
    const hint = normalize(blueprint.departmentHint);
    const department = departments.find((row: any) => {
      const name = normalize(row.name);
      const short = normalize(row.short_name);
      return name === hint || short === hint || name.includes(hint) || hint.includes(name);
    }) || null;
    const deptProfiles = department ? profiles.filter((row: any) => row.primary_department_id === department.id) : [];
    const assignee = deptProfiles.length === 1 ? deptProfiles[0] : null;
    const checklist = blueprint.automationChecklistCode ? checklists.find((row) => row.code === blueprint.automationChecklistCode || row.source_code === blueprint.automationChecklistCode) || null : null;
    return {
      ...blueprint,
      department_id: department?.id || null,
      department_name: department?.short_name || department?.name || null,
      assignee_user_id: assignee?.user_id || null,
      assignee_name: assignee?.full_name || assignee?.email || null,
      checklist_id: checklist?.id || null,
      checklist_label: checklist?.label || null,
      already_configured: sourceCodeSet.has(blueprint.code),
    };
  });
  const runsByTemplate = new Map<string, any[]>();
  for (const run of runsRes.data ?? []) {
    const key = (run as any).template_id;
    runsByTemplate.set(key, [...(runsByTemplate.get(key) ?? []), run]);
  }

  const rows = (templatesRes.data ?? []).map((template: any) => {
    const runs = runsByTemplate.get(template.id) ?? [];
    return {
      ...template,
      department_name: template.lead_department_id ? departmentMap.get(template.lead_department_id) || null : null,
      assignee_name: template.assignment_target_type === "GROUP"
        ? (template.assignee_group_id ? groupMap.get(template.assignee_group_id) || null : null)
        : (template.assignee_user_id ? profileMap.get(template.assignee_user_id) || null : null),
      generated_count: runs.filter((run: any) => !!run.generated_action_id).length,
      pending_count: runs.filter((run: any) => !run.generated_action_id && String(run.status || "").toUpperCase() === "PENDING").length,
      latest_planned_date: runs[0]?.planned_date || null,
    };
  });

  return <div className="page-stack" style={{ maxWidth: 1360, margin: "0 auto" }}>
    <PageHeader
      eyebrow="LỊCH CÔNG TÁC QLCL · ENGINE ĐỊNH KỲ"
      title="Công việc định kỳ"
      description="Định nghĩa một lần các công việc lặp ngày/tuần/tháng/quý/năm; hệ thống sinh Action thật theo kỳ, gắn người phụ trách, hạn và minh chứng mà không tạo trùng."
      actions={<Link className="button secondary" href="/calendar">← Lịch công tác QLCL</Link>}
    />

    <div className="scope-note">
      <strong>Nguyên tắc vận hành:</strong> Engine chỉ sinh công việc từ ngày hiện tại trở đi. Nội dung trong Kế hoạch QLCL chỉ được chuyển thành template khi đã xác định được lịch vận hành cụ thể, khoa/phòng và người chịu trách nhiệm; không tự dựng lịch sử hoặc tự chọn ngày cho yêu cầu nguồn còn mơ hồ.
    </div>

    {firstError ? <div className="alert error">Không tải được đầy đủ dữ liệu công việc định kỳ: {firstError.message}</div> : null}

    <RecurringWorkClient
      templates={rows as any[]}
      departments={(departmentsRes.data ?? []) as any[]}
      profiles={(profilesRes.data ?? []) as any[]}
      groups={(groupsRes.data ?? []) as any[]}
      canManage={user.permissions.includes("plans.manage")}
      blueprints={blueprints as any[]}
      checklists={checklists}
    />
  </div>;
}
