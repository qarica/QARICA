import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const FREQUENCIES=new Set(["DAILY","WEEKLY","MONTHLY","QUARTERLY","SEMIANNUAL","ANNUAL"]);
const uuid=(v:unknown)=>String(v??"").trim()||null;
const num=(v:unknown)=>v===null||v===undefined||String(v).trim()===""?null:Number(v);

export async function POST(request:Request){
 const auth=await requireApiPermission("indicators.manage"); if(!auth.ok)return auth.response;
 const body=await request.json().catch(()=>({})); const admin=createAdminClient();
 const versionId=uuid(body.indicator_version_id), departmentId=uuid(body.department_id), collectorId=uuid(body.collector_user_id);
 const year=Number(body.work_year), frequency=String(body.frequency||"MONTHLY").toUpperCase();
 const localTarget=num(body.local_target), targetLower=num(body.target_lower), targetUpper=num(body.target_upper);
 const activeFrom=String(body.active_from||"").trim()||null, activeTo=String(body.active_to||"").trim()||null;
 if(!versionId||!Number.isInteger(year)||year<2000||year>2100)return NextResponse.json({error:"Phiên bản hoặc năm phân công không hợp lệ."},{status:400});
 if(!FREQUENCIES.has(frequency))return NextResponse.json({error:"Tần suất không hợp lệ."},{status:400});
 if([localTarget,targetLower,targetUpper].some(v=>v!==null&&!Number.isFinite(v)))return NextResponse.json({error:"Mục tiêu/ngưỡng không hợp lệ."},{status:400});
 if(targetLower!==null&&targetUpper!==null&&targetLower>targetUpper)return NextResponse.json({error:"Ngưỡng dưới không được lớn hơn ngưỡng trên."},{status:400});
 if(activeFrom&&!/^\d{4}-\d{2}-\d{2}$/.test(activeFrom)||activeTo&&!/^\d{4}-\d{2}-\d{2}$/.test(activeTo))return NextResponse.json({error:"Ngày hiệu lực không hợp lệ."},{status:400});
 if(activeFrom&&activeTo&&activeTo<activeFrom)return NextResponse.json({error:"Ngày kết thúc không được trước ngày bắt đầu."},{status:400});
 const {data:caller}=await admin.from("profiles").select("organization_id,is_active").eq("user_id",auth.user.id).maybeSingle();
 const {data:version}=await admin.from("indicator_definition_versions").select("id,indicator_definition_id,status").eq("id",versionId).maybeSingle();
 if(!caller?.organization_id||!caller.is_active||!version||version.status!=="PUBLISHED")return NextResponse.json({error:"Chỉ được phân công phiên bản chỉ số đã phát hành."},{status:409});
 const {data:def}=await admin.from("indicator_definitions").select("organization_id").eq("id",version.indicator_definition_id).maybeSingle();
 if(!def||def.organization_id!==caller.organization_id)return NextResponse.json({error:"Chỉ số nằm ngoài phạm vi bệnh viện."},{status:403});
 if(departmentId){const {data:d}=await admin.from("departments").select("organization_id").eq("id",departmentId).maybeSingle();if(!d||d.organization_id!==caller.organization_id)return NextResponse.json({error:"Khoa/phòng không hợp lệ."},{status:403});}
 if(collectorId){const {data:p}=await admin.from("profiles").select("organization_id,is_active").eq("user_id",collectorId).maybeSingle();if(!p||!p.is_active||p.organization_id!==caller.organization_id)return NextResponse.json({error:"Người phụ trách không hợp lệ."},{status:403});}
 const {data:row,error}=await admin.from("indicator_assignments").insert({indicator_version_id:versionId,department_id:departmentId,collector_user_id:collectorId,work_year:year,frequency,local_target:localTarget,target_lower:targetLower,target_upper:targetUpper,status:"ACTIVE",active_from:activeFrom,active_to:activeTo,auto_create_periods:body.auto_create_periods===true,source_reference:String(body.source_reference||"").trim()||null}).select("id").single();
 if(error)return NextResponse.json({error:error.code==="23505"?"Phân công này đã tồn tại.":error.message},{status:error.code==="23505"?409:400});
 await admin.from("audit_logs").insert({actor_user_id:auth.user.id,table_name:"indicator_assignments",row_id:row.id,action_type:"CREATE_INDICATOR_ASSIGNMENT",new_value:{indicator_version_id:versionId,department_id:departmentId,collector_user_id:collectorId,work_year:year,frequency,local_target:localTarget,target_lower:targetLower,target_upper:targetUpper},request_meta:{source:"qlcl-ui"}});
 return NextResponse.json({ok:true,id:row.id});
}
