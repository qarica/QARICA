import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
const clean=(v:unknown)=>String(v??"").trim();
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await requireApiPermission("indicators.manage");if(!auth.ok)return auth.response;
 const {id}=await params;const body=await request.json().catch(()=>({}));const admin=createAdminClient();
 const {data:caller}=await admin.from("profiles").select("organization_id,is_active").eq("user_id",auth.user.id).maybeSingle();
 if(!caller?.organization_id||!caller.is_active)return NextResponse.json({error:"Tài khoản không hợp lệ."},{status:403});
 const {data:def}=await admin.from("indicator_definitions").select("id,organization_id,code,name,is_active").eq("id",id).maybeSingle();
 if(!def||def.organization_id!==caller.organization_id)return NextResponse.json({error:"Không tìm thấy chỉ số."},{status:404});
 const patch:any={updated_at:new Date().toISOString()};
 if(Object.prototype.hasOwnProperty.call(body,"name")){const name=clean(body.name);if(!name)return NextResponse.json({error:"Tên chỉ số không được để trống."},{status:400});patch.name=name;}
 if(Object.prototype.hasOwnProperty.call(body,"purpose"))patch.purpose=clean(body.purpose)||null;
 if(Object.prototype.hasOwnProperty.call(body,"quality_dimension"))patch.quality_dimension=clean(body.quality_dimension)||null;
 if(Object.prototype.hasOwnProperty.call(body,"code")){
   const code=clean(body.code).toUpperCase();if(!code)return NextResponse.json({error:"Mã chỉ số không được để trống."},{status:400});
   const {data:dup}=await admin.from("indicator_definitions").select("id").eq("organization_id",caller.organization_id).eq("code",code).neq("id",id).maybeSingle();
   if(dup)return NextResponse.json({error:"Mã chỉ số đã tồn tại."},{status:409});patch.code=code;
 }
 if(Object.prototype.hasOwnProperty.call(body,"is_active"))patch.is_active=body.is_active===true;
 const {error}=await admin.from("indicator_definitions").update(patch).eq("id",id);
 if(error)return NextResponse.json({error:error.message},{status:400});
 return NextResponse.json({ok:true});
}
