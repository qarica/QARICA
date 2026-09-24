import Link from "next/link";
import { IndicatorPeriodAutoSyncClient } from "@/components/indicator-period-auto-sync-client";
import { StatusBadge } from "@/components/status-badge";
import { TQM_CHART_CSS, TqmDonut, TqmHorizontalBars, TqmTrend } from "@/components/tqm-charts";
import { buildDepartmentBenchmark } from "@/lib/indicator-department-benchmark";
import { detectDecliningTrend } from "@/lib/indicator-trend-warning";
import { routeForRecord } from "@/lib/record-route";
import { createClient } from "@/lib/supabase/server";

type Row={id:string;record_code:string;title:string;lifecycle_status:string;department_name:string;owner_name?:string;created_at:string;updated_at:string};
type Tone="brand"|"blue"|"amber"|"red"|"green"|"slate";
const FINAL_STATES=new Set(["VERIFIED","LOCKED"]);
const TARGET_LEVELS=new Set(["MEETS_TARGET","OUT_OF_TARGET"]);
const STATUS_LABEL:Record<string,string>={DRAFT:"Nháp",RETURNED:"Bị trả lại",SUBMITTED:"Chờ xác minh",VERIFIED:"Đã xác minh",LOCKED:"Đã khóa"};
const RESULT_LABEL:Record<string,string>={MEETS_TARGET:"Đạt",OUT_OF_TARGET:"Ngoài mục tiêu",NOT_EVALUATED:"Chưa đánh giá"};
const FREQ_LABEL:Record<string,string>={MONTHLY:"Hàng tháng",QUARTERLY:"Hàng quý",SEMIANNUAL:"6 tháng",ANNUAL:"Hàng năm",WEEKLY:"Hàng tuần"};

function monthIndex(value?:string|null){if(!value)return null;const match=String(value).match(/^\d{4}-(\d{2})-/);if(!match)return null;const m=Number(match[1]);return m>=1&&m<=12?m-1:null}
function fmt(value:unknown){if(value===null||value===undefined||value==="")return "—";const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat("vi-VN",{maximumFractionDigits:2}).format(n):String(value)}
function priorityOf(status:string,result:string|null){if(result==="OUT_OF_TARGET"&&FINAL_STATES.has(status))return 0;if(status==="SUBMITTED")return 1;if(status==="RETURNED")return 2;if(status==="DRAFT")return 3;return 9}

