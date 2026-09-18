import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await requireApiPermission("checklists.manage");if(!auth.ok)return auth.response;
 const {id}=await params;const admin=createAdminClient();
 const {data:caller}=await admin.from("profiles").select("organization_id,is_active").eq("user_id",auth.user.id).maybeSingle();
 if(!caller?.organization_id||!caller.is_active)return NextResponse.json({error:"Tài khoản không hợp lệ."},{status:403});
 const {data:template}=await admin.from("checklist_templates").select("id,organization_id,owner_department_id,is_active").eq("id",id).maybeSingle();
 if(!template||template.organization_id!==caller.organization_id)return NextResponse.json({error:"Không tìm thấy mẫu bảng kiểm."},{status:404});
 if(!template.is_active)return NextResponse.json({error:"Mẫu bảng kiểm đã ngưng sử dụng."},{status:409});

 const {data:versions,error:versionError}=await admin.from("checklist_versions").select("id,version_no,status,scoring_method,effective_from").eq("checklist_template_id",id).order("version_no",{ascending:false});
 if(versionError)return NextResponse.json({error:versionError.message},{status:400});
 const draft=(versions??[]).find((v:any)=>v.status==="DRAFT");
 if(draft)return NextResponse.json({ok:true,existing:true,version_id:draft.id,version_no:draft.version_no});
 const source=(versions??[])[0] as any;if(!source)return NextResponse.json({error:"Mẫu bảng kiểm chưa có phiên bản nguồn."},{status:409});
 const versionNo=Math.max(...(versions??[]).map((v:any)=>Number(v.version_no)||0))+1;
 const {data:newVersion,error:newVersionError}=await admin.from("checklist_versions").insert({checklist_template_id:id,version_no:versionNo,status:"DRAFT",scoring_method:source.scoring_method}).select("id,version_no,status").single();
 if(newVersionError||!newVersion)return NextResponse.json({error:newVersionError?.message||"Không tạo được phiên bản nháp."},{status:400});

 const {data:sections,error:sectionsError}=await admin.from("checklist_sections").select("id,title,description,sequence_no").eq("checklist_version_id",source.id).order("sequence_no");
 if(sectionsError){await admin.from("checklist_versions").delete().eq("id",newVersion.id);return NextResponse.json({error:sectionsError.message},{status:400});}
 const sectionMap=new Map<string,string>();
 for(const section of (sections??[]) as any[]){
  const {data:inserted,error}=await admin.from("checklist_sections").insert({checklist_version_id:newVersion.id,title:section.title,description:section.description,sequence_no:section.sequence_no}).select("id").single();
  if(error||!inserted){await admin.from("checklist_versions").delete().eq("id",newVersion.id);return NextResponse.json({error:error?.message||"Không sao chép được nhóm mục."},{status:400});}
  sectionMap.set(section.id,inserted.id);
 }

 const {data:items,error:itemsError}=await admin.from("checklist_items").select("id,section_id,code,content,answer_type,sequence_no,is_required,is_critical,allow_na,na_reason_required,scoring_enabled,score_value,weight,evidence_required_on_fail,finding_on_fail,metadata").eq("checklist_version_id",source.id).order("sequence_no");
 if(itemsError){await admin.from("checklist_versions").delete().eq("id",newVersion.id);return NextResponse.json({error:itemsError.message},{status:400});}
 const itemMap=new Map<string,string>();
 for(const item of (items??[]) as any[]){
  const newSectionId=sectionMap.get(item.section_id);if(!newSectionId)continue;
  const {data:inserted,error}=await admin.from("checklist_items").insert({
   checklist_version_id:newVersion.id,section_id:newSectionId,code:item.code,content:item.content,answer_type:item.answer_type,sequence_no:item.sequence_no,
   is_required:item.is_required,is_critical:item.is_critical,allow_na:item.allow_na,na_reason_required:item.na_reason_required,scoring_enabled:item.scoring_enabled,
   score_value:item.score_value,weight:item.weight,evidence_required_on_fail:item.evidence_required_on_fail,finding_on_fail:item.finding_on_fail,metadata:item.metadata
  }).select("id").single();
  if(error||!inserted){await admin.from("checklist_versions").delete().eq("id",newVersion.id);return NextResponse.json({error:error?.message||"Không sao chép được tiêu chí bảng kiểm."},{status:400});}
  itemMap.set(item.id,inserted.id);
 }
 const sourceItemIds=Array.from(itemMap.keys());
 if(sourceItemIds.length){
  const {data:options,error:optionsError}=await admin.from("checklist_item_options").select("checklist_item_id,option_code,option_label,option_value,sort_order").in("checklist_item_id",sourceItemIds).order("sort_order");
  if(optionsError){await admin.from("checklist_versions").delete().eq("id",newVersion.id);return NextResponse.json({error:optionsError.message},{status:400});}
  const payload=(options??[]).map((option:any)=>({checklist_item_id:itemMap.get(option.checklist_item_id),option_code:option.option_code,option_label:option.option_label,option_value:option.option_value,sort_order:option.sort_order})).filter((x:any)=>x.checklist_item_id);
  if(payload.length){const {error}=await admin.from("checklist_item_options").insert(payload);if(error){await admin.from("checklist_versions").delete().eq("id",newVersion.id);return NextResponse.json({error:error.message},{status:400});}}
 }
 return NextResponse.json({ok:true,existing:false,version_id:newVersion.id,version_no:newVersion.version_no,section_count:sectionMap.size,item_count:itemMap.size});
}
