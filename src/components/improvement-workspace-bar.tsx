import { WorkspaceFlowBar, type FlowChip, type FlowTab } from "@/components/workspace-flow-bar";
import { isProjectDelayed, PROJECT_CLOSED, projectOverdueActions, projectOverdueMilestones } from "@/lib/improvement-project-signals";
import { isOperationallyHiddenStatus } from "@/lib/operational-record";
import { createClient } from "@/lib/supabase/server";

// CẢI TIẾN CHẤT LƯỢNG — cùng khuôn Kho hóa chất / các nhóm QLCL khác: tab theo luồng việc + thanh "Cần xử lý".
//   Đề xuất cải tiến → Tất cả đề án → Đang triển khai → Đã đánh giá/đóng → Phân tích.
// Hai trang /improvement/proposals và /improvement/projects dùng chung quyền projects.view/propose/manage.
// "Đề án cần can thiệp" dùng chung improvement-project-signals với trang Danh mục đề án nên không lệch số.

export type ImprovementTab = "proposals" | "all" | "active" | "closed" | "analytics";
export const PROJECT_ACTIVE = new Set(["IN_PROGRESS", "APPROVED", "PENDING_APPROVAL"]);

export async function ImprovementWorkspaceBar({ active, year }: { active: ImprovementTab; year: number }) {
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const recordsRes = await supabase.from("records").select("id,record_type,lifecycle_status").in("record_type", ["IMPROVEMENT_PROJECT", "IMPROVEMENT_PROPOSAL"]).eq("work_year", year);
  const records = ((recordsRes.data ?? []) as any[]).filter((r) => !isOperationallyHiddenStatus(r.lifecycle_status));
  const projectRecordIds = records.filter((r) => r.record_type === "IMPROVEMENT_PROJECT").map((r) => r.id);
  const proposals = records.filter((r) => r.record_type === "IMPROVEMENT_PROPOSAL").length;
  const projectsRes = projectRecordIds.length ? await supabase.from("improvement_projects").select("id,record_id,workflow_status,target_end_date").in("record_id", projectRecordIds) : { data: [] as any[] };
  const projects = (projectsRes.data ?? []) as any[];
  const projectIds = projects.map((p) => p.id);
  const [linksRes, msRes] = await Promise.all([
    projectRecordIds.length ? supabase.from("record_links").select("source_record_id,target_record_id").in("source_record_id", projectRecordIds).eq("relation_type", "HAS_ACTION") : Promise.resolve({ data: [] as any[] }),
    projectIds.length ? supabase.from("project_milestones").select("project_id,status,due_date,planned_end_date").in("project_id", projectIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const links = (linksRes.data ?? []) as any[];
  const actionIds = Array.from(new Set(links.map((l) => l.target_record_id).filter(Boolean)));
  const actionsRes = actionIds.length ? await supabase.from("actions").select("record_id,workflow_status,due_date").in("record_id", actionIds) : { data: [] as any[] };
  const actionByRecord = new Map(((actionsRes.data ?? []) as any[]).map((a) => [a.record_id, a]));
  const st = (x: any) => String(x.workflow_status ?? "").toUpperCase();
  const delayed = projects.filter((p) => {
    const acts = links.filter((l) => l.source_record_id === p.record_id).map((l) => actionByRecord.get(l.target_record_id)).filter(Boolean) as any[];
    const ms = ((msRes.data ?? []) as any[]).filter((m) => m.project_id === p.id);
    return isProjectDelayed({ overdueActions: projectOverdueActions(acts, today), overdueMilestones: projectOverdueMilestones(ms, today), target_end_date: p.target_end_date, workflow_status: p.workflow_status }, today);
  }).length;
  const pending = projects.filter((p) => st(p) === "PENDING_APPROVAL").length;

  const chips: FlowChip[] = [
    { n: delayed, tone: "danger", text: `${delayed} đề án cần can thiệp (Action/mốc/đề án quá hạn)`, href: "/improvement/projects?status=attention" },
    { n: pending, tone: "warning", text: `${pending} đề án chờ phê duyệt`, href: "/improvement/projects?status=pending" },
  ];
  const tabs: FlowTab[] = [
    { key: "proposals", label: "Đề xuất cải tiến", href: "/improvement/proposals", count: proposals },
    { key: "all", label: "Tất cả đề án", href: "/improvement/projects", count: projects.length },
    { key: "active", label: "Đang triển khai", href: "/improvement/projects?status=active", count: projects.filter((p) => PROJECT_ACTIVE.has(st(p))).length },
    { key: "closed", label: "Đã đánh giá / đóng", href: "/improvement/projects?status=closed", count: projects.filter((p) => PROJECT_CLOSED.has(st(p))).length },
    { key: "analytics", label: "Phân tích", href: "/improvement/projects?tab=analytics", count: null },
  ];
  return <WorkspaceFlowBar ariaLabel="Luồng việc Cải tiến chất lượng" tabs={tabs} active={active} chips={chips} emptyText="Không có đề án nào cần can thiệp hay chờ phê duyệt." />;
}
