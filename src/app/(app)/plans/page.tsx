import { redirect } from "next/navigation";
import { Icon } from "@/components/icon";
import { CreateModalButton, CreateModalProvider } from "@/components/create-modal-signal";
import { PlansClient } from "@/components/plans-client";
import { PageHeader } from "@/components/page-header";
import { TQM_CHART_CSS, TqmDonut, TqmGantt } from "@/components/tqm-charts";
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

  const ganttRows = rows.filter((x)=>x.start_date&&x.end_date).sort((a,b)=>String(a.start_date).localeCompare(String(b.start_date))).map((x)=>({ label:x.title, start:x.start_date, end:x.end_date, progress:Math.round(x.progress_pct), tone:x.overdue_actions>0?"red" as const:x.progress_pct>=75?"green" as const:"blue" as const }));

  // Mỗi kế hoạch chỉ thuộc đúng 1 nhóm (ưu tiên Hoàn thành > Quá hạn > Đang triển khai > Chưa bắt đầu)
  // để tổng các nhóm luôn khớp tổng kế hoạch, thay vì đếm chồng lấn theo nhiều điều kiện.
  const completedCount = rows.filter((x) => x.workflow_status === "COMPLETED").length;
  const overdueCount = rows.filter((x) => x.workflow_status !== "COMPLETED" && x.overdue_actions > 0).length;
  const inProgressCount = rows.filter((x) => x.workflow_status !== "COMPLETED" && x.overdue_actions === 0 && ["APPROVED", "IN_PROGRESS"].includes(x.workflow_status)).length;
  const notStartedCount = rows.length - completedCount - overdueCount - inProgressCount;
  const donutValue = rows.length ? Math.round((completedCount / rows.length) * 100) : 0;

  const canManage = user.permissions.includes("plans.manage");
  return <CreateModalProvider><div className="page-stack plans-page tqm-workspace">
    <style>{TQM_CHART_CSS + `
      .tqm-workspace .tqm-overview-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .tqm-workspace .kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.tqm-workspace .kpi-card{background:#fff;border:1px solid #e5eaf2;border-radius:14px;padding:16px;box-shadow:0 1px 2px rgba(15,23,42,.03);display:flex;gap:12px;align-items:flex-start}.tqm-workspace .kpi-icon{flex:0 0 auto;width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center}.tqm-workspace .kpi-icon.blue{background:#dbeafe;color:#2563eb}.tqm-workspace .kpi-icon.green{background:#dcfce7;color:#16a34a}.tqm-workspace .kpi-icon.red{background:#fee2e2;color:#dc2626}.tqm-workspace .kpi-body{min-width:0}.tqm-workspace .kpi-title{font-size:12.5px;color:#475569;font-weight:600}.tqm-workspace .kpi-value{font-size:26px;font-weight:800;color:#0f172a;line-height:1.2;margin-top:2px}.tqm-workspace .kpi-note{font-size:11px;color:#8a97a3;margin-top:2px}
      .tqm-workspace .tqm-section-head{padding:17px 18px 6px}.tqm-workspace .tqm-section-head h2{margin:0;font-size:15px}.tqm-workspace .tqm-section-head p{margin:4px 0 0;color:#74838a;font-size:11px;line-height:1.45}.tqm-workspace .plans-detail-label{font-size:10px;font-weight:900;letter-spacing:.1em;color:#6c7d84;text-transform:uppercase;margin:4px 2px -4px}
      @media(max-width:1100px){.tqm-workspace .kpis{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:900px){.tqm-workspace .tqm-overview-grid{grid-template-columns:1fr}}
    `}</style>
    <PageHeader eyebrow={`ĐIỀU HÀNH QLCL · ${year}`} title="Kế hoạch & Điều hành" description="Theo dõi mức hoàn thành kế hoạch, tiến độ Action, các đầu việc quá hạn và lộ trình triển khai trong năm. Danh sách chi tiết chỉ là lớp drill-down phía dưới." icon="calendar-range" actions={canManage ? <CreateModalButton><Icon name="plus" size={18}/> Tạo kế hoạch mới</CreateModalButton> : null} />
    {firstError ? <div className="alert error">Không tải được dữ liệu kế hoạch: {firstError.message}</div> : null}

    <section className="kpis">
      <article className="kpi-card"><span className="kpi-icon blue"><Icon name="calendar-range" size={20}/></span><div className="kpi-body"><div className="kpi-title">Tổng kế hoạch</div><div className="kpi-value">{rows.length}</div><div className="kpi-note">Trong năm {year}</div></div></article>
      <article className="kpi-card"><span className="kpi-icon green"><Icon name="refresh-cw" size={20}/></span><div className="kpi-body"><div className="kpi-title">Đang triển khai</div><div className="kpi-value">{inProgressCount}</div><div className="kpi-note">{rows.length?Math.round(inProgressCount/rows.length*100):0}%</div></div></article>
      <article className="kpi-card"><span className="kpi-icon green"><Icon name="badge-check" size={20}/></span><div className="kpi-body"><div className="kpi-title">Hoàn thành</div><div className="kpi-value">{completedCount}</div><div className="kpi-note">{donutValue}%</div></div></article>
      <article className="kpi-card"><span className="kpi-icon red"><Icon name="triangle-alert" size={20}/></span><div className="kpi-body"><div className="kpi-title">Quá hạn</div><div className="kpi-value">{overdueCount}</div><div className="kpi-note">{rows.length?Math.round(overdueCount/rows.length*100):0}%</div></div></article>
    </section>

    <section className="tqm-overview-grid">
      <article className="panel"><div className="tqm-section-head"><h2>Tình trạng thực hiện kế hoạch</h2><p>Mỗi kế hoạch được xếp vào đúng 1 nhóm theo trạng thái và Action quá hạn.</p></div><TqmDonut value={donutValue} label="Hoàn thành" segments={[{label:"Hoàn thành",value:completedCount,tone:"green"},{label:"Đang triển khai",value:inProgressCount,tone:"blue"},{label:"Chưa bắt đầu",value:notStartedCount,tone:"slate"},{label:"Quá hạn",value:overdueCount,tone:"red"}]} /></article>
      <article className="panel"><div className="tqm-section-head"><h2>Tiến độ kế hoạch theo thời gian</h2><p>Mỗi dòng là một kế hoạch trong năm công tác; thời gian lấy trực tiếp từ ngày bắt đầu – kết thúc của kế hoạch.</p></div>{ganttRows.length?<TqmGantt year={year} rows={ganttRows}/>:<div className="empty-state">Chưa đủ ngày bắt đầu/kết thúc để dựng Gantt.</div>}</article>
    </section>

    <div className="plans-detail-label">CHI TIẾT KẾ HOẠCH & THAO TÁC NGHIỆP VỤ</div>
    <PlansClient year={year} canManage={canManage} rows={rows} departments={(departmentsRes.data ?? []) as any[]} profiles={(profilesRes.data ?? []) as any[]} referenceOptions={referenceOptions} />
  </div></CreateModalProvider>;
}
