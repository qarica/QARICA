import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const SUPPORTED=new Set(["DIRECTIVE","REPORT","INSPECTION","INDICATOR_MEASUREMENT","FINDING","INCIDENT","CAPA","RISK","FMEA","IMPROVEMENT_PROPOSAL","IMPROVEMENT_PROJECT","ASSESSMENT","EXTERNAL_ASSESSMENT","AUDIT","SAFETY_ALERT","FEEDBACK"]);
const CREATE_RPC="qlcl_create_domain_record_v1";
const text=(v:unknown)=>v===null||v===undefined?null:String(v).trim()||null;

async function context(recordType:string){
 const supabase=await createClient();const {data:{user},error}=await supabase.auth.getUser();if(error||!user)return {ok:false as const,response:NextResponse.json({error:"Chưa đăng nhập."},{status:401})};
 const {data:allowed}=await supabase.rpc("can_create_record_type",{p_record_type:recordType});
 let can=!!allowed;if(recordType==="INCIDENT"&&!can){const {data:r}=await supabase.rpc("has_permission",{p_permission_code:"incident.report"});can=!!r;}
 if(!can)return {ok:false as const,response:NextResponse.json({error:"Bạn không có quyền tạo hồ sơ này."},{status:403})};
 const admin=createAdminClient();const {data:caller}=await admin.from("profiles").select("organization_id,is_active,full_name,primary_department_id").eq("user_id",user.id).maybeSingle();
 if(!caller?.organization_id||!caller.is_active)return {ok:false as const,response:NextResponse.json({error:"Tài khoản chưa gắn tổ chức hoặc đã ngưng hoạt động."},{status:403})};
 return {ok:true as const,user,admin,caller};
}

export async function GET(request:Request){
 const url=new URL(request.url);const recordType=String(url.searchParams.get("type")||"").toUpperCase();const workYear=Number(url.searchParams.get("year")||new Date().getFullYear());
 if(!SUPPORTED.has(recordType))return NextResponse.json({error:"Loại hồ sơ chưa hỗ trợ."},{status:400});const ctx=await context(recordType);if(!ctx.ok)return ctx.response;const {admin,caller}=ctx;
 const [{data:departments},{data:profiles}]=await Promise.all([
  admin.from("departments").select("id,name,short_name").eq("organization_id",caller.organization_id).eq("is_active",true).order("name"),
  admin.from("profiles").select("user_id,full_name,email,primary_department_id").eq("organization_id",caller.organization_id).eq("is_active",true).order("full_name")
 ]);
 let criteriaVersions:any[]=[];let indicatorAssignments:any[]=[];let fmeaModels:any[]=[];
 if(["ASSESSMENT","EXTERNAL_ASSESSMENT"].includes(recordType)){
  const {data:versions}=await admin.from("criteria_set_versions").select("id,criteria_set_id,version_no,effective_from,status").eq("status","PUBLISHED").order("published_at",{ascending:false});const setIds=Array.from(new Set((versions??[]).map((v:any)=>v.criteria_set_id)));
  const {data:sets}=setIds.length?await admin.from("criteria_sets").select("id,code,name,is_active").in("id",setIds).eq("is_active",true):{data:[]};const map=new Map((sets??[]).map((s:any)=>[s.id,s]));criteriaVersions=(versions??[]).filter((v:any)=>map.has(v.criteria_set_id)).map((v:any)=>({id:v.id,label:`${map.get(v.criteria_set_id)?.code||""} ${map.get(v.criteria_set_id)?.name||"Bộ tiêu chí"} · v${v.version_no}`.trim()}));
 }
 if(recordType==="INDICATOR_MEASUREMENT"){
  const {data:assign}=await admin.from("indicator_assignments").select("id,indicator_version_id,department_id,frequency,local_target,status").eq("work_year",workYear).eq("status","ACTIVE");const versionIds=Array.from(new Set((assign??[]).map((a:any)=>a.indicator_version_id)));const {data:versions}=versionIds.length?await admin.from("indicator_definition_versions").select("id,indicator_definition_id,version_no,unit").in("id",versionIds):{data:[]};const defIds=Array.from(new Set((versions??[]).map((v:any)=>v.indicator_definition_id)));const {data:defs}=defIds.length?await admin.from("indicator_definitions").select("id,code,name").in("id",defIds):{data:[]};const vm=new Map((versions??[]).map((v:any)=>[v.id,v]));const dm=new Map((defs??[]).map((d:any)=>[d.id,d]));const depm=new Map<string,string>((departments??[]).map((d:any)=>[String(d.id),String(d.short_name||d.name||"")]));indicatorAssignments=(assign??[]).map((a:any)=>{const v=vm.get(a.indicator_version_id);const d=v?dm.get(v.indicator_definition_id):null;return {id:a.id,label:`${d?.code||""} ${d?.name||"Chỉ số"} · ${depm.get(String(a.department_id))||"Toàn viện"} · ${a.frequency||"chưa đặt tần suất"}`.trim()}});
 }
 if(recordType==="FMEA"){const {data}=await admin.from("fmea_scoring_model_versions").select("id,name,method,version_no").eq("status","PUBLISHED").order("effective_from",{ascending:false});fmeaModels=(data??[]).map((x:any)=>({id:x.id,label:`${x.name} · ${x.method} v${x.version_no}`}));}
 return NextResponse.json({departments:departments??[],profiles:profiles??[],criteria_versions:criteriaVersions,indicator_assignments:indicatorAssignments,fmea_models:fmeaModels});
}

