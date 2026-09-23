import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";

type GanttRow = {
  id: string;
  kind: "PLAN" | "ACTION";
  code: string;
  title: string;
  start: string;
  end: string;
  status: string;
  href: string;
  departmentId?: string | null;
  singleDate: boolean;
};

const MONTHS = ["T1","T2","T3","T4","T5","T6","T7","T8","T9","T10","T11","T12","T1","T2","T3"];

function dateKey(value: string) {
  const [y,m,d]=value.split("-").map(Number);
  return Date.UTC(y,m-1,d);
}

function clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,value));}

function segment(start:string,end:string,cycleStart:string,cycleEnd:string){
  const first=dateKey(cycleStart);
  const last=dateKey(cycleEnd);
  const total=Math.max(1,Math.round((last-first)/86400000)+1);
  const a=clamp(Math.round((dateKey(start)-first)/86400000),0,total-1);
  const b=clamp(Math.round((dateKey(end)-first)/86400000),0,total-1);
  const left=(Math.min(a,b)/total)*100;
  const width=(Math.max(1,Math.abs(b-a)+1)/total)*100;
  return {left,width};
}

export default async function QualityGanttPage(){
  const {user}=await requireUserContext();
  if(!hasAnyPermission(user,["dashboard.view","tasks.view","plans.view","plans.manage"])) redirect("/dashboard?forbidden=1");

  const workYear=await getWorkYear();
  const cycleStart=`${workYear}-01-01`;
  const cycleEnd=`${workYear+1}-03-31`;
  const supabase=await createClient();

  const [programsRes,actionsRes]=await Promise.all([
    supabase.from("work_programs")
      .select("id,record_id,start_date,end_date,workflow_status,lead_department_id")
      .or(`start_date.lte.${cycleEnd},end_date.lte.${cycleEnd}`),
    supabase.from("vw_actions_dashboard")
      .select("action_id,record_id,record_code,title,work_year,workflow_status,start_date,due_date,lead_department_id")
      .eq("work_year",workYear)
      .or(`start_date.not.is.null,due_date.not.is.null`),
  ]);

  const programRecordIds=Array.from(new Set((programsRes.data??[]).map((row:any)=>row.record_id).filter(Boolean))) as string[];
  const recordsRes=programRecordIds.length
    ? await supabase.from("records").select("id,record_code,title,lifecycle_status").in("id",programRecordIds)
    : {data:[],error:null} as any;
  const recordMap=new Map((recordsRes.data??[]).map((row:any)=>[String(row.id),row]));

  const rows:GanttRow[]=[];
  for(const program of (programsRes.data??[]) as any[]){
    const record:any=recordMap.get(String(program.record_id));
    if(!record||record.lifecycle_status==="ARCHIVED"||program.workflow_status==="CANCELLED") continue;
    const actualStart=program.start_date||program.end_date;
    const actualEnd=program.end_date||program.start_date;
    if(!actualStart||!actualEnd) continue;
    if(actualEnd<cycleStart||actualStart>cycleEnd) continue;
    rows.push({
      id:`plan:${program.id}`,kind:"PLAN",code:record.record_code,title:record.title,
      start:actualStart,end:actualEnd,status:program.workflow_status,href:`/plans/${program.id}`,
      departmentId:program.lead_department_id,singleDate:actualStart===actualEnd,
    });
  }

  for(const action of (actionsRes.data??[]) as any[]){
    if(["CANCELLED","NOT_APPLICABLE"].includes(String(action.workflow_status))) continue;
    const actualStart=action.start_date||action.due_date;
    const actualEnd=action.due_date||action.start_date;
    if(!actualStart||!actualEnd) continue;
    if(actualEnd<cycleStart||actualStart>cycleEnd) continue;
    rows.push({
      id:`action:${action.action_id}`,kind:"ACTION",code:action.record_code,title:action.title,
      start:actualStart,end:actualEnd,status:action.workflow_status,href:`/tasks/${action.record_id}`,
      departmentId:action.lead_department_id,singleDate:actualStart===actualEnd,
    });
  }

  const departmentIds=Array.from(new Set(rows.map(r=>r.departmentId).filter(Boolean))) as string[];
  const departmentsRes=departmentIds.length
    ? await supabase.from("departments").select("id,name,short_name").in("id",departmentIds)
    : {data:[],error:null} as any;
  const departmentMap=new Map<string,string>((departmentsRes.data??[]).map((row:any)=>[String(row.id),String(row.short_name||row.name)] as [string,string]));

  rows.sort((a,b)=>a.start.localeCompare(b.start)||a.kind.localeCompare(b.kind)||a.title.localeCompare(b.title,"vi"));
  const firstError=programsRes.error||actionsRes.error||recordsRes.error||departmentsRes.error;
  const planCount=rows.filter(r=>r.kind==="PLAN").length;
  const actionCount=rows.filter(r=>r.kind==="ACTION").length;

  const monthWidths=[31,28+(new Date(Date.UTC(workYear,1,29)).getUTCMonth()===1?1:0),31,30,31,30,31,31,30,31,30,31,31,28+(new Date(Date.UTC(workYear+1,1,29)).getUTCMonth()===1?1:0),31];
  const totalDays=monthWidths.reduce((a,b)=>a+b,0);

  return <div className="page-stack quality-gantt-page">
    <style>{`
      .quality-gantt-page{max-width:1600px;margin:0 auto;gap:14px!important}
      .gantt-shell{overflow:hidden;border:1px solid #dbe5ea;border-radius:14px;background:#fff}
      .gantt-scroll{overflow-x:auto}
      .gantt-grid{min-width:1100px}
      .gantt-head,.gantt-row{display:grid;grid-template-columns:340px minmax(720px,1fr)}
      .gantt-head{position:sticky;top:0;z-index:5;background:#f8fafc;border-bottom:1px solid #dbe5ea}
      .gantt-label-head{padding:11px 14px;font-size:10px;font-weight:900;color:#64748b}
      .gantt-months{display:flex;min-height:42px}
      .gantt-month{display:flex;align-items:center;justify-content:center;border-left:1px solid #e5eaee;font-size:9px;font-weight:800;color:#64748b}
      .gantt-row{border-bottom:1px solid #edf1f3;min-height:60px}.gantt-row:last-child{border-bottom:0}
      .gantt-label{padding:9px 12px;display:grid;gap:3px;align-content:center}
      .gantt-title{display:flex;align-items:center;gap:7px;min-width:0}.gantt-title a{font-size:11px;font-weight:800;color:#1e3a5f;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .gantt-kind{font-size:8px;font-weight:900;border-radius:999px;padding:3px 6px;background:#eef2ff;color:#4338ca;flex:none}.gantt-kind.action{background:#eff6ff;color:#1d4ed8}
      .gantt-meta{font-size:9px;color:#718087;display:flex;gap:8px;flex-wrap:wrap}
      .gantt-track{position:relative;background-image:linear-gradient(to right,#e9eef1 1px,transparent 1px);background-size:calc(100% / 15) 100%;min-height:60px}
      .gantt-bar{position:absolute;top:18px;height:24px;min-width:6px;border-radius:7px;background:#315f91;display:flex;align-items:center;padding:0 7px;color:#fff;font-size:8px;font-weight:800;overflow:hidden;white-space:nowrap}
      .gantt-bar.plan{background:#365f4b}.gantt-bar.done{opacity:.55}.gantt-bar.single{width:8px!important;padding:0;border-radius:999px}
      .gantt-empty{padding:24px;text-align:center;color:#64748b}
      @media(max-width:760px){.gantt-head,.gantt-row{grid-template-columns:280px minmax(720px,1fr)}.gantt-label{padding:8px}.gantt-title a{font-size:10px}}
    `}</style>

    <PageHeader
      eyebrow={`KẾ HOẠCH & ĐIỀU HÀNH · CHU KỲ ${workYear}`}
      title="Gantt tiến độ"
      description="Hiển thị trực tiếp Plan và Action có ngày thực tế trong hệ thống. Nếu hồ sơ chỉ có một mốc ngày, Gantt hiển thị milestone một ngày và không tự suy diễn ngày còn thiếu."
      actions={<Link className="button secondary" href="/calendar">← Lịch công tác</Link>}
    />

    {firstError?<div className="alert error">Một phần dữ liệu Gantt chưa tải được: {firstError.message}</div>:null}
    <section className="kpi-grid">
      <article className="kpi-card info"><span>Kế hoạch có mốc</span><strong>{planCount}</strong><small>Plan trong chu kỳ</small></article>
      <article className="kpi-card neutral"><span>Action có mốc</span><strong>{actionCount}</strong><small>Action năm công tác</small></article>
      <article className="kpi-card success"><span>Tổng dòng Gantt</span><strong>{rows.length}</strong><small>Không sinh dữ liệu giả</small></article>
      <article className="kpi-card warning"><span>Chu kỳ hiển thị</span><strong>{workYear}–{workYear+1}</strong><small>Đến hết tháng 03</small></article>
    </section>

    <section className="gantt-shell">
      <div className="gantt-scroll">
        <div className="gantt-grid">
          <div className="gantt-head">
            <div className="gantt-label-head">HỒ SƠ / CÔNG VIỆC</div>
            <div className="gantt-months">{MONTHS.map((m,i)=><div key={`${m}-${i}`} className="gantt-month" style={{width:`${monthWidths[i]/totalDays*100}%`}}>{m}</div>)}</div>
          </div>
          {rows.map(row=>{
            const pos=segment(row.start,row.end,cycleStart,cycleEnd);
            const done=["COMPLETED","CLOSED","FINALIZED","VERIFIED"].includes(row.status);
            return <div className="gantt-row" key={row.id}>
              <div className="gantt-label">
                <div className="gantt-title"><span className={`gantt-kind ${row.kind.toLowerCase()}`}>{row.kind}</span><Link href={row.href}>{row.title}</Link></div>
                <div className="gantt-meta"><span>{row.code}</span><span>{departmentMap.get(String(row.departmentId||""))||"Chưa gán đơn vị"}</span><span>{formatDate(row.start)}{row.end!==row.start?` → ${formatDate(row.end)}`:""}</span><StatusBadge status={row.status}/></div>
              </div>
              <div className="gantt-track">
                <Link href={row.href} className={`gantt-bar ${row.kind.toLowerCase()} ${done?"done":""} ${row.singleDate?"single":""}`} style={{left:`${pos.left}%`,width:`${pos.width}%`}} title={`${row.title} · ${formatDate(row.start)}${row.end!==row.start?` → ${formatDate(row.end)}`:""}`}>
                  {row.singleDate?"":row.title}
                </Link>
              </div>
            </div>;
          })}
          {!rows.length?<div className="gantt-empty">Chưa có Plan/Action có ngày thực tế trong chu kỳ này.</div>:null}
        </div>
      </div>
    </section>
  </div>;
}
