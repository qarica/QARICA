import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await requireApiPermission("indicators.manage");if(!auth.ok)return auth.response;
 const {id}=await params;const body=await request.json().catch(()=>({}));const admin=createAdminClient();
 const {data:caller}=await admin.from("profiles").select("organization_id,is_active").eq("user_id",auth.user.id).maybeSingle();
 if(!caller?.organization_id||!caller.is_active)return NextResponse.json({error:"Tài khoản không hợp lệ."},{status:403});
 const {data:def}=await admin.from("indicator_definitions").select("id,organization_id,is_active").eq("id",id).maybeSingle();
 if(!def||def.organization_id!==caller.organization_id)return NextResponse.json({error:"Không tìm thấy chỉ số."},{status:404});
 if(!def.is_active)return NextResponse.json({error:"Chỉ số đã ngưng áp dụng."},{status:409});
 const {data:versions,error}=await admin.from("indicator_definition_versions").select("id,version_no,status,calculation_type,desired_direction,frequency,unit,multiplier,effective_from").eq("indicator_definition_id",id).order("version_no",{ascending:false});
 if(error)return NextResponse.json({error:error.message},{status:400});
 const draft=(versions??[]).find((v:any)=>v.status==="DRAFT");if(draft)return NextResponse.json({ok:true,existing:true,version_id:draft.id,version_no:draft.version_no});
 const source=(versions??[])[0] as any;if(!source)return NextResponse.json({error:"Chỉ số chưa có phiên bản nguồn."},{status:409});
 const versionNo=Math.max(...(versions??[]).map((v:any)=>Number(v.version_no)||0))+1;
 const {data:newVersion,error:newError}=await admin.from("indicator_definition_versions").insert({
   indicator_definition_id:id,version_no:versionNo,status:"DRAFT",calculation_type:source.calculation_type,desired_direction:source.desired_direction,frequency:source.frequency,unit:source.unit,multiplier:source.multiplier,effective_from:String(body.effective_from||"").trim()||null
 }).select("id,version_no,status").single();
 if(newError||!newVersion)return NextResponse.json({error:newError?.message||"Không tạo được bản cập nhật chỉ số."},{status:400});
 return NextResponse.json({ok:true,existing:false,version_id:newVersion.id,version_no:newVersion.version_no});
}