export async function POST(request:Request){
 const body=await request.json();const recordType=String(body.record_type||"").toUpperCase();if(!SUPPORTED.has(recordType))return NextResponse.json({error:"Loại hồ sơ chưa hỗ trợ."},{status:400});const ctx=await context(recordType);if(!ctx.ok)return ctx.response;const {admin,caller,user}=ctx;
 const title=String(body.title||"").trim();const workYear=Number(body.work_year);const f=(body.fields||{}) as Record<string,unknown>;if(!title)return NextResponse.json({error:"Tên hồ sơ là bắt buộc."},{status:400});if(!Number.isInteger(workYear)||workYear<2000||workYear>2200)return NextResponse.json({error:"Năm làm việc không hợp lệ."},{status:400});
 let ownerDepartmentId=text(body.owner_department_id)||text(body.owner_primary_department_id);let ownerUserId=text(body.owner_user_id);
 if(recordType==="INCIDENT")ownerDepartmentId=text(f.incident_location_primary_department_id)||caller.primary_department_id||null;
 if(recordType==="INDICATOR_MEASUREMENT"){
  const assignmentId=text(f.indicator_assignment_id);if(!assignmentId)return NextResponse.json({error:"Cần chọn chỉ số được phân công."},{status:400});const {data:a}=await admin.from("indicator_assignments").select("id,department_id,collector_user_id,work_year,status").eq("id",assignmentId).eq("work_year",workYear).maybeSingle();if(!a||a.status!=="ACTIVE")return NextResponse.json({error:"Phân công chỉ số không hợp lệ hoặc không còn hoạt động."},{status:400});ownerDepartmentId=a.department_id;ownerUserId=a.collector_user_id||user.id;
 }
 if(ownerDepartmentId){const {data:d}=await admin.from("departments").select("id,is_active").eq("id",ownerDepartmentId).eq("organization_id",caller.organization_id).maybeSingle();if(!d?.is_active)return NextResponse.json({error:"Khoa/phòng phụ trách không hợp lệ."},{status:400});}
 if(ownerUserId){const {data:p}=await admin.from("profiles").select("user_id,is_active").eq("user_id",ownerUserId).eq("organization_id",caller.organization_id).maybeSingle();if(!p?.is_active)return NextResponse.json({error:"Người phụ trách không hợp lệ."},{status:400});}
 const required=(key:string)=>text(f[key]);
 if(recordType==="INSPECTION"&&(!required("inspection_type")||!required("visit_date")))return NextResponse.json({error:"Loại kiểm tra và ngày đoàn đến là bắt buộc."},{status:400});
 if(recordType==="INDICATOR_MEASUREMENT"){
  const periodStart=required("period_start"),periodEnd=required("period_end");
  if(!required("indicator_assignment_id")||!periodStart||!periodEnd)return NextResponse.json({error:"Cần chọn chỉ số và kỳ đo."},{status:400});
  if(periodEnd<periodStart)return NextResponse.json({error:"Ngày kết thúc kỳ đo không được trước ngày bắt đầu."},{status:400});
 }
 if(recordType==="FINDING"&&!required("description"))return NextResponse.json({error:"Mô tả Finding là bắt buộc."},{status:400});
 if(recordType==="INCIDENT"){
  if(!required("initial_description"))return NextResponse.json({error:"Mô tả sự cố là bắt buộc."},{status:400});
  if(!required("incident_location_primary_department_id"))return NextResponse.json({error:"Khoa/phòng nơi xảy ra là bắt buộc."},{status:400});
  if(!required("occurred_at"))return NextResponse.json({error:"Ngày, giờ xảy ra sự cố là bắt buộc."},{status:400});
  if(!required("reported_at"))return NextResponse.json({error:"Ngày, giờ báo cáo là bắt buộc."},{status:400});
 }
 if(recordType==="CAPA"&&!required("problem_statement"))return NextResponse.json({error:"Vấn đề cần CAPA là bắt buộc."},{status:400});
 if(recordType==="RISK"&&!required("risk_event"))return NextResponse.json({error:"Sự kiện rủi ro là bắt buộc."},{status:400});
 if(recordType==="FMEA"&&!["FMEA","HFMEA"].includes(String(f.method||"").toUpperCase()))return NextResponse.json({error:"Cần chọn FMEA hoặc HFMEA."},{status:400});
 if(recordType==="IMPROVEMENT_PROPOSAL"&&!required("problem_description"))return NextResponse.json({error:"Vấn đề/thực trạng là bắt buộc."},{status:400});
 if(recordType==="ASSESSMENT"){
  const version=required("criteria_version_id"),roundType=required("round_type");
  if(!version||!roundType)return NextResponse.json({error:"Bộ tiêu chí và loại đợt là bắt buộc."},{status:400});
  const {data:v}=await admin.from("criteria_set_versions").select("id,status").eq("id",version).maybeSingle();
  if(v?.status!=="PUBLISHED")return NextResponse.json({error:"Chỉ được tạo đợt từ bộ tiêu chí đã PUBLISHED."},{status:400});
 }
 if(recordType==="EXTERNAL_ASSESSMENT"&&!required("authority"))return NextResponse.json({error:"Cơ quan/đoàn đánh giá là bắt buộc."},{status:400});
 if(recordType==="AUDIT"&&!required("audit_type"))return NextResponse.json({error:"Loại Audit / Tracer là bắt buộc."},{status:400});
 if(recordType==="FEEDBACK"&&!required("description"))return NextResponse.json({error:"Nội dung phản ánh là bắt buộc."},{status:400});

 const {data:tx,error:txError}=await admin.rpc(CREATE_RPC,{
  p_actor_user_id:user.id,
  p_record_type:recordType,
  p_title:title,
  p_work_year:workYear,
  p_owner_department_id:ownerDepartmentId,
  p_owner_user_id:ownerUserId,
  p_fields:f
 });
 if(txError){
  const message=rpcErrorMessage(txError,"Không tạo được hồ sơ Registry.");
  return NextResponse.json({error:message},{status:/bắt buộc|không hợp lệ|không còn hoạt động|chưa gắn|ngoài phạm vi|published/i.test(String(txError.message||"").toLowerCase())?409:400});
 }
 const result=tx&&typeof tx==="object"?tx as Record<string,unknown>:{};
 const recordId=typeof result.record_id==="string"?result.record_id:null;
 const recordCode=typeof result.record_code==="string"?result.record_code:null;
 const domainId=typeof result.domain_id==="string"?result.domain_id:null;
 if(!recordId||!recordCode||!domainId)return NextResponse.json({error:"Kết quả tạo hồ sơ Registry không hợp lệ."},{status:409});
 return NextResponse.json({ok:true,record_id:recordId,record_code:recordCode,domain_id:domainId,transaction:"atomic"});
}
