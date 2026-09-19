import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await requireApiPermission("criteria.manage");if(!auth.ok)return auth.response;
  const {id}=await params;const body=await request.json().catch(()=>({}));const versionId=String(body.version_id||"").trim();const admin=createAdminClient();
  if(!versionId)return NextResponse.json({error:"Thiếu phiên bản cần phát hành."},{status:400});
  const {data:caller}=await admin.from("profiles").select("organization_id,is_active").eq("user_id",auth.user.id).maybeSingle();
  if(!caller?.organization_id||!caller.is_active)return NextResponse.json({error:"Tài khoản không hợp lệ."},{status:403});
  const {data:set}=await admin.from("criteria_sets").select("id,organization_id,is_active").eq("id",id).maybeSingle();
  if(!set||set.organization_id!==caller.organization_id)return NextResponse.json({error:"Không tìm thấy bộ tiêu chí."},{status:404});
  const {data:version}=await admin.from("criteria_set_versions").select("id,version_no,status,effective_from").eq("id",versionId).eq("criteria_set_id",id).maybeSingle();
  if(!version||version.status!=="DRAFT")return NextResponse.json({error:"Chỉ phiên bản Nháp mới được phát hành."},{status:409});
  const {count}=await admin.from("criteria_items").select("id",{count:"exact",head:true}).eq("criteria_version_id",versionId).eq("is_active",true);
  if(!count)return NextResponse.json({error:"Phiên bản chưa có tiêu chí hoạt động."},{status:409});
  const effectiveFrom=version.effective_from||new Date().toISOString().slice(0,10);
  const previousTo=new Date(new Date(effectiveFrom+"T00:00:00Z").getTime()-86400000).toISOString().slice(0,10);
  await admin.from("criteria_set_versions").update({status:"RETIRED",effective_to:previousTo,updated_at:new Date().toISOString()}).eq("criteria_set_id",id).eq("status","PUBLISHED").neq("id",versionId);
  const {error}=await admin.from("criteria_set_versions").update({status:"PUBLISHED",effective_from:effectiveFrom,effective_to:null,published_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",versionId);
  if(error)return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json({ok:true,version_no:version.version_no,status:"PUBLISHED"});
}
