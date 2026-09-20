import { redirect } from "next/navigation";
import { PlansClient } from "@/components/plans-client";
import { PageHeader } from "@/components/page-header";
import { TQM_CHART_CSS, TqmDonut, TqmGantt, TqmHorizontalBars } from "@/components/tqm-charts";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { isOperationallyHiddenStatus } from "@/lib/operational-record";
import { loadPlanReferenceOptions } from "@/lib/plan-reference-options";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";

export default async function PlansPage() {
  const { user } = await requireUserContext();
  if (!hasAnyPermission(user, ["plans.view", "plans.manage"])) redirect("/dashboard?forbidden=1");

  const year = await getWorkYear();
  const supabase = await createClient();
  const [programsRes, recordsRes, progressRes, departmentsRes, profilesRes, referenceOptions] = await Promise.all([
    supabase.from("work_programs").select("id,record_id,program_type,description,objective,start_date,end_date,lead_department_id,owner_user_id,workflow_status,created_at,updated_at").order("created_at", { ascending: false }),
    supabase.from("records").select("id,record_code,title,work_year,lifecycle_status,owner_department_id,owner_user_id").eq("record_type", "PROGRAM").eq("work_year", year).order("created_at", { ascending: false }),
    supabase.from("vw_program_progress").select("program_id,record_id,record_code,title,work_year,required_actions,completed_actions,progress_pct,overdue_actions").eq("work_year", year),
    supabase.from("departments").select("id,name,short_name,is_active").eq("is_active", true).order("name"),
    supabase.from("profiles").select("user_id,full_name,email,primary_department_id,is_active").eq("is_active", true).order("full_name", { ascending: true, nullsFirst: false }),
    user.organizationId ? loadPlanReferenceOptions(user.organizationId) : Promise.resolve([]),
  ]);

  const firstError = [programsRes, recordsRes, progressRes, departmentsRes, profilesRes].find((r) => r.error)?.error;
  const recordMap = new Map((recordsRes.data ?? []).filter((r: any) => !isOperationallyHiddenStatus(r.lifecycle_status)).map((r: any) => [r.id, r]));
  const progressMap = new Map((progressRes.data ?? []).map((r: any) => [r.program_id, r]));

  const rows = (programsRes.data ?? []).map((program: any) => {
    const record = recordMap.get(program.record_id) as any;
    if (!record || program.workflow_status === "CANCELLED" || program.workflow_status === "ARCHIVED") return null;
    const progress = progressMap.get(program.id) as any;
    return {
      ...program,
      record_code: record.record_code,
      title: record.title,
      work_year: record.work_year,
      lifecycle_status: record.lifecycle_status,
      required_actions: Number(progress?.required_actions ?? 0),
      completed_actions: Number(progress?.completed_actions ?? 0),
      progress_pct: Number(progress?.progress_pct ?? 0),
      overdue_actions: Number(progress?.overdue_actions ?? 0),
    };
  }).filter(Boolean) as any[];

  const totalRequired = rows.reduce((s, x) => s + x.required_actions, 0);
  const totalCompleted = rows.reduce((s, x) => s + x.completed_actions, 0);
  const totalOverdue = rows.reduce((s, x) => s + x.overdue_actions, 0);
  const remaining = Math.max(0, totalRequired - totalCompleted);
  const annualProgress = totalRequired > 0 ? Math.round(totalCompleted / totalRequired * 100) : (rows.length ? Math.round(rows.reduce((s, x) => s + x.progress_pct, 0) / rows.length) : 0);
  const onTrack = rows.filter((x) => x.progress_pct >= 75 && x.overdue_actions === 0).length;
  const needAttention = rows.filter((x) => x.overdue_actions > 0 || x.progress_pct < 50).length;
  const barRows = [...rows].sort((a,b)=>b.progress_pct-a.progress_pct).slice(0,10).map((x) => ({ label:x.title, value:Math.round(x.progress_pct), tone:x.overdue_actions>0?"red" as const:x.progress_pct>=75?"green" as const:"blue" as const, caption:x.record_code }));
  const ganttRows = rows.filter((x)=>x.start_date&&x.end_date).sort((a,b)=>String(a.start_date).localeCompare(String(b.start_date))).map((x)=>({ label:x.title, start:x.start_date, end:x.end_date, progress:Math.round(x.progress_pct), tone:x.overdue_actions>0?"red" as const:x.progress_pct>=75?"green" as const:"blue" as const }));

  return <div className="page-stack plans-page tqm-workspace">
    <style>{TQM_CHART_CSS + `
      .tqm-workspace .tqm-overview-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.tqm-workspace .tqm-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.tqm-workspace .tqm-kpi{background:#fff;border:1px solid #e1e9ec;border-radius:17px;padding:16px 17px;box-shadow:0 7px 24px rgba(18,45,55,.04)}.tqm-workspace .tqm-kpi span{font-size:10px;color:#718187;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.tqm-workspace .tqm-kpi strong{display:block;font-size:30px;margin-top:8px;color:#183039}.tqm-workspace .tqm-kpi small{display:block;margin-top:6px;color:#7d8c92;font-size:10px}.tqm-workspace .tqm-kpi.warning strong{color:#b86f1a}.tqm-workspace .tqm-kpi.danger strong{color:#c84350}.tqm-workspace .tqm-section-head{padding:17px 18px 6px}.tqm-workspace .tqm-section-head h2{margin:0;font-size:15px}.tqm-workspace .tqm-section-head p{margin:4px 0 0;color:#74838a;font-size:11px;line-height:1.45}.tqm-workspace .plans-detail-label{font-size:10px;font-weight:900;letter-spacing:.1em;color:#6c7d84;text-transform:uppercase;margin:4px 2px -4px}
      @media(max-width:900px){.tqm-workspace .tqm-overview-grid{grid-template-columns:1fr}.tqm-workspace .tqm-kpis{grid-template-columns:1fr 1fr}}
      @media(max-width:520px){.tqm-workspace .tqm-kpis{grid-template-columns:1fr 1fr}.tqm-workspace .tqm-kpi{padding:13px}.tqm-workspace .tqm-kpi strong{font-size:25px}}
    `}</style>
    <PageHeader eyebrow={`ĐIỀU HÀNH QLCL · ${year}`} title="Kế hoạch chất lượng năm" description="Theo dõi mức hoàn thành kế hoạch, tiến độ Action, các đầu việc quá hạn và lộ trình triển khai trong năm. Danh sách chi tiết chỉ là lớp drill-down phía dưới." />
    {firstError ? <div className="alert error">Không tải được dữ liệu kế hoạch: {firstError.message}</div> : null}

    <section className="tqm-kpis">
      <article className="tqm-kpi"><span>Hoàn thành kế hoạch năm</span><strong>{annualProgress}%</strong><small>{totalCompleted}/{totalRequired || 0} Action đã hoàn thành</small></article>
      <article className="tqm-kpi"><span>Kế hoạch đúng tiến độ</span><strong>{onTrack}/{rows.length}</strong><small>Tiến độ ≥ 75% và không có Action quá hạn</small></article>
      <article className="tqm-kpi warning"><span>Cần can thiệp</span><strong>{needAttention}</strong><small>Kế hoạch chậm hoặc đang có Action quá hạn</small></article>
      <article className="tqm-kpi danger"><span>Action quá hạn</span><strong>{totalOverdue}</strong><small>{remaining} Action còn chưa hoàn thành</small></article>
    </section>

    <section className="tqm-overview-grid">
      <article className="panel"><div className="tqm-section-head"><h2>Tiến độ thực hiện kế hoạch năm</h2><p>Tỷ lệ được tính từ Action thực tế liên kết với kế hoạch, không phải số nhập tay.</p></div><TqmDonut value={annualProgress} label="Đã hoàn thành" segments={[{label:"Đã hoàn thành",value:totalCompleted,tone:"brand"},{label:"Còn lại",value:remaining,tone:"blue"},{label:"Quá hạn",value:totalOverdue,tone:"red"}]} /></article>
      <article className="panel"><div className="tqm-section-head"><h2>Tiến độ theo từng kế hoạch</h2><p>Nhìn nhanh kế hoạch nào đang chạy tốt và kế hoạch nào cần QLCL can thiệp.</p></div><TqmHorizontalBars rows={barRows} max={100}/></article>
    </section>

    <section className="panel"><div className="tqm-section-head"><h2>Gantt kế hoạch</h2><p>Mỗi dòng là một kế hoạch trong năm công tác; thời gian lấy trực tiếp từ ngày bắt đầu – kết thúc của kế hoạch.</p></div>{ganttRows.length?<TqmGantt year={year} rows={ganttRows}/>:<div className="empty-state">Chưa đủ ngày bắt đầu/kết thúc để dựng Gantt.</div>}</section>

    <div className="plans-detail-label">CHI TIẾT KẾ HOẠCH & THAO TÁC NGHIỆP VỤ</div>
    <PlansClient year={year} canManage={user.permissions.includes("plans.manage")} rows={rows} departments={(departmentsRes.data ?? []) as any[]} profiles={(profilesRes.data ?? []) as any[]} referenceOptions={referenceOptions} />
  </div>;
}
