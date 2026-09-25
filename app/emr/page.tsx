import { emrSupabase } from "@/lib/emr/supabase";
import KpiCard from "@/components/emr/KpiCard";
import DataTable from "@/components/emr/DataTable";
import type { FormRolloutSummary, KpiSummary, OpenIssuesSummary } from "@/lib/emr/types";

export const revalidate = 0; // luôn lấy dữ liệu mới nhất

export default async function EmrOverviewPage() {
  const supabase = emrSupabase();

  const [{ data: kpi }, { data: byGroup }, { data: openIssues }] = await Promise.all([
    supabase.from("emr_kpi_summary").select("*").maybeSingle(),
    supabase
      .from("emr_form_rollout_summary")
      .select("*")
      .order("form_group", { ascending: true }),
    supabase
      .from("emr_open_issues_summary")
      .select("*")
      .gt("open_issues", 0)
      .order("open_issues", { ascending: false })
      .limit(8),
  ]);

  const k = (kpi as KpiSummary | null) ?? {
    total_forms: 0,
    forms_started: 0,
    forms_completed: 0,
    forms_pending: 0,
    pct_started: 0,
    pct_completed: 0,
  };
  const groups = (byGroup as FormRolloutSummary[] | null) ?? [];
  const issues = (openIssues as OpenIssuesSummary[] | null) ?? [];

  // Gộp theo Nhóm biểu mẫu để có cái nhìn tổng quan như sheet "KPI EMR"
  const groupMap = new Map<string, { total: number; started: number; completed: number }>();
  for (const g of groups) {
    const key = g.form_group ?? "Chưa phân nhóm";
    const cur = groupMap.get(key) ?? { total: 0, started: 0, completed: 0 };
    cur.total += 1;
    if (g.overall_status === "Đang triển khai" || g.overall_status === "Đã hoàn thành") cur.started += 1;
    if (g.overall_status === "Đã hoàn thành") cur.completed += 1;
    groupMap.set(key, cur);
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Tổng số biểu mẫu" value={k.total_forms} />
        <KpiCard
          label="Đã triển khai"
          value={k.forms_started}
          sub={k.pct_started != null ? `${k.pct_started}%` : undefined}
        />
        <KpiCard
          label="Đã thực hiện EMR"
          value={k.forms_completed}
          sub={k.pct_completed != null ? `${k.pct_completed}%` : undefined}
          accent
        />
        <KpiCard label="Chờ triển khai" value={k.forms_pending} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Theo nhóm biểu mẫu</h2>
        <DataTable
          rows={Array.from(groupMap.entries())}
          rowKey={([name]) => name}
          emptyLabel="Chưa có biểu mẫu nào — thêm ở bảng emr_forms hoặc qua trang Nhập liệu."
          columns={[
            { header: "Nhóm", cell: ([name]) => name },
            { header: "Tổng số", cell: ([, v]) => v.total },
            { header: "Đã triển khai", cell: ([, v]) => v.started },
            { header: "Đã thực hiện EMR", cell: ([, v]) => v.completed },
            {
              header: "Tỷ lệ hoàn thành",
              cell: ([, v]) => `${v.total ? Math.round((v.completed / v.total) * 100) : 0}%`,
            },
          ]}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          Biểu mẫu còn góp ý/lỗi chưa xử lý xong
        </h2>
        <DataTable
          rows={issues}
          rowKey={(r) => r.form_id}
          emptyLabel="Không có biểu mẫu nào còn góp ý/lỗi mở."
          columns={[
            { header: "Biểu mẫu", cell: (r) => r.form_name },
            {
              header: "Đang mở",
              cell: (r) => (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  {r.open_issues} góp ý đang mở
                </span>
              ),
            },
            { header: "Tổng số góp ý", cell: (r) => r.total_issues },
          ]}
        />
      </section>
    </div>
  );
}
