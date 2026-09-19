import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await requireApiPermission("criteria.manage");if(!auth.ok)return auth.response;
  const {id}=await params;const body=await request.json().catch(()=>({}));const admin=createAdminClient();
  const {data:caller}=await admin.from("profiles").select("organization_id,is_active").eq("user_id",auth.user.id).maybeSingle();
  if(!caller?.organization_id||!caller.is_active)return NextResponse.json({error:"Tài khoản không hợp lệ."},{status:403});
  const {data:set}=await admin.from("criteria_sets").select("id,organization_id,is_active").eq("id",id).maybeSingle();
  if(!set||set.organization_id!==caller.organization_id)return NextResponse.json({error:"Không tìm thấy bộ tiêu chí."},{status:404});
  if(!set.is_active)return NextResponse.json({error:"Bộ tiêu chí đã ngưng áp dụng."},{status:409});
  const {data:versions,error:versionsError}=await admin.from("criteria_set_versions").select("id,version_no,status,effective_from").eq("criteria_set_id",id).order("version_no",{ascending:false});
  if(versionsError)return NextResponse.json({error:versionsError.message},{status:400});
  const existingDraft=(versions??[]).find((v:any)=>v.status==="DRAFT");
  if(existingDraft)return NextResponse.json({ok:true,existing:true,version_id:existingDraft.id,version_no:existingDraft.version_no});
  const source=(versions??[])[0] as any;if(!source)return NextResponse.json({error:"Bộ tiêu chí chưa có phiên bản nguồn."},{status:409});
  const versionNo=Math.max(...(versions??[]).map((v:any)=>Number(v.version_no)||0))+1;
  const effectiveFrom=String(body.effective_from||"").trim()||null;
  const {data:newVersion,error:newVersionError}=await admin.from("criteria_set_versions").insert({criteria_set_id:id,version_no:versionNo,status:"DRAFT",effective_from:effectiveFrom}).select("id,version_no").single();
  if(newVersionError||!newVersion)return NextResponse.json({error:newVersionError?.message||"Không tạo được phiên bản nháp."},{status:400});
  const {data:items,error:itemsError}=await admin.from("criteria_items").select("id,code,title,description,sequence_no,chapter_code,chapter_name,score_weight,is_core,is_mandatory,max_score,parent_criteria_item_id,item_type,is_active").eq("criteria_version_id",source.id).order("sequence_no");
  if(itemsError){await admin.from("criteria_set_versions").delete().eq("id",newVersion.id);return NextResponse.json({error:itemsError.message},{status:400});}
  const idMap=new Map<string,string>();const roots=(items??[]).filter((x:any)=>!x.parent_criteria_item_id);const children=(items??[]).filter((x:any)=>x.parent_criteria_item_id);
  for(const item of [...roots,...children] as any[]){
    const payload={criteria_version_id:newVersion.id,code:item.code,title:item.title,description:item.description,sequence_no:item.sequence_no,chapter_code:item.chapter_code,chapter_name:item.chapter_name,score_weight:item.score_weight,is_core:item.is_core,is_mandatory:item.is_mandatory,max_score:item.max_score,parent_criteria_item_id:item.parent_criteria_item_id?idMap.get(item.parent_criteria_item_id)||null:null,item_type:item.item_type|| (item.parent_criteria_item_id?"SUBITEM":"CRITERION"),is_active:item.is_active!==false};
    const {data:inserted,error}=await admin.from("criteria_items").insert(payload).select("id").single();
    if(error||!inserted){await admin.from("criteria_set_versions").delete().eq("id",newVersion.id);return NextResponse.json({error:error?.message||"Không sao chép được cấu trúc tiêu chí."},{status:400});}
    idMap.set(item.id,inserted.id);
  }
  return NextResponse.json({ok:true,existing:false,version_id:newVersion.id,version_no:newVersion.version_no,cloned_items:idMap.size});
}
