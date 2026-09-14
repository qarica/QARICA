import { TQM_CHART_CSS, TqmDonut, TqmHorizontalBars, TqmTrend } from "@/components/tqm-charts";
import { createClient } from "@/lib/supabase/server";

type Row={id:string;record_code:string;title:string;lifecycle_status:string;department_name:string;created_at:string;updated_at:string};
type Tone="brand"|"blue"|"amber"|"red"|"green"|"slate";
const FINAL_STATES=new Set(["VERIFIED","LOCKED"]);
const TARGET_LEVELS=new Set(["MEETS_TARGET","OUT_OF_TARGET"]);

function monthIndex(value?:string|null){if(!value)return null;const match=String(value).match(/^\d{4}-(\d{2})-/);if(!match)return null;const m=Number(match[1]);return m>=1&&m<=12?m-1:null}

export async function IndicatorQualityOverview({rows}:{rows:Row[]}){
 const supabase=await createClient();const recordIds=rows.map(r=>r.id);if(!recordIds.length)return null;
 const {data,error}=await supabase.from("indicator_measurements").select("id,record_id,indicator_assignment_id,period_start,period_end,workflow_status,result_level,calculated_value,raw_value").in("record_id",recordIds);
 const measurements=(data??[]) as any[];
 const finalRows=measurements.filter(x=>FINAL_STATES.has(String(x.workflow_status)));
 const evaluable=finalRows.filter(x=>TARGET_LEVELS.has(String(x.result_level)));
 const notEvaluated=finalRows.filter(x=>String(x.result_level)==="NOT_EVALUATED").length;
 const inTarget=evaluable.filter(x=>String(x.result_level)==="MEETS_TARGET").length;
 const outTarget=evaluable.filter(x=>String(x.result_level)==="OUT_OF_TARGET").length;
 const attainment=evaluable.length?Math.round(inTarget/evaluable.length*100):0;
 const draftCount=Math.max(0,measurements.length-finalRows.length);

 const assignmentIds=Array.from(new Set(measurements.map(x=>x.indicator_assignment_id).filter(Boolean)));
 const assignmentsRes=assignmentIds.length?await supabase.from("indicator_assignments").select("id,indicator_version_id,local_target,frequency").in("id",assignmentIds):{data:[] as any[],error:null};
 const assignments=(assignmentsRes.data??[]) as any[];const assignmentMap=new Map(assignments.map(x=>[x.id,x]));
 const versionIds=Array.from(new Set(assignments.map(x=>x.indicator_version_id).filter(Boolean)));
 const versionsRes=versionIds.length?await supabase.from("indicator_definition_versions").select("id,indicator_definition_id,unit,desired_direction").in("id",versionIds):{data:[] as any[],error:null};
 const versions=(versionsRes.data??[]) as any[];const versionMap=new Map(versions.map(x=>[x.id,x]));
 const definitionIds=Array.from(new Set(versions.map(x=>x.indicator_definition_id).filter(Boolean)));
 const definitionsRes=definitionIds.length?await supabase.from("indicator_definitions").select("id,code,name,quality_dimension").in("id",definitionIds):{data:[] as any[],error:null};
 const definitions=(definitionsRes.data??[]) as any[];const definitionMap=new Map(definitions.map(x=>[x.id,x]));

 const monthly=Array.from({length:12},(_,i)=>({label:`T${i+1}`,value:0,total:0,ok:0}));
 for(const x of evaluable){const index=monthIndex(x.period_end);if(index===null)continue;monthly[index].total++;if(String(x.result_level)==="MEETS_TARGET")monthly[index].ok++;}
 const trend=monthly.map(x=>({label:x.label,value:x.total?Math.round(x.ok/x.total*100):0}));

 const byIndicator=new Map<string,{label:string;total:number;ok:number}>();
 for(const x of evaluable){const assignment=assignmentMap.get(x.indicator_assignment_id);const version=assignment?versionMap.get(assignment.indicator_version_id):null;const definition=version?definitionMap.get(version.indicator_definition_id):null;const key=definition?.id||x.indicator_assignment_id||x.record_id;const label=definition?`${definition.code||""} ${definition.name||""}`.trim():"Chỉ số chưa định danh";const current=byIndicator.get(key)||{label,total:0,ok:0};current.total++;if(String(x.result_level)==="MEETS_TARGET")current.ok++;byIndicator.set(key,current);}
 const indicatorBars=Array.from(byIndicator.values()).map(x=>{const pct=x.total?Math.round(x.ok/x.total*100):0;return{label:x.label,value:pct,tone:(pct>=90?"green":pct>=75?"blue":pct>=50?"amber":"red") as Tone,caption:`${x.ok}/${x.total} kỳ đạt`}}).sort((a,b)=>a.value-b.value).slice(0,10);
 const firstError=error||assignmentsRes.error||versionsRes.error||definitionsRes.error;

 return <>
  <style>{TQM_CHART_CSS+`.iq-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.iq-kpi{background:#fff;border:1px solid #e1e9ec;border-radius:17px;padding:15px 16px}.iq-kpi span{display:block;font-size:10px;color:#728188;font-weight:800;text-transform:uppercase}.iq-kpi strong{display:block;font-size:29px;line-height:1;margin-top:8px}.iq-kpi small{display:block;font-size:10px;color:#7d8c92;margin-top:6px}.iq-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.iq-head{padding:16px 18px 4px}.iq-head h2{margin:0;font-size:15px}.iq-head p{margin:4px 0 0;color:#74838a;font-size:11px}@media(max-width:1100px){.iq-kpis{grid-template-columns:repeat(3,1fr)}}@media(max-width:900px){.iq-grid{grid-template-columns:1fr}}@media(max-width:700px){.iq-kpis{grid-template-columns:1fr 1fr}}`}</style>
  {firstError?<div className="alert error">Một phần analytics chỉ số chưa tải được: {firstError.message}</div>:null}
  <section className="iq-kpis"><article className="iq-kpi"><span>Kỳ đo trong năm</span><strong>{measurements.length}</strong><small>{draftCount} kỳ chưa VERIFIED/LOCKED</small></article><article className="iq-kpi"><span>Kỳ đã xác minh/khóa</span><strong>{finalRows.length}</strong><small>Được phép dùng cho analytics</small></article><article className="iq-kpi"><span>Đạt mục tiêu</span><strong>{attainment}%</strong><small>{inTarget}/{evaluable.length||0} kỳ có target để đánh giá</small></article><article className="iq-kpi"><span>Ngoài mục tiêu</span><strong>{outTarget}</strong><small>Cần phân tích nguyên nhân trước khi quyết định can thiệp</small></article><article className="iq-kpi"><span>Chưa đánh giá mục tiêu</span><strong>{notEvaluated}</strong><small>VERIFIED/LOCKED nhưng chưa có target; không tính là đạt</small></article></section>
  <section className="iq-grid"><article className="panel"><div className="iq-head"><h2>Mức đạt mục tiêu chỉ số</h2><p>Mẫu số chỉ gồm kỳ VERIFIED/LOCKED có `MEETS_TARGET` hoặc `OUT_OF_TARGET`. `NOT_EVALUATED` được tách riêng, không được tính là đạt.</p></div><TqmDonut value={attainment} label="Kỳ đạt" segments={[{label:"Đạt mục tiêu",value:inTarget,tone:"green"},{label:"Ngoài mục tiêu",value:outTarget,tone:"red"}]}/></article><article className="panel"><div className="iq-head"><h2>Chỉ số cần ưu tiên phân tích</h2><p>Xếp chỉ số có tỷ lệ kỳ đạt thấp lên trước. Đây là tỷ lệ theo kỳ đo đã xác minh và có target, không phải điểm số tự tạo.</p></div>{indicatorBars.length?<TqmHorizontalBars rows={indicatorBars} max={100}/>:<div className="empty-state">Chưa đủ kỳ VERIFIED/LOCKED có target để so sánh.</div>}</article></section>
  <section className="panel"><div className="iq-head"><h2>Xu hướng tỷ lệ kỳ đạt mục tiêu theo tháng</h2><p>Mỗi điểm = số kỳ `MEETS_TARGET` / tổng kỳ có target và <strong>period_end</strong> trong tháng đó. Tháng không có kỳ đủ điều kiện hiển thị 0 và không được hiểu là chất lượng bằng 0.</p></div><TqmTrend points={trend} unit="%"/></section>
 </>;
}
