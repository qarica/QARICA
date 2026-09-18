import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { cleanPlanDraftActions, PLAN_TYPES } from "@/lib/plan-composer";
import { createAdminClient } from "@/lib/supabase/admin";

const text=(v:unknown)=>String(v??"").trim();
const list=(v:unknown)=>Array.isArray(v)?v.map(x=>text(x)).filter(Boolean).slice(0,100):[];

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await requireApiPermission("plans.manage");if(!auth.ok)return auth.response;
 const {id}=await params;const body=await request.json().catch(()=>({}));const admin=createAdminClient();
 const {data:program,error}=await auth.supabase.from("work_programs").select("id,record_id,workflow_status,revision_no").eq("id",id).maybeSingle();
 if(error||!program)return NextResponse.json({error:error?.message||"Không tìm thấy kế hoạch hoặc ngoài phạm vi truy cập."},{status:404});
 if(program.workflow_status!=="DRAFT")return NextResponse.json({error:"Chỉ kế hoạch Nháp hoặc được trả lại chỉnh sửa mới được sửa nội dung."},{status:409});
 const title=text(body.title),programType=text(body.program_type||"ANNUAL_PLAN"),generalObjective=text(body.general_objective),specificObjectives=list(body.specific_objectives),requirements=text(body.requirements),leadDepartmentIds=list(body.lead_department_ids),ownerUserIds=list(body.owner_user_ids),referenceIds=list(body.reference_ids),assignedGroupIds=list(body.assigned_group_ids),leadDepartmentId=leadDepartmentIds[0]||text(body.lead_department_id),ownerUserId=ownerUserIds[0]||text(body.owner_user_id)||null,startDate=text(body.start_date)||null,endDate=text(body.end_date)||null,draftActions=cleanPlanDraftActions(body.draft_actions);
 const normalizedLeadDepartmentIds=Array.from(new Set([leadDepartmentId,...leadDepartmentIds].filter(Boolean))).slice(0,50);
 const normalizedOwnerUserIds=Array.from(new Set([ownerUserId,...ownerUserIds].filter(Boolean) as string[])).slice(0,100);
 if(!title||!normalizedLeadDepartmentIds.length)return NextResponse.json({error:"Cần có tên kế hoạch và ít nhất một khoa/phòng chủ trì/phối hợp trước khi lưu."},{status:400});
 if(!PLAN_TYPES.has(programType))return NextResponse.json({error:"Loại kế hoạch không hợp lệ."},{status:400});
 if(startDate&&endDate&&endDate<startDate)return NextResponse.json({error:"Ngày kết thúc không được trước ngày bắt đầu."},{status:400});
 const {data:caller}=await admin.from("profiles").select("organization_id,is_active").eq("user_id",auth.user.id).maybeSingle();if(!caller?.organization_id||!caller.is_active)return NextResponse.json({error:"Tài khoản không hợp lệ."},{status:403});
 const {data:record}=await admin.from("records").select("id,organization_id,lifecycle_status").eq("id",program.record_id).maybeSingle();if(!record||record.organization_id!==caller.organization_id||record.lifecycle_status!=="ACTIVE")return NextResponse.json({error:"Kế hoạch không thuộc bệnh viện hiện tại."},{status:403});
 const [{data:validDepartments},{data:validOwners}]=await Promise.all([
  admin.from("departments").select("id").in("id",normalizedLeadDepartmentIds).eq("organization_id",caller.organization_id).eq("is_active",true),
  normalizedOwnerUserIds.length?admin.from("profiles").select("user_id").in("user_id",normalizedOwnerUserIds).eq("organization_id",caller.organization_id).eq("is_active",true):Promise.resolve({data:[]})
 ]);
 if((validDepartments??[]).length!==normalizedLeadDepartmentIds.length)return NextResponse.json({error:"Có khoa/phòng chủ trì hoặc phối hợp không hợp lệ."},{status:400});
 if((validOwners??[]).length!==normalizedOwnerUserIds.length)return NextResponse.json({error:"Có người phụ trách không hợp lệ."},{status:400});
 if(referenceIds.length){
  const {data:refs}=await admin.from("external_directives").select("id,record_id").in("id",referenceIds);
  if((refs??[]).length!==new Set(referenceIds).size)return NextResponse.json({error:"Có căn cứ văn bản không tồn tại."},{status:400});
  const recordIds=(refs??[]).map((x:any)=>x.record_id);
  const {data:refRecords}=await admin.from("records").select("id").in("id",recordIds).eq("organization_id",caller.organization_id).eq("lifecycle_status","ACTIVE");
  if((refRecords??[]).length!==recordIds.length)return NextResponse.json({error:"Có căn cứ văn bản nằm ngoài bệnh viện hoặc đã lưu trữ."},{status:400});
 }
 if(assignedGroupIds.length){
  const {data:groups}=await admin.from("work_groups").select("id").in("id",assignedGroupIds).eq("organization_id",caller.organization_id).eq("is_active",true);
  if((groups??[]).length!==new Set(assignedGroupIds).size)return NextResponse.json({error:"Có nhóm công tác không hợp lệ hoặc đã ngưng hoạt động."},{status:400});
 }

 for(let index=0;index<draftActions.length;index++){
  const action=draftActions[index];
  if(action.collaborating_department_ids.length){
   const {data:rows}=await admin.from("departments").select("id").in("id",action.collaborating_department_ids).eq("organization_id",caller.organization_id).eq("is_active",true);
   if((rows??[]).length!==new Set(action.collaborating_department_ids).size)return NextResponse.json({error:`Nhiệm vụ #${index+1}: có khoa/phòng phối hợp không hợp lệ.`},{status:400});
  }
  if(action.collaborating_user_ids.length){
   const {data:rows}=await admin.from("profiles").select("user_id").in("user_id",action.collaborating_user_ids).eq("organization_id",caller.organization_id).eq("is_active",true);
   if((rows??[]).length!==new Set(action.collaborating_user_ids).size)return NextResponse.json({error:`Nhiệm vụ #${index+1}: có người phối hợp không hợp lệ.`},{status:400});
  }
  if(action.collaborating_group_ids.length){
   const {data:rows}=await admin.from("work_groups").select("id").in("id",action.collaborating_group_ids).eq("organization_id",caller.organization_id).eq("is_active",true);
   if((rows??[]).length!==new Set(action.collaborating_group_ids).size)return NextResponse.json({error:`Nhiệm vụ #${index+1}: có nhóm phối hợp không hợp lệ hoặc đã ngưng.`},{status:400});
  }
  if(action.parent_client_id&&!draftActions.some((candidate)=>candidate.client_id===action.parent_client_id))return NextResponse.json({error:`Nhiệm vụ #${index+1}: nhiệm vụ cha không còn tồn tại.`},{status:400});
 }
 const {error:updateError}=await admin.from("work_programs").update({program_type:programType,general_objective:generalObjective,objective:generalObjective,specific_objectives:specificObjectives,requirements,draft_actions:draftActions,description:text(body.description)||null,start_date:startDate,end_date:endDate,lead_department_id:leadDepartmentId,lead_department_ids:normalizedLeadDepartmentIds,owner_user_id:ownerUserId,owner_user_ids:normalizedOwnerUserIds,assigned_group_ids:assignedGroupIds,returned_reason:null}).eq("id",id).eq("workflow_status","DRAFT");
 if(updateError)return NextResponse.json({error:updateError.message},{status:400});
 const {error:recordUpdateError}=await admin.from("records").update({title,owner_department_id:leadDepartmentId,owner_user_id:ownerUserId}).eq("id",program.record_id);if(recordUpdateError)return NextResponse.json({error:recordUpdateError.message},{status:400});
 const {error:clearRefError}=await admin.from("program_reference_links").delete().eq("program_id",id);if(clearRefError)return NextResponse.json({error:clearRefError.message},{status:400});
 if(referenceIds.length){
  const {error:refInsertError}=await admin.from("program_reference_links").insert(referenceIds.map((directiveId,index)=>({program_id:id,directive_id:directiveId,relation_type:"LEGAL_BASIS",sequence_no:index+1,created_by:auth.user.id})));
  if(refInsertError)return NextResponse.json({error:`Không lưu được căn cứ kế hoạch: ${refInsertError.message}`},{status:400});
 }
 await admin.from("audit_logs").insert({actor_user_id:auth.user.id,record_id:program.record_id,table_name:"work_programs",row_id:id,action_type:"UPDATE_PLAN_DRAFT",new_value:{revision_no:program.revision_no,program_type:programType,draft_action_count:draftActions.length,specific_objective_count:specificObjectives.length,lead_department_ids:normalizedLeadDepartmentIds,owner_user_ids:normalizedOwnerUserIds,assigned_group_ids:assignedGroupIds,reference_count:referenceIds.length},request_meta:{source:"qlcl-ui",composer:"v2"}});
 return NextResponse.json({ok:true});
}
