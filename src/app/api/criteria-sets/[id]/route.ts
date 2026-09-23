import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const clean=(value:unknown)=>String(value??"").trim();

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await requireApiPermission("criteria.manage");if(!auth.ok)return auth.response;
  const {id}=await params;const body=await request.json().catch(()=>({}));const admin=createAdminClient();
  const {data:caller}=await admin.from("profiles").select("organization_id,is_active").eq("user_id",auth.user.id).maybeSingle();
  if(!caller?.organization_id||!caller.is_active)return NextResponse.json({error:"Tài khoản không hợp lệ."},{status:403});
  const {data:row}=await admin.from("criteria_sets").select("id,organization_id,code,name,description,is_active").eq("id",id).maybeSingle();
  if(!row||row.organization_id!==caller.organization_id)return NextResponse.json({error:"Không tìm thấy bộ tiêu chí."},{status:404});
  const patch:any={updated_at:new Date().toISOString()};
  if(Object.prototype.hasOwnProperty.call(body,"name")){const name=clean(body.name);if(!name)return NextResponse.json({error:"Tên bộ tiêu chí không được để trống."},{status:400});patch.name=name;}
  if(Object.prototype.hasOwnProperty.call(body,"description"))patch.description=clean(body.description)||null;
  if(Object.prototype.hasOwnProperty.call(body,"code")){
    const code=clean(body.code).toUpperCase();if(!code)return NextResponse.json({error:"Mã bộ tiêu chí không được để trống."},{status:400});
    const {data:dup}=await admin.from("criteria_sets").select("id").eq("organization_id",caller.organization_id).eq("code",code).neq("id",id).maybeSingle();
    if(dup)return NextResponse.json({error:"Mã bộ tiêu chí đã tồn tại."},{status:409});patch.code=code;
  }
  if(Object.prototype.hasOwnProperty.call(body,"is_active"))patch.is_active=body.is_active===true;
  const {error}=await admin.from("criteria_sets").update(patch).eq("id",id);
  if(error)return NextResponse.json({error:error.message},{status:400});
  const {error:auditError}=await admin.from("audit_logs").insert({actor_user_id:auth.user.id,table_name:"criteria_sets",row_id:id,action_type:"CRITERIA_SET_UPDATE",old_value:{code:row.code,name:row.name,description:row.description,is_active:row.is_active},new_value:patch,request_meta:{source:"qlcl-ui"}});
  if(auditError)return NextResponse.json({error:`Đã cập nhật nhưng không ghi được audit trail: ${auditError.message}`},{status:500});
  return NextResponse.json({ok:true});
}
