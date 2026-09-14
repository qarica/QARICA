import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { RecurringWorkClient } from "@/components/recurring-work-client";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function RecurringWorkPage() {
  const { user } = await requireUserContext();
  if (!hasAnyPermission(user, ["dashboard.view", "plans.view", "plans.manage"])) redirect("/dashboard?forbidden=1");

  const supabase = await createClient();
  const [templatesRes, departmentsRes, profilesRes, runsRes] = await Promise.all([
    supabase
      .from("recurring_work_templates")
      .select("id,title,description,recurrence_rule,start_date,end_date,due_offset_days,lead_department_id,assignee_user_id,expected_result,evidence_requirement,priority,is_active,created_at,updated_at")
      .order("is_active", { ascending: false })
      .order("title"),
    supabase.from("departments").select("id,name,short_name,is_active").eq("is_active", true).order("name"),
    supabase.from("profiles").select("user_id,full_name,email,primary_department_id,is_active").eq("is_active", true).order("full_name", { ascending: true, nullsFirst: false }),
    supabase.from("recurring_work_runs").select("id,template_id,planned_date,generated_action_id,status").order("planned_date", { ascending: false }).limit(1000),
  ]);

  const firstError = [templatesRes, departmentsRes, profilesRes, runsRes].find((result) => result.error)?.error;
  const departmentMap = new Map((departmentsRes.data ?? []).map((row: any) => [row.id, row.name]));
  const profileMap = new Map((profilesRes.data ?? []).map((row: any) => [row.user_id, row.full_name || row.email || row.user_id]));
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
      assignee_name: template.assignee_user_id ? profileMap.get(template.assignee_user_id) || null : null,
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
      canManage={user.permissions.includes("plans.manage")}
    />
  </div>;
}
