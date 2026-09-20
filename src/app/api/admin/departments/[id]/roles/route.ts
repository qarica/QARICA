import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED = new Set(["HEAD","QUALITY_NETWORK_MEMBER"]);

export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await requireApiPermission("departments.manage"); if(!auth.ok)return auth.response;
  const {id:departmentId}=await params; const body=await request.json();
  const headUserId=body.head_user_id?String(body.head_user_id):null;
  const networkUserIds=Array.from(new Set((Array.isArray(body.quality_network_user_ids)?body.quality_network_user_ids:[]).map(String).filter(Boolean)));
  const admin=createAdminClient();
  const {data:caller}=await admin.from("profiles").select("organization_id").eq("user_id",auth.user.id).maybeSingle();
  if(!caller?.organization_id)return NextResponse.json({error:"Tài khoản chưa gắn bệnh viện."},{status:403});
  const {data:department}=await admin.from("departments").select("id,organization_id,is_active").eq("id",departmentId).maybeSingle();
  if(!department||department.organization_id!==caller.organization_id)return NextResponse.json({error:"Khoa/Phòng không thuộc bệnh viện hiện tại."},{status:404});
  const userIds=Array.from(new Set([headUserId,...networkUserIds].filter(Boolean))) as string[];
  if(userIds.length){
    const {data:profiles,error}=await admin.from("profiles").select("user_id,organization_id,is_active").in("user_id",userIds);
    if(error)return NextResponse.json({error:error.message},{status:400});
    if((profiles??[]).length!==userIds.length||(profiles??[]).some(p=>p.organization_id!==caller.organization_id||!p.is_active))
      return NextResponse.json({error:"Có người dùng không hợp lệ, đã ngưng hoặc không thuộc bệnh viện."},{status:400});
  }
  const now=new Date().toISOString();
  const {error:disableError}=await admin.from("department_user_roles").update({is_active:false,valid_to:now,updated_at:now}).eq("department_id",departmentId).eq("organization_id",caller.organization_id).in("role_type",Array.from(ALLOWED)).eq("is_active",true);
  if(disableError)return NextResponse.json({error:disableError.message},{status:400});
  const rows:any[]=[];
  if(headUserId)rows.push({organization_id:caller.organization_id,department_id:departmentId,user_id:headUserId,role_type:"HEAD",is_primary:true,is_active:true,valid_from:now,created_by:auth.user.id});
  for(const userId of networkUserIds)rows.push({organization_id:caller.organization_id,department_id:departmentId,user_id:userId,role_type:"QUALITY_NETWORK_MEMBER",is_primary:false,is_active:true,valid_from:now,created_by:auth.user.id});
  if(rows.length){const {error}=await admin.from("department_user_roles").insert(rows);if(error)return NextResponse.json({error:error.message},{status:400});}
  return NextResponse.json({ok:true,complete:!!headUserId&&networkUserIds.length>0});
}
