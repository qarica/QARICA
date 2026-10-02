import { PageHeader } from "@/components/page-header";
import { EmrWorkspaceNav } from "@/components/emr-workspace-nav";
import { EmrTimelineMilestonesClient } from "@/components/emr-timeline-milestones-client";
import { TQM_CHART_CSS } from "@/components/tqm-charts";
import { hasPermission, requirePermission, requireUserContext } from "@/lib/auth";
import { getWorkYear } from "@/lib/work-year";

export default async function EmrTimelinePage() {
  const { user } = await requireUserContext();
  requirePermission(user, "emr.view");
  const canManage = hasPermission(user, "emr.manage");
  const year = await getWorkYear();

  return (
    <div className="page-stack">
      <style>{TQM_CHART_CSS}</style>
      <PageHeader eyebrow="TRIỂN KHAI EMR" title="Timeline & Gantt" description="Khai báo đầu việc lớn và đầu việc con cho dự án." icon="chart-spline" />
      <EmrWorkspaceNav />
      <EmrTimelineMilestonesClient canManage={canManage} year={year} />
    </div>
  );
}
