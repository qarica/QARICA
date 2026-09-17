import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { TQM_CHART_CSS, TqmDonut, TqmGantt, TqmHorizontalBars, TqmTrend } from "@/components/tqm-charts";
import { TqmSmartCommandCenter } from "@/components/tqm-smart-command-center";
import { TqmProcessMap } from "@/components/tqm-process-map";
import { TqmScorecard } from "@/components/tqm-scorecard";
import { TqmInterventionLoop } from "@/components/tqm-intervention-loop";
import { TqmPriorityBoard } from "@/components/tqm-priority-board";
import { requireUserContext } from "@/lib/auth";
import { buildIndicatorKpi, buildProjectActionKpi, isDueOnOrBeforeToday } from "@/lib/dashboard-kpi";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";

const CLOSED = new Set(["CANCELLED","ARCHIVED","INACTIVE","RETIRED"]);
function todayHcm(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}).format(new Date())}

export default async function DashboardPage(){
 await requireUserContext(); const year=await getWorkYear(); const supabase=await createClient(); const today=todayHcm();
 const [recordsRes,programProgressRes,departmentsRes,indicatorsRes,monitoringRes,projectsRes,findingsRes,capasRes,incidentsRes]=await Promise.all([
  supabase.from("records").select("id,record_type,record_code,title,work_year,lifecycle_status,owner_department_id,owner_user_id").eq("work_year",year),
  supabase.from("vw_program_progress").select("program_id,record_id,record_code,title,work_year,required_actions,completed_actions,progress_pct,overdue_actions").eq("work_year",year),
  supabase.from("departments").select("id,name,short_name").eq("is_active",true).order("name"),
  supabase.from("indicator_measurements").select("id,record_id,workflow_status,result_level,period_end"),
  supabase.from("monitoring_rounds").select("id,record_id,scheduled_date,target_department_id,workflow_status").eq("work_year",year).neq("workflow_status","CANCELLED"),
  supabase.from("improvement_projects").select("id,record_id,workflow_status,start_date,target_end_date,actual_end_date,problem_statement"),
  supabase.from("findings").select("id,record_id,workflow_status,due_date,severity"),
  supabase.from("capas").select("id,record_id,workflow_status,effectiveness_due_date,priority"),
  supabase.from("incidents").select("id,record_id,workflow_status,serious_event_flag,reported_at,harm_status")
 ]);
 const all=[recordsRes,programProgressRes,departmentsRes,indicatorsRes,monitoringRes,projectsRes,findingsRes,capasRes,incidentsRes]; const firstError=all.find((x:any)=>x.error)?.error;
 const records=((recordsRes.data??[]) as any[]).filter((r:any)=>!CLOSED.has(r.lifecycle_status)); const recordMap=new Map(records.map((r:any)=>[r.id,r])); const recordIds=new Set(records.map((r:any)=>r.id)); const depMap=new Map(((departmentsRes.data??[]) as any[]).map((d:any)=>[d.id,d.short_name||d.name]));

 const plans=((programProgressRes.data??[]) as any[]).filter((x:any)=>recordIds.has(x.record_id)); const planReq=plans.reduce((s:any,x:any)=>s+Number(x.required_actions||0),0); const planDone=plans.reduce((s:any,x:any)=>s+Number(x.completed_actions||0),0); const planOverdue=plans.reduce((s:any,x:any)=>s+Number(x.overdue_actions||0),0); const planPct=planReq?Math.round(planDone/planReq*100):(plans.length?Math.round(plans.reduce((s:any,x:any)=>s+Number(x.progress_pct||0),0)/plans.length):0);

 const indicators=((indicatorsRes.data??[]) as any[]).filter((x:any)=>recordIds.has(x.record_id)); const indicatorKpi=buildIndicatorKpi(indicators); const evaluableIndicators=indicatorKpi.evaluable; const inTarget=indicatorKpi.inTarget; const outTarget=indicatorKpi.outTarget; const indicatorPct=indicatorKpi.percentage; const indicatorTrend=indicatorKpi.trend;

 const monitoring=((monitoringRes.data??[]) as any[]).filter((x:any)=>recordIds.has(x.record_id)); const roundIds=monitoring.map((x:any)=>x.id); const responsesRes=roundIds.length?await supabase.from("checklist_responses").select("monitoring_round_id,result_status").in("monitoring_round_id",roundIds):{data:[] as any[],error:null}; const responseMap=new Map<string,{pass:number;fail:number}>(); for(const x of (responsesRes.data??[]) as any[]){const a=responseMap.get(x.monitoring_round_id)??{pass:0,fail:0};if(String(x.result_status).toUpperCase()==="PASS")a.pass++;if(String(x.result_status).toUpperCase()==="FAIL")a.fail++;responseMap.set(x.monitoring_round_id,a)}
 let monitorPass=0,monitorFail=0; const deptAgg=new Map<string,{pass:number;fail:number}>(); for(const r of monitoring){const a=responseMap.get(r.id)??{pass:0,fail:0};monitorPass+=a.pass;monitorFail+=a.fail;const key=r.target_department_id||"none";const d=deptAgg.get(key)??{pass:0,fail:0};d.pass+=a.pass;d.fail+=a.fail;deptAgg.set(key,d)} const monitoringPct=(monitorPass+monitorFail)?Math.round(monitorPass/(monitorPass+monitorFail)*100):0;
 const deptBars=Array.from(deptAgg.entries()).map(([id,a])=>{const n=a.pass+a.fail;const pct=n?Math.round(a.pass/n*100):0;return{label:String(depMap.get(id)||"Chưa xác định"),value:pct,tone:pct>=90?"green" as const:pct>=75?"blue" as const:pct>=60?"amber" as const:"red" as const,caption:`${n} mục đã chấm`}}).filter((x)=>x.caption!=="0 mục đã chấm").sort((a,b)=>a.value-b.value).slice(0,10);

 const projects=((projectsRes.data??[]) as any[]).filter((x:any)=>recordIds.has(x.record_id)); const projectRecordIds=projects.map((x:any)=>x.record_id); const linksRes=projectRecordIds.length?await supabase.from("record_links").select("source_record_id,target_record_id").in("source_record_id",projectRecordIds).eq("relation_type","HAS_ACTION"):{data:[] as any[],error:null}; const links=(linksRes.data??[]) as any[]; const actionIds=Array.from(new Set(links.map((x:any)=>x.target_record_id).filter(Boolean))); const projectActionsRes=actionIds.length?await supabase.from("actions").select("record_id,workflow_status,due_date").in("record_id",actionIds):{data:[] as any[],error:null}; const actionMap=new Map(((projectActionsRes.data??[]) as any[]).map((x:any)=>[x.record_id,x])); const projectActions=new Map<string,any[]>(); for(const l of links){const a=actionMap.get(l.target_record_id);if(!a)continue;const arr=projectActions.get(l.source_record_id)??[];arr.push(a);projectActions.set(l.source_record_id,arr)}
 const projectRows=projects.map((p:any)=>{const r:any=recordMap.get(p.record_id);const acts=(projectActions.get(p.record_id)??[]).filter((a:any)=>!["CANCELLED","NOT_APPLICABLE"].includes(String(a.workflow_status)));const done=acts.filter((a:any)=>a.workflow_status==="COMPLETED").length;const progress=acts.length?Math.round(done/acts.length*100):0;const overdue=acts.filter((a:any)=>a.workflow_status!=="COMPLETED"&&a.due_date&&a.due_date<today).length;return{...p,title:r?.title||"Đề án cải tiến",record_code:r?.record_code||"—",actions:acts.length,completed:done,progress,overdue}}); const projectKpi=buildProjectActionKpi(projectRows); const projectPct=projectKpi.percentage;
 const ganttRows=projectRows.filter((x:any)=>x.start_date&&x.target_end_date).slice(0,10).map((x:any)=>({label:x.title,start:x.start_date,end:x.target_end_date,progress:x.progress,tone:x.overdue?"red" as const:x.progress>=75?"green" as const:"blue" as const}));

 const findings=((findingsRes.data??[]) as any[]).filter((x:any)=>recordIds.has(x.record_id)&&!["CLOSED","CANCELLED"].includes(String(x.workflow_status))); const capas=((capasRes.data??[]) as any[]).filter((x:any)=>recordIds.has(x.record_id)&&!["CLOSED","CANCELLED","EFFECTIVE"].includes(String(x.workflow_status))); const incidents=((incidentsRes.data??[]) as any[]).filter((x:any)=>recordIds.has(x.record_id)&&!["CLOSED","CANCELLED"].includes(String(x.workflow_status))); const serious=incidents.filter((x:any)=>x.serious_event_flag).length; const overdueFindings=findings.filter((x:any)=>x.due_date&&x.due_date<today).length; const capaDue=capas.filter((x:any)=>String(x.workflow_status)==="EFFECTIVENESS_REVIEW"||isDueOnOrBeforeToday(x.effectiveness_due_date,today)).length; const activeProjects=projects.filter((x:any)=>!["COMPLETED","CLOSED","CANCELLED"].includes(String(x.workflow_status))).length;
 const hotspots=[
  {label:"Sự cố nghiêm trọng",value:serious,href:"/incidents",tone:"red" as const},
  {label:"Finding quá hạn",value:overdueFindings,href:"/findings",tone:"red" as const},
  {label:"CAPA đến hạn",value:capaDue,href:"/capa",tone:"amber" as const},
  {label:"Chỉ số ngoài mục tiêu",value:outTarget,href:"/indicators",tone:"amber" as const},
  {label:"Action kế hoạch quá hạn",value:planOverdue,href:"/plans",tone:"amber" as const},
 ];
 const priorityTotal=hotspots.reduce((sum,item)=>sum+item.value,0);
 const hasPrioritySignals=priorityTotal>0;
 const dailyKpis=[
  {label:"Sự cố đang mở",value:incidents.length,detail:`${serious} nghiêm trọng`,href:"/incidents",tone:serious?"danger":"neutral"},
  {label:"Sự cố nghiêm trọng",value:serious,detail:"Cần ưu tiên rà soát",href:"/incidents",tone:serious?"danger":"neutral"},
  {label:"Finding quá hạn",value:overdueFindings,detail:`${findings.length} finding đang mở`,href:"/findings",tone:overdueFindings?"danger":"neutral"},
  {label:"CAPA đến hạn",value:capaDue,detail:`${capas.length} CAPA đang theo dõi`,href:"/capa",tone:capaDue?"warning":"neutral"},
  {label:"Đề án đang triển khai",value:activeProjects,detail:`${projectKpi.completed}/${projectKpi.actions} action hoàn thành`,href:"/improvement",tone:"neutral"},
 ];

 return <div className="page-stack tqm-dashboard">
  <style>{TQM_CHART_CSS}</style>
  <PageHeader eyebrow={`QARICA · ĐIỀU HÀNH QLCL · ${year}`} title="Tổng quan chất lượng" description="Ưu tiên việc cần xử lý trước; số liệu phân tích và công cụ TQM chuyên sâu được đặt phía dưới." />
  {firstError?<div className="alert error">Một phần dữ liệu chưa tải được: {firstError.message}</div>:null}

  <section className="kpis" aria-label="Chỉ số điều hành hằng ngày">
   {dailyKpis.map((item)=><Link key={item.label} href={item.href} className={`kpi kpi-link ${item.tone}`}><span>{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small></Link>)}
  </section>

  <section className={`dashboard-priority ${hasPrioritySignals?"has-alert":"clear"}`}>
   <div className="priority-copy">
    <div className="eyebrow">VIỆC CẦN XỬ LÝ</div>
    <h2>{hasPrioritySignals?`${priorityTotal} tín hiệu cần ưu tiên`:`Chưa có tín hiệu ưu tiên cần xử lý ngay`}</h2>
    <p>{hasPrioritySignals?"Các tín hiệu được gom theo rủi ro vận hành. Chọn từng mục để đi thẳng tới danh sách xử lý.":"Tiếp tục theo dõi công việc được giao và các chỉ số điều hành."}</p>
    <div className="priority-actions"><Link className="button primary" href="/tasks">Mở Việc của tôi</Link><Link className="button secondary" href="/assistant">Hỏi Trợ lý QLCL</Link></div>
   </div>
   <div className="priority-items">
    {hotspots.map((item)=><Link key={item.label} href={item.href} className={`priority-item ${item.tone}`}><span>{item.label}</span><strong>{item.value}</strong></Link>)}
   </div>
  </section>

  <section className="dashboard-grid">
   <article className="panel"><div className="head"><h2>Xu hướng chỉ số đạt mục tiêu</h2><p>12 tháng gần nhất, chỉ tính kỳ VERIFIED/LOCKED đã có kết luận.</p></div><TqmTrend points={indicatorTrend}/></article>
   <article className="panel"><div className="head"><h2>Giám sát theo khoa/phòng</h2><p>Đơn vị có tỷ lệ đạt thấp được đưa lên trước để ưu tiên xem xét.</p></div>{deptBars.length?<TqmHorizontalBars rows={deptBars} max={100}/>:<div className="empty-state">Chưa có dữ liệu giám sát đủ để so sánh.</div>}</article>
  </section>

  <details className="deep-dive">
   <summary>Báo cáo và phân tích TQM chuyên sâu</summary>
   <div className="deep-dive-body">
    <p className="deep-dive-note">Khu vực này phục vụ phân tích, cân bằng hệ thống và theo dõi cải tiến; không làm gián đoạn luồng xử lý công việc hằng ngày.</p>
    <section className="kpis">
     <article className="kpi"><span>Hoàn thành kế hoạch năm</span><strong>{planPct}%</strong><small>{planDone}/{planReq} Action · {planOverdue} quá hạn</small></article>
     <article className="kpi"><span>Chỉ số đạt mục tiêu</span><strong>{indicatorPct}%</strong><small>{inTarget}/{evaluableIndicators.length} kỳ đã có kết luận</small></article>
     <article className="kpi"><span>Kết quả giám sát đạt</span><strong>{monitoringPct}%</strong><small>{monitorPass}/{monitorPass+monitorFail} mục đã chấm</small></article>
     <article className="kpi"><span>Action đề án cải tiến</span><strong>{projectPct}%</strong><small>{projectKpi.completed}/{projectKpi.actions} Action · {projectRows.length} đề án</small></article>
    </section>
    <TqmSmartCommandCenter year={year} />
    <TqmPriorityBoard serious={serious} overdueFindings={overdueFindings} capaDue={capaDue} outTarget={outTarget} planOverdue={planOverdue} />
    <TqmProcessMap planPct={planPct} indicatorPct={indicatorPct} monitoringPct={monitoringPct} openFindings={findings.length} capaDue={capaDue} projectPct={projectPct} />
    <TqmScorecard planPct={planPct} indicatorPct={indicatorPct} monitoringPct={monitoringPct} projectPct={projectPct} seriousIncidents={serious} overdueFindings={overdueFindings} />
    <TqmInterventionLoop openFindings={findings.length} overdueFindings={overdueFindings} capaDue={capaDue} projectPct={projectPct} />
    <section className="dashboard-grid"><article className="panel"><div className="head"><h2>Tiến độ kế hoạch chất lượng năm</h2><p>Từ Action thực tế của các kế hoạch.</p></div><TqmDonut value={planPct} label="Hoàn thành" segments={[{label:"Đã hoàn thành",value:planDone,tone:"brand"},{label:"Còn lại",value:Math.max(0,planReq-planDone),tone:"blue"},{label:"Quá hạn",value:planOverdue,tone:"red"}]}/></article><article className="panel"><div className="head"><h2>Gantt đề án cải tiến trọng tâm</h2><p>Thời gian và tiến độ lấy từ dữ liệu đề án/Action thật.</p></div>{ganttRows.length?<TqmGantt year={year} rows={ganttRows}/>:<div className="empty-state">Chưa đủ mốc thời gian đề án để dựng Gantt.</div>}</article></section>
   </div>
  </details>
 </div>
}