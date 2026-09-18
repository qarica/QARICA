import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const clean=(v:unknown)=>String(v??"").trim();

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await requireApiPermission("checklists.manage");if(!auth.ok)return auth.response;
 const {id}=await params;const body=await request.json().catch(()=>({}));const admin=createAdminClient();
 const {data:caller}=await admin.from("profiles").select("organization_id,is_active").eq("user_id",auth.user.id).maybeSingle();
 if(!caller?.organization_id||!caller.is_active)return NextResponse.json({error:"Tài khoản không hợp lệ."},{status:403});
 const {data:template}=await admin.from("checklist_templates").select("id,organization_id,owner_department_id,code,source_code,name,is_active").eq("id",id).maybeSingle();
 if(!template||template.organization_id!==caller.organization_id)return NextResponse.json({error:"Không tìm thấy mẫu bảng kiểm."},{status:404});
 const patch:any={updated_at:new Date().toISOString()};
 if(Object.prototype.hasOwnProperty.call(body,"name")){const name=clean(body.name);if(!name)return NextResponse.json({error:"Tên bảng kiểm không được để trống."},{status:400});patch.name=name;}
 if(Object.prototype.hasOwnProperty.call(body,"description"))patch.description=clean(body.description)||null;
 if(Object.prototype.hasOwnProperty.call(body,"short_name"))patch.short_name=clean(body.short_name)||null;
 if(Object.prototype.hasOwnProperty.call(body,"source_code"))patch.source_code=clean(body.source_code).toUpperCase()||null;
 if(Object.prototype.hasOwnProperty.call(body,"owner_department_id")){
   const deptId=clean(body.owner_department_id);if(!deptId)return NextResponse.json({error:"Cần chọn đơn vị quản lý."},{status:400});
   const {data:dept}=await admin.from("departments").select("id,organization_id,is_active").eq("id",deptId).maybeSingle();
   if(!dept?.is_active||dept.organization_id!==caller.organization_id)return NextResponse.json({error:"Đơn vị quản lý không hợp lệ."},{status:400});
   patch.owner_department_id=deptId;
 }
 if(Object.prototype.hasOwnProperty.call(body,"is_active"))patch.is_active=body.is_active===true;
 const {error}=await admin.from("checklist_templates").update(patch).eq("id",id);
 if(error)return NextResponse.json({error:error.message},{status:400});
 return NextResponse.json({ok:true});
}
