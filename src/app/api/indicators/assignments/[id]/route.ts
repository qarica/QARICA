import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const FREQUENCIES=new Set(["DAILY","WEEKLY","MONTHLY","QUARTERLY","SEMIANNUAL","ANNUAL"]);
const num=(v:unknown)=>v===null||v===undefined||String(v).trim()===""?null:Number(v);

async function context(id:string,userId:string){
 const admin=createAdminClient();
 const {data:caller}=await admin.from("profiles").select("organization_id,is_active").eq("user_id",userId).maybeSingle();
 const {data:row}=await admin.from("indicator_assignments").select("*,indicator_definition_versions!inner(indicator_definitions!inner(organization_id))").eq("id",id).maybeSingle();
 const org=(row as any)?.indicator_definition_versions?.indicator_definitions?.organization_id;
 return {admin,caller,row,valid:!!caller?.is_active&&!!caller?.organization_id&&org===caller.organization_id};
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await requireApiPermission("indicators.manage"); if(!auth.ok)return auth.response;
 const {id}=await params; const body=await request.json().catch(()=>({})); const {admin,row,valid}=await context(id,auth.user.id);
 if(!row)return NextResponse.json({error:"Không tìm thấy phân công chỉ số."},{status:404});
 if(!valid)return NextResponse.json({error:"Phân công nằm ngoài phạm vi bệnh viện."},{status:403});
 if(row.status==="INACTIVE")return NextResponse.json({error:"Phân công đã ngưng; không chỉnh sửa trực tiếp."},{status:409});
 const patch:any={};
 if(body.frequency!==undefined){const f=String(body.frequency).toUpperCase();if(!FREQUENCIES.has(f))return NextResponse.json({error:"Tần suất không hợp lệ."},{status:400});patch.frequency=f;}
 for(const k of ["local_target","target_lower","target_upper"]){if(body[k]!==undefined){const v=num(body[k]);if(v!==null&&!Number.isFinite(v))return NextResponse.json({error:"Mục tiêu/ngưỡng không hợp lệ."},{status:400});patch[k]=v;}}
 if(body.active_from!==undefined)patch.active_from=String(body.active_from||"").trim()||null;
 if(body.active_to!==undefined)patch.active_to=String(body.active_to||"").trim()||null;
 if(body.auto_create_periods!==undefined)patch.auto_create_periods=body.auto_create_periods===true;
 if(body.source_reference!==undefined)patch.source_reference=String(body.source_reference||"").trim()||null;
 const lower=patch.target_lower!==undefined?patch.target_lower:row.target_lower, upper=patch.target_upper!==undefined?patch.target_upper:row.target_upper;
 const from=patch.active_from!==undefined?patch.active_from:row.active_from, to=patch.active_to!==undefined?patch.active_to:row.active_to;
 if(lower!==null&&upper!==null&&Number(lower)>Number(upper))return NextResponse.json({error:"Ngưỡng dưới không được lớn hơn ngưỡng trên."},{status:400});
 if(from&&to&&to<from)return NextResponse.json({error:"Ngày kết thúc không được trước ngày bắt đầu."},{status:400});
 const {error}=await admin.from("indicator_assignments").update(patch).eq("id",id); if(error)return NextResponse.json({error:error.message},{status:400});
 await admin.from("audit_logs").insert({actor_user_id:auth.user.id,table_name:"indicator_assignments",row_id:id,action_type:"UPDATE_INDICATOR_ASSIGNMENT",old_value:row,new_value:patch,request_meta:{source:"qlcl-ui"}});
 return NextResponse.json({ok:true});
}
export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await requireApiPermission("indicators.manage"); if(!auth.ok)return auth.response;
 const {id}=await params; const {admin,row,valid}=await context(id,auth.user.id);
 if(!row)return NextResponse.json({error:"Không tìm thấy phân công chỉ số."},{status:404});
 if(!valid)return NextResponse.json({error:"Phân công nằm ngoài phạm vi bệnh viện."},{status:403});
 if(row.status==="INACTIVE")return NextResponse.json({ok:true,unchanged:true});
 const today=new Date().toISOString().slice(0,10);
 const {error}=await admin.from("indicator_assignments").update({status:"INACTIVE",auto_create_periods:false,active_to:row.active_to&&row.active_to<today?row.active_to:today}).eq("id",id);
 if(error)return NextResponse.json({error:error.message},{status:400});
 await admin.from("audit_logs").insert({actor_user_id:auth.user.id,table_name:"indicator_assignments",row_id:id,action_type:"DEACTIVATE_INDICATOR_ASSIGNMENT",old_value:{status:row.status},new_value:{status:"INACTIVE",auto_create_periods:false,active_to:today},request_meta:{source:"qlcl-ui"}});
 return NextResponse.json({ok:true});
}
