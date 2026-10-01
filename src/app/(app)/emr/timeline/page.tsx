import { PageHeader } from "@/components/page-header";
import { EmrWorkspaceNav } from "@/components/emr-workspace-nav";
import { TQM_CHART_CSS, TqmGantt } from "@/components/tqm-charts";
import { EMR_CATEGORIES } from "@/lib/emr-categories";
import { requirePermission, requireUserContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkYear } from "@/lib/work-year";

export default async function EmrTimelinePage() {
  const { user } = await requireUserContext();
  requirePermission(user, "emr.view");
  const year = await getWorkYear();
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
  const organizationId = profile?.organization_id || null;

  const { data, error } = organizationId
    ? await admin.from("emr_rollout_items").select("id,category,status,due_date,created_at").eq("organization_id", organizationId)
    : { data: [] as any[], error: null };

  const items = data ?? [];
  // Mỗi hạng mục EMR là một "đầu mục" trong danh sách công việc dự án thật
  // (xem ví dụ TKB dự án: I. Kế hoạch chung, II. Chi tiết triển khai -> A.
  // Hạ tầng, B. Thiết bị y tế, D. Chữ ký số, E. Đào tạo, F. Biểu mẫu...) —
  // không phải từng biểu mẫu/hạng mục lẻ. Gộp theo EMR_CATEGORIES (cấu trúc
  // nghiệp vụ chung, không hard-code theo 1 bệnh viện) thành các đầu mục lớn
  // thay vì một dòng Gantt cho mỗi item.
  const rows = EMR_CATEGORIES.map((c) => {
    const group = items.filter((x: any) => x.category === c.code);
    if (!group.length) return { label: c.label, start: null, end: null, progress: 0, tone: "slate" as const, count: 0 };
    const starts = group.map((x: any) => String(x.created_at).slice(0, 10)).sort();
    const dueDates = group.map((x: any) => x.due_date).filter(Boolean).sort();
    const done = group.filter((x: any) => x.status === "DONE").length;
    const blocked = group.some((x: any) => x.status === "BLOCKED");
    const progress = Math.round((done / group.length) * 100);
    const tone = blocked ? "red" as const : progress === 100 ? "green" as const : progress > 0 ? "blue" as const : "slate" as const;
    return { label: `${c.label} (${group.length})`, start: starts[0] || null, end: dueDates[dueDates.length - 1] || null, progress, tone, count: group.length };
  }).filter((r) => r.count > 0);

  return (
    <div className="page-stack">
      <style>{TQM_CHART_CSS}</style>
      <PageHeader eyebrow="TRIỂN KHAI EMR" title="Timeline & Gantt" description="Đầu mục lớn theo từng nhóm EMR (Quy trình, Biểu mẫu, Đào tạo, Chữ ký số...), tiến độ = số hạng mục hoàn tất / tổng — không liệt kê từng biểu mẫu riêng lẻ." icon="chart-spline" />
      <EmrWorkspaceNav />
      {error ? <div className="alert error">Không tải được dữ liệu: {error.message}</div> : null}
      <section className="panel">
        {rows.length ? <TqmGantt year={year} rows={rows} /> : <div className="empty-state">Chưa có hạng mục EMR nào để dựng timeline.</div>}
      </section>
    </div>
  );
}