export async function IndicatorQualityOverview({rows,year,canSync=false}:{rows:Row[];year:number;canSync?:boolean}){
 const supabase=await createClient();
 const assignmentsRes=await supabase.from("indicator_assignments").select("id,indicator_version_id,department_id,collector_user_id,work_year,frequency,local_target,status,active_from,active_to,auto_create_periods,source_reference").eq("work_year",year).eq("status","ACTIVE");
 const assignments=(assignmentsRes.data??[]) as any[];const assignmentIds=assignments.map(x=>x.id);const assignmentMap=new Map(assignments.map(x=>[x.id,x]));
 const measurementsRes=assignmentIds.length?await supabase.from("indicator_measurements").select("id,record_id,indicator_assignment_id,period_start,period_end,workflow_status,result_level,calculated_value,raw_value,source_mode,updated_at").in("indicator_assignment_id",assignmentIds).order("period_end",{ascending:false}):{data:[] as any[],error:null};
 const measurements=(measurementsRes.data??[]) as any[];
 const versionIds=Array.from(new Set(assignments.map(x=>x.indicator_version_id).filter(Boolean)));
 const versionsRes=versionIds.length?await supabase.from("indicator_definition_versions").select("id,indicator_definition_id,version_no,calculation_type,desired_direction,frequency,unit,multiplier,status").in("id",versionIds):{data:[] as any[],error:null};
 const versions=(versionsRes.data??[]) as any[];const versionMap=new Map(versions.map(x=>[x.id,x]));
 const definitionIds=Array.from(new Set(versions.map(x=>x.indicator_definition_id).filter(Boolean)));
 const definitionsRes=definitionIds.length?await supabase.from("indicator_definitions").select("id,code,name,quality_dimension,purpose,is_active").in("id",definitionIds):{data:[] as any[],error:null};
 const definitions=(definitionsRes.data??[]) as any[];const definitionMap=new Map(definitions.map(x=>[x.id,x]));
 const departmentIds=Array.from(new Set(assignments.map(x=>x.department_id).filter(Boolean)));
 const collectorIds=Array.from(new Set(assignments.map(x=>x.collector_user_id).filter(Boolean)));
 const [departmentsRes,profilesRes]=await Promise.all([
  departmentIds.length?supabase.from("departments").select("id,name,short_name").in("id",departmentIds):Promise.resolve({data:[],error:null}),
  collectorIds.length?supabase.from("profiles").select("user_id,full_name,email").in("user_id",collectorIds):Promise.resolve({data:[],error:null}),
 ]);
 const departmentMap=new Map((departmentsRes.data??[]).map((x:any)=>[x.id,x.short_name||x.name]));
 const profileMap=new Map((profilesRes.data??[]).map((x:any)=>[x.user_id,x.full_name||x.email||x.user_id]));
 const recordMap=new Map(rows.map(x=>[x.id,x]));
 const autoConfiguredCount=assignments.filter((x:any)=>x.auto_create_periods&&x.active_from).length;

 const finalRows=measurements.filter(x=>FINAL_STATES.has(String(x.workflow_status)));
 const evaluable=finalRows.filter(x=>TARGET_LEVELS.has(String(x.result_level)));
 const notEvaluated=finalRows.filter(x=>String(x.result_level)==="NOT_EVALUATED").length;
 const inTarget=evaluable.filter(x=>String(x.result_level)==="MEETS_TARGET").length;
 const outTarget=evaluable.filter(x=>String(x.result_level)==="OUT_OF_TARGET").length;
 const attainment=evaluable.length?Math.round(inTarget/evaluable.length*100):0;
 const submitted=measurements.filter(x=>String(x.workflow_status)==="SUBMITTED").length;
 const locked=measurements.filter(x=>String(x.workflow_status)==="LOCKED").length;
 const targetReady=assignments.filter(x=>x.local_target!==null&&x.local_target!==undefined).length;

 const latestByAssignment=new Map<string,any>();
 for(const m of measurements){if(!latestByAssignment.has(m.indicator_assignment_id))latestByAssignment.set(m.indicator_assignment_id,m)}
 const withoutMeasurement=Math.max(0,assignments.length-latestByAssignment.size);

 // Cảnh báo xu hướng xấu dần: 3 kỳ VERIFIED/LOCKED liên tiếp gần nhất đang đi đúng
 // chiều "xấu hơn", kể cả khi kỳ mới nhất vẫn còn MEETS_TARGET — báo sớm trước khi
 // thật sự vượt ngưỡng. Không thay thế cảnh báo Ngoài mục tiêu đã có ở trên.
 const measurementsByAssignment=new Map<string,any[]>();
 for(const m of measurements){const list=measurementsByAssignment.get(m.indicator_assignment_id)||[];list.push(m);measurementsByAssignment.set(m.indicator_assignment_id,list)}
 const decliningWarnings=assignments.map((a:any)=>{
  const version=versionMap.get(a.indicator_version_id);
  const definition=version?definitionMap.get(version.indicator_definition_id):null;
  const trend=detectDecliningTrend(measurementsByAssignment.get(a.id)||[],version?.desired_direction);
  return trend.declining?{assignment:a,version,definition,trend}:null;
 }).filter(Boolean) as {assignment:any;version:any;definition:any;trend:ReturnType<typeof detectDecliningTrend>}[];

 // So sánh chỉ số giữa khoa/phòng: chỉ dùng kỳ VERIFIED/LOCKED có giá trị gần
 // nhất của mỗi phân công (không phải kỳ mới nhất bất kể trạng thái) — để so
 // sánh công bằng, tránh so kỳ Nháp/Chờ xác minh của khoa này với kỳ đã khóa
 // của khoa khác. Mục đích là ưu tiên hỗ trợ khoa lệch xa nhất, không xếp hạng thi đua.
 const latestEvaluableByAssignment=new Map<string,any>();
 for(const m of measurements){
  if(latestEvaluableByAssignment.has(m.indicator_assignment_id))continue;
  if(!FINAL_STATES.has(String(m.workflow_status)))continue;
  if(m.calculated_value===null||m.calculated_value===undefined||m.calculated_value==="")continue;
  latestEvaluableByAssignment.set(m.indicator_assignment_id,m);
 }
 const benchmarkRows=assignments.map((a:any)=>{
  const version=versionMap.get(a.indicator_version_id);
  const definition=version?definitionMap.get(version.indicator_definition_id):null;
  const latest=latestEvaluableByAssignment.get(a.id);
  if(!definition||!latest||!a.department_id)return null;
  return {indicator_key:definition.id,indicator_label:`${definition.code||""} ${definition.name||""}`.trim(),department_id:a.department_id,department_label:departmentMap.get(a.department_id)||"Chưa xác định",direction:version?.desired_direction,unit:version?.unit,value:latest.calculated_value,period_end:latest.period_end};
 }).filter(Boolean) as Parameters<typeof buildDepartmentBenchmark>[0];
 const benchmarkGroups=buildDepartmentBenchmark(benchmarkRows).slice(0,6);

 const queue=measurements.filter(x=>priorityOf(String(x.workflow_status),x.result_level)==0||["SUBMITTED","RETURNED","DRAFT"].includes(String(x.workflow_status))).sort((a,b)=>priorityOf(String(a.workflow_status),a.result_level)-priorityOf(String(b.workflow_status),b.result_level)||String(b.period_end||"").localeCompare(String(a.period_end||""))).slice(0,12);

 const monthly=Array.from({length:12},(_,i)=>({label:`T${i+1}`,total:0,ok:0}));
 for(const x of evaluable){const index=monthIndex(x.period_end);if(index===null)continue;monthly[index].total++;if(String(x.result_level)==="MEETS_TARGET")monthly[index].ok++;}
 const trend=monthly.filter(x=>x.total>0).map(x=>({label:x.label,value:Math.round(x.ok/x.total*100)}));

 const byIndicator=new Map<string,{label:string;total:number;ok:number}>();
 for(const x of evaluable){const assignment=assignmentMap.get(x.indicator_assignment_id);const version=assignment?versionMap.get(assignment.indicator_version_id):null;const definition=version?definitionMap.get(version.indicator_definition_id):null;const key=definition?.id||x.indicator_assignment_id||x.record_id;const label=definition?`${definition.code||""} ${definition.name||""}`.trim():"Chỉ số chưa định danh";const current=byIndicator.get(key)||{label,total:0,ok:0};current.total++;if(String(x.result_level)==="MEETS_TARGET")current.ok++;byIndicator.set(key,current);}
 const indicatorBars=Array.from(byIndicator.values()).map(x=>{const pct=x.total?Math.round(x.ok/x.total*100):0;return{label:x.label,value:pct,tone:(pct>=90?"green":pct>=75?"blue":pct>=50?"amber":"red") as Tone,caption:`${x.ok}/${x.total} kỳ đạt`}}).sort((a,b)=>a.value-b.value).slice(0,10);

 const operatingRows=assignments.map(a=>{const version=versionMap.get(a.indicator_version_id);const definition=version?definitionMap.get(version.indicator_definition_id):null;const latest=latestByAssignment.get(a.id);const status=String(latest?.workflow_status||"NO_MEASUREMENT");const result=latest?.result_level?String(latest.result_level):null;return{assignment:a,version,definition,latest,status,result,priority:latest?priorityOf(status,result):-1}}).sort((a,b)=>a.priority-b.priority||String(a.definition?.code||"").localeCompare(String(b.definition?.code||""))).slice(0,30);
 const firstError=assignmentsRes.error||measurementsRes.error||versionsRes.error||definitionsRes.error||departmentsRes.error||profilesRes.error;

 return <>
  <style>{TQM_CHART_CSS+`.iq-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}.iq-kpi{background:#fff;border:1px solid #e1e9ec;border-radius:17px;padding:15px 16px}.iq-kpi span{display:block;font-size:10px;color:#728188;font-weight:800;text-transform:uppercase}.iq-kpi strong{display:block;font-size:29px;line-height:1;margin-top:8px}.iq-kpi small{display:block;font-size:10px;color:#7d8c92;margin-top:6px}.iq-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.iq-head{padding:16px 18px 4px}.iq-head h2{margin:0;font-size:15px}.iq-head p{margin:4px 0 0;color:#74838a;font-size:11px}.iq-queue{display:grid;gap:8px;padding:8px 16px 16px}.iq-queue-row{display:grid;grid-template-columns:minmax(0,1.7fr) 110px 120px 110px auto;gap:10px;align-items:center;padding:11px 12px;border:1px solid #e4eaec;border-radius:13px}.iq-queue-row.danger{border-color:#f2c7cc;background:#fffafb}.iq-queue-row.warn{border-color:#f0d59e;background:#fffdf5}.iq-queue-row.bench{grid-template-columns:minmax(0,1.5fr) 1fr 1fr auto}.iq-queue-row strong{font-size:11px}.iq-queue-row small{display:block;color:#7a898f;margin-top:3px}.iq-table{display:grid;gap:7px;padding:8px 16px 16px}.iq-assignment{display:grid;grid-template-columns:minmax(220px,1.8fr) 120px 125px 110px 130px 90px;gap:10px;align-items:center;padding:11px;border:1px solid #e4eaec;border-radius:12px}.iq-assignment strong{font-size:11px}.iq-assignment small{display:block;color:#7a898f;margin-top:3px}.iq-pill{display:inline-flex;align-items:center;width:max-content;max-width:100%;padding:4px 7px;border-radius:999px;background:#f1f5f9;color:#475569;font-size:9px;font-weight:800}.iq-pill.red{background:#fff0f1;color:#b42335}.iq-pill.amber{background:#fff7e6;color:#92400e}.iq-pill.green{background:#eaf7ef;color:#166534}.iq-empty-banner{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:15px 17px;border:1px solid #f0d59e;background:#fffaf0;border-radius:14px}.iq-empty-banner strong{display:block;font-size:12px}.iq-empty-banner span{display:block;color:#78633d;font-size:10px;margin-top:3px}@media(max-width:1200px){.iq-kpis{grid-template-columns:repeat(3,1fr)}.iq-assignment{grid-template-columns:1.5fr 1fr 1fr}.iq-assignment>*:nth-child(n+4){display:none}}@media(max-width:900px){.iq-grid{grid-template-columns:1fr}.iq-queue-row{grid-template-columns:1fr 1fr}.iq-queue-row>div:first-child{grid-column:1/-1}}@media(max-width:700px){.iq-kpis{grid-template-columns:1fr 1fr}.iq-assignment{grid-template-columns:1fr}.iq-assignment>*{display:block!important}.iq-empty-banner{display:grid}}`}</style>
  {firstError?<div className="alert error">Một phần dữ liệu chỉ số chưa tải được: {firstError.message}</div>:null}
  <IndicatorPeriodAutoSyncClient year={year} enabled={canSync&&autoConfiguredCount>0}/>
  {assignments.length>0&&measurements.length===0?<section className="iq-empty-banner"><div><strong>Đã có {assignments.length} chỉ số/phân công nhưng chưa có kỳ đo trong năm {year}.</strong><span>Không cần nhập lại lịch đo thủ công. Sau khi xác nhận cấu hình nguồn, QARICA tự tạo kỳ đo đúng tần suất; hiện có {autoConfiguredCount} phân công đã bật tự động.</span></div><span className="iq-pill amber">{withoutMeasurement} phân công chưa có dữ liệu</span></section>:null}
  <section className="iq-kpis">
   <article className="iq-kpi"><span>Phân công hoạt động</span><strong>{assignments.length}</strong><small>{autoConfiguredCount} đã bật tự tạo kỳ đo</small></article>
   <article className="iq-kpi"><span>Đã đặt mục tiêu</span><strong>{assignments.length?Math.round(targetReady/assignments.length*100):0}%</strong><small>{targetReady}/{assignments.length} phân công có target</small></article>
   <article className="iq-kpi"><span>Kỳ đo đã tạo</span><strong>{measurements.length}</strong><small>{finalRows.length} đã VERIFIED/LOCKED</small></article>
   <article className="iq-kpi"><span>Chờ xác minh</span><strong>{submitted}</strong><small>Cần người có quyền verify xử lý</small></article>
   <article className="iq-kpi"><span>Ngoài mục tiêu</span><strong>{outTarget}</strong><small>Chỉ tính kỳ VERIFIED/LOCKED có target</small></article>
   <article className="iq-kpi"><span>Đã khóa</span><strong>{locked}</strong><small>Số liệu đã chốt audit trail</small></article>
  </section>
  <section className="panel"><div className="iq-head"><h2>Việc cần xử lý</h2><p>Ưu tiên kỳ ngoài mục tiêu đã xác minh, kỳ chờ xác minh, bị trả lại và nháp. Mở thẳng hồ sơ để thực hiện bước tiếp theo.</p></div><div className="iq-queue">{queue.map((x:any)=>{const a=assignmentMap.get(x.indicator_assignment_id);const v=a?versionMap.get(a.indicator_version_id):null;const d=v?definitionMap.get(v.indicator_definition_id):null;const rec=recordMap.get(x.record_id);const danger=String(x.result_level)==="OUT_OF_TARGET";return <div className={`iq-queue-row ${danger?"danger":""}`} key={x.id}><div><strong>{d?.code||rec?.record_code||"IND"} · {d?.name||rec?.title||"Kỳ đo chỉ số"}</strong><small>{x.period_start||"—"} → {x.period_end||"—"} · {departmentMap.get(a?.department_id)||"Toàn viện"}</small></div><div><span className={`iq-pill ${danger?"red":x.workflow_status==="SUBMITTED"?"amber":""}`}>{RESULT_LABEL[String(x.result_level)]||STATUS_LABEL[String(x.workflow_status)]||x.workflow_status}</span></div><div><strong>{fmt(x.calculated_value)} {v?.unit||""}</strong><small>Kết quả</small></div><div><StatusBadge status={x.workflow_status}/></div><Link className="button tertiary small" href={routeForRecord("INDICATOR_MEASUREMENT",x.record_id)}>Xử lý</Link></div>})}{!queue.length?<div className="empty-state">Chưa có kỳ đo cần xử lý. Khi có dữ liệu Nháp/Trả lại/Chờ xác minh hoặc ngoài mục tiêu, hệ thống sẽ đưa lên đây.</div>:null}</div></section>
  {decliningWarnings.length?<section className="panel"><div className="iq-head"><h2>Cảnh báo xu hướng xấu dần</h2><p>Chỉ số có 3 kỳ VERIFIED/LOCKED liên tiếp gần nhất đang đi xấu hơn — kể cả khi vẫn còn &quot;Đạt&quot;. Báo sớm để can thiệp trước khi vượt ngưỡng, không thay thế cảnh báo Ngoài mục tiêu. Đường đứt nét là mục tiêu (target) đã đặt cho khoa/phòng, nếu có.</p></div><div className="iq-queue">{decliningWarnings.map(({assignment:a,version:v,definition:d,trend})=>{const unit=v?.unit||"";const points=trend.periods.map(p=>`${fmt(p.value)}${unit}`).join(" → ");const hasTarget=a.local_target!==null&&a.local_target!==undefined&&Number.isFinite(Number(a.local_target));const chartPoints=trend.periods.map(p=>({label:p.period_end,value:Number(p.value)}));return <div key={a.id}><div className="iq-queue-row warn"><div><strong>{d?.code||"IND"} · {d?.name||"Chỉ số chưa định danh"}</strong><small>{departmentMap.get(a.department_id)||"Toàn viện"} · {trend.periods[0]?.period_end||"—"} → {trend.periods[trend.periods.length-1]?.period_end||"—"}</small></div><div><span className="iq-pill amber">Đang xấu dần</span></div><div><strong>{points}</strong><small>{v?.desired_direction==="LOWER_IS_BETTER"?"Càng thấp càng tốt":"Càng cao càng tốt"}{hasTarget?` · Mục tiêu ${fmt(a.local_target)}${unit}`:""}</small></div><div/><Link className="button tertiary small" href={routeForRecord("INDICATOR_MEASUREMENT",measurementsByAssignment.get(a.id)?.find((m:any)=>m.period_end===trend.periods[trend.periods.length-1]?.period_end)?.record_id||"")}>Xem kỳ mới nhất</Link></div>{chartPoints.length>=2?<TqmTrend points={chartPoints} unit={unit} targetLine={hasTarget?Number(a.local_target):null}/>:null}</div>})}</div></section>:null}
  {benchmarkGroups.length?<section className="panel"><div className="iq-head"><h2>So sánh chỉ số giữa khoa/phòng</h2><p>Chỉ so sánh chỉ số có từ 2 khoa/phòng trở lên cùng có kỳ VERIFIED/LOCKED gần nhất. Xếp theo khoảng cách lớn nhất giữa khoa tốt nhất và khoa cần chú ý nhất — để ưu tiên hỗ trợ, không phải xếp hạng thi đua.</p></div><div className="iq-queue">{benchmarkGroups.map(g=><div className="iq-queue-row bench" key={g.indicator_key}><div><strong>{g.indicator_label||"Chỉ số chưa định danh"}</strong><small>{g.departments.length} khoa/phòng · {g.direction==="LOWER_IS_BETTER"?"Càng thấp càng tốt":"Càng cao càng tốt"}</small></div><div><strong>{g.best.department_label}</strong><small>Tốt nhất · {fmt(g.best.value)} {g.unit||""}</small></div><div><strong>{g.worst.department_label}</strong><small>Cần chú ý · {fmt(g.worst.value)} {g.unit||""}</small></div><div><span className={`iq-pill ${g.gapPct>=50?"red":g.gapPct>=20?"amber":""}`}>Lệch {fmt(g.gapPct)}%</span></div></div>)}</div></section>:null}
  <section className="panel"><div className="iq-head"><h2>Danh mục chỉ số đang vận hành</h2><p>Hiển thị trực tiếp cấu hình năm {year}: chỉ số, chiều chất lượng, tần suất, mục tiêu, đơn vị/người thu thập và kỳ đo gần nhất.</p></div><div className="iq-table">{operatingRows.map((x:any)=>{const a=x.assignment,v=x.version,d=x.definition,m=x.latest;const hasTarget=a.local_target!==null&&a.local_target!==undefined;return <div className="iq-assignment" key={a.id}><div><strong>{d?.code||"—"} · {d?.name||"Chỉ số chưa định danh"}</strong><small>{d?.quality_dimension||"Chưa phân loại"} · {v?.calculation_type||"—"} · {v?.unit||""}</small></div><div><strong>{FREQ_LABEL[String(a.frequency||v?.frequency)]||a.frequency||v?.frequency||"—"}</strong><small>Tần suất</small></div><div><strong>{hasTarget?`${fmt(a.local_target)} ${v?.unit||""}`:"Chưa đặt"}</strong><small>Mục tiêu</small></div><div><strong>{departmentMap.get(a.department_id)||"Toàn viện"}</strong><small>{profileMap.get(a.collector_user_id)||"Chưa gán người"}</small></div><div>{m?<><span className={`iq-pill ${x.result==="OUT_OF_TARGET"?"red":x.result==="MEETS_TARGET"?"green":x.status==="SUBMITTED"?"amber":""}`}>{RESULT_LABEL[x.result||""]||STATUS_LABEL[x.status]||x.status}</span><small>{m.period_end||"—"} · {m.source_mode||"MANUAL"}</small></>:<><span className={`iq-pill ${a.auto_create_periods?"green":"amber"}`}>{a.auto_create_periods?"Đang chờ kỳ vận hành":"Chưa bật tự động"}</span><small>{a.active_from?`Từ ${a.active_from}`:"Cần xác nhận nguồn/tần suất"}</small></>}</div><div>{m?<Link className="button tertiary small" href={routeForRecord("INDICATOR_MEASUREMENT",m.record_id)}>Mở</Link>:<span className="iq-pill">Chờ nhập</span>}</div></div>})}{!operatingRows.length?<div className="empty-state">Chưa có chỉ số/phân công hoạt động cho năm {year}.</div>:null}</div></section>
  <section className="iq-grid"><article className="panel"><div className="iq-head"><h2>Mức đạt mục tiêu chỉ số</h2><p>Mẫu số chỉ gồm kỳ VERIFIED/LOCKED có target. Kỳ chưa đánh giá mục tiêu được tách riêng ({notEvaluated}), không được tính là đạt.</p></div>{evaluable.length?<TqmDonut value={attainment} label="Kỳ đạt" segments={[{label:"Đạt mục tiêu",value:inTarget,tone:"green"},{label:"Ngoài mục tiêu",value:outTarget,tone:"red"}]}/>:<div className="empty-state">Chưa có kỳ VERIFIED/LOCKED có target để tính tỷ lệ đạt.</div>}</article><article className="panel"><div className="iq-head"><h2>Chỉ số cần ưu tiên phân tích</h2><p>Xếp chỉ số có tỷ lệ kỳ đạt thấp lên trước; không tạo điểm tổng hợp giả.</p></div>{indicatorBars.length?<TqmHorizontalBars rows={indicatorBars} max={100}/>:<div className="empty-state">Chưa đủ kỳ VERIFIED/LOCKED có target để so sánh.</div>}</article></section>
  <section className="panel"><div className="iq-head"><h2>Xu hướng tỷ lệ kỳ đạt mục tiêu</h2><p>Chỉ hiển thị tháng thực sự có kỳ VERIFIED/LOCKED và có target; không vẽ 0 cho tháng chưa có dữ liệu.</p></div>{trend.length?<TqmTrend points={trend} unit="%"/>:<div className="empty-state">Chưa có dữ liệu đã xác minh/khóa để dựng xu hướng.</div>}</section>
 </>;
}
