import { PageHeader } from "@/components/page-header";
import { EmrWorkspaceNav } from "@/components/emr-workspace-nav";
import { TQM_CHART_CSS, TqmGantt } from "@/components/tqm-charts";
import { EMR_CATEGORIES } from "@/lib/emr-categories";
import { requirePermission, requireUserContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkYear } from "@/lib/work-year";

const STATUS_TONE: Record<string, "green" | "blue" | "red" | "slate"> = { DONE: "green", IN_PROGRESS: "blue", BLOCKED: "red", TODO: "slate" };
const STATUS_PROGRESS: Record<string, number> = { DONE: 100, IN_PROGRESS: 50, BLOCKED: 25, TODO: 0 };

export default async function EmrTimelinePage() {
  const { user } = await requireUserContext();
  requirePermission(user, "emr.view");
  const year = await getWorkYear();
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
  const organizationId = profile?.organization_id || null;

  const { data, error } = organizationId
    ? await admin.from("emr_rollout_items").select("id,category,title,status,due_date,created_at").eq("organization_id", organizationId).order("due_date", { ascending: true, nullsFirst: false })
    : { data: [] as any[], error: null };

  const categoryLabel = new Map(EMR_CATEGORIES.map((c) => [c.code, c.label]));
  const rows = (data ?? []).map((item: any) => ({
    label: `${categoryLabel.get(item.category) || item.category} · ${item.title}`,
    start: String(item.created_at).slice(0, 10),
    end: item.due_date,
    progress: STATUS_PROGRESS[item.status] ?? 0,
    tone: STATUS_TONE[item.status] ?? "slate",
  }));

  return (
    <div className="page-stack">
      <style>{TQM_CHART_CSS}</style>
      <PageHeader eyebrow="TRIỂN KHAI EMR" title="Timeline & Gantt" description="Mốc thời gian tạo (created_at) đến hạn xử lý (due_date) của từng hạng mục EMR, theo đúng dữ liệu hạng mục — không tạo mốc minh họa giả." icon="chart-spline" />
      <EmrWorkspaceNav />
      {error ? <div className="alert error">Không tải được dữ liệu: {error.message}</div> : null}
      <section className="panel">
        {rows.length ? <TqmGantt year={year} rows={rows} /> : <div className="empty-state">Chưa có hạng mục EMR nào để dựng timeline.</div>}
      </section>
    </div>
  );
}
