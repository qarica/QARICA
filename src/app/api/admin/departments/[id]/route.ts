import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){
  const auth=await requireApiPermission("departments.manage");
  if(!auth.ok)return auth.response;

  const {id}=await context.params;
  const body=await request.json();
  const name=String(body.name||"").trim();
  const code=String(body.code||"").trim().toUpperCase();
  if(!name||!code)return NextResponse.json({error:"Tên và mã đơn vị là bắt buộc."},{status:400});
  if(body.parent_department_id===id)return NextResponse.json({error:"Đơn vị không thể là đơn vị cha của chính nó."},{status:400});

  const admin=createAdminClient();
  const {data:caller,error:callerError}=await admin
    .from("profiles")
    .select("organization_id,is_active")
    .eq("user_id",auth.user.id)
    .maybeSingle();
  if(callerError||!caller?.organization_id||!caller.is_active){
    return NextResponse.json({error:callerError?.message||"Tài khoản không hợp lệ hoặc chưa gắn tổ chức."},{status:403});
  }

  const {data:department,error:departmentError}=await admin
    .from("departments")
    .select("id,organization_id,code,name,short_name,department_type,parent_department_id,is_active")
    .eq("id",id)
    .eq("organization_id",caller.organization_id)
    .maybeSingle();
  if(departmentError)return NextResponse.json({error:departmentError.message},{status:400});
  if(!department)return NextResponse.json({error:"Không tìm thấy đơn vị trong tổ chức hiện tại."},{status:404});

  const parentDepartmentId=body.parent_department_id?String(body.parent_department_id):null;
  if(parentDepartmentId){
    const {data:parent,error:parentError}=await admin
      .from("departments")
      .select("id,organization_id,is_active")
      .eq("id",parentDepartmentId)
      .eq("organization_id",caller.organization_id)
      .maybeSingle();
    if(parentError)return NextResponse.json({error:parentError.message},{status:400});
    if(!parent||!parent.is_active)return NextResponse.json({error:"Đơn vị cha không hợp lệ, đã ngưng hoặc ngoài tổ chức hiện tại."},{status:400});
  }

  const {data:updated,error}=await admin
    .from("departments")
    .update({
      code,
      name,
      short_name:body.short_name||null,
      department_type:body.department_type||null,
      parent_department_id:parentDepartmentId,
      is_active:body.is_active!==false,
      updated_at:new Date().toISOString(),
    })
    .eq("id",id)
    .eq("organization_id",caller.organization_id)
    .select("id")
    .maybeSingle();

  if(error)return NextResponse.json({error:error.code==="23505"?"Mã đơn vị đã tồn tại.":error.message},{status:400});
  if(!updated)return NextResponse.json({error:"Đơn vị đã thay đổi hoặc không còn thuộc tổ chức hiện tại."},{status:409});

  const nextIsActive=body.is_active!==false;
  const {error:auditError}=await admin.from("audit_logs").insert({
    actor_user_id:auth.user.id,
    table_name:"departments",
    row_id:id,
    action_type:department.is_active&&!nextIsActive?"DEPARTMENT_DEACTIVATE":"DEPARTMENT_UPDATE",
    old_value:{code:department.code,name:department.name,short_name:department.short_name,department_type:department.department_type,parent_department_id:department.parent_department_id,is_active:department.is_active},
    new_value:{code,name,short_name:body.short_name||null,department_type:body.department_type||null,parent_department_id:parentDepartmentId,is_active:nextIsActive},
    reason:"Cập nhật khoa/phòng.",
    request_meta:{source:"qlcl-ui"},
  });
  if(auditError)return NextResponse.json({error:`Đã cập nhật nhưng không ghi được audit trail: ${auditError.message}`},{status:500});
  return NextResponse.json({ok:true});
}
