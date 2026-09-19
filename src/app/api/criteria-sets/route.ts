import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const clean=(value:unknown)=>String(value??"").trim();

export async function POST(request:Request){
  const auth=await requireApiPermission("criteria.manage");if(!auth.ok)return auth.response;
  const body=await request.json().catch(()=>({}));
  const name=clean(body.name),description=clean(body.description)||null,effectiveFrom=clean(body.effective_from)||null;
  let code=clean(body.code).toUpperCase();
  if(!name)return NextResponse.json({error:"Tên bộ tiêu chí là bắt buộc."},{status:400});
  const admin=createAdminClient();
  const {data:caller,error:callerError}=await admin.from("profiles").select("organization_id,is_active").eq("user_id",auth.user.id).maybeSingle();
  if(callerError||!caller?.organization_id||!caller.is_active)return NextResponse.json({error:callerError?.message||"Tài khoản không hợp lệ hoặc chưa gắn bệnh viện."},{status:403});
  if(!code){
    const {data:generated,error:codeError}=await admin.rpc("qlcl_next_master_code_v1",{p_org:caller.organization_id,p_kind:"CRITERIA_SET",p_work_year:new Date().getFullYear()});
    if(codeError||!generated)return NextResponse.json({error:codeError?.message||"Không sinh được mã bộ tiêu chí."},{status:400});
    code=String(generated);
  }
  const {data:duplicate}=await admin.from("criteria_sets").select("id").eq("organization_id",caller.organization_id).eq("code",code).maybeSingle();
  if(duplicate)return NextResponse.json({error:"Mã bộ tiêu chí đã tồn tại."},{status:409});
  const {data:set,error:setError}=await admin.from("criteria_sets").insert({organization_id:caller.organization_id,code,name,description,is_active:true,updated_at:new Date().toISOString()}).select("id,code,name").single();
  if(setError||!set)return NextResponse.json({error:setError?.message||"Không tạo được bộ tiêu chí."},{status:400});
  const {data:version,error:versionError}=await admin.from("criteria_set_versions").insert({criteria_set_id:set.id,version_no:1,status:"DRAFT",effective_from:effectiveFrom}).select("id,version_no,status").single();
  if(versionError||!version){await admin.from("criteria_sets").delete().eq("id",set.id);return NextResponse.json({error:versionError?.message||"Không tạo được phiên bản đầu tiên."},{status:400});}
  return NextResponse.json({ok:true,id:set.id,code:set.code,name:set.name,version_id:version.id,version_no:version.version_no,status:version.status});
}
