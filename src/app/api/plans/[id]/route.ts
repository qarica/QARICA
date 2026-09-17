import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const text=(v:unknown)=>String(v??"").trim();
const list=(v:unknown)=>Array.isArray(v)?v.map(x=>text(x)).filter(Boolean).slice(0,100):[];
const tasks=(v:unknown)=>Array.isArray(v)?v.slice(0,300).map((x:any,i:number)=>({client_id:text(x?.client_id)||`draft-${i+1}`,title:text(x?.title),description:text(x?.description)||null,priority:text(x?.priority||"NORMAL").toUpperCase(),lead_department_id:text(x?.lead_department_id)||null,collaborating_department_ids:Array.isArray(x?.collaborating_department_ids)?x.collaborating_department_ids.filter((y:unknown)=>typeof y==="string"&&y):[],assignee_user_id:text(x?.assignee_user_id)||null,start_date:text(x?.start_date)||null,due_date:text(x?.due_date)||null,expected_result:text(x?.expected_result),verification_requirement:text(x?.verification_requirement)||null,milestone_group:text(x?.milestone_group)||null,is_required:x?.is_required!==false,criteria_refs:Array.isArray(x?.criteria_refs)?x.criteria_refs.slice(0,50):[]})):[];

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await requireApiPermission("plans.manage");if(!auth.ok)return auth.response;
 const {id}=await params;const body=await request.json().catch(()=>({}));const admin=createAdminClient();
 const {data:program,error}=await auth.supabase.from("work_programs").select("id,record_id,workflow_status,revision_no").eq("id",id).maybeSingle();
 if(error||!program)return NextResponse.json({error:error?.message||"Không tìm thấy kế hoạch hoặc ngoài phạm vi truy cập."},{status:404});
 if(program.workflow_status!=="DRAFT")return NextResponse.json({error:"Chỉ kế hoạch Nháp hoặc được trả lại chỉnh sửa mới được sửa nội dung."},{status:409});
 const title=text(body.title),generalObjective=text(body.general_objective),specificObjectives=list(body.specific_objectives),requirements=text(body.requirements),leadDepartmentId=text(body.lead_department_id),ownerUserId=text(body.owner_user_id)||null,startDate=text(body.start_date)||null,endDate=text(body.end_date)||null,draftActions=tasks(body.draft_actions);
 if(!title||!leadDepartmentId)return NextResponse.json({error:"Cần có tên kế hoạch và khoa/phòng chủ trì trước khi lưu."},{status:400});
 if(startDate&&endDate&&endDate<startDate)return NextResponse.json({error:"Ngày kết thúc không được trước ngày bắt đầu."},{status:400});
 const {data:caller}=await admin.from("profiles").select("organization_id,is_active").eq("user_id",auth.user.id).maybeSingle();if(!caller?.organization_id||!caller.is_active)return NextResponse.json({error:"Tài khoản không hợp lệ."},{status:403});
 const {data:record}=await admin.from("records").select("id,organization_id,lifecycle_status").eq("id",program.record_id).maybeSingle();if(!record||record.organization_id!==caller.organization_id||record.lifecycle_status!=="ACTIVE")return NextResponse.json({error:"Kế hoạch không thuộc bệnh viện hiện tại."},{status:403});
 const {data:dept}=await admin.from("departments").select("id,is_active").eq("id",leadDepartmentId).eq("organization_id",caller.organization_id).maybeSingle();if(!dept?.is_active)return NextResponse.json({error:"Khoa/phòng chủ trì không hợp lệ."},{status:400});
 const {error:updateError}=await admin.from("work_programs").update({general_objective:generalObjective,objective:generalObjective,specific_objectives:specificObjectives,requirements,draft_actions:draftActions,description:text(body.description)||null,start_date:startDate,end_date:endDate,lead_department_id:leadDepartmentId,owner_user_id:ownerUserId,returned_reason:null}).eq("id",id).eq("workflow_status","DRAFT");
 if(updateError)return NextResponse.json({error:updateError.message},{status:400});
 const {error:recordUpdateError}=await admin.from("records").update({title,owner_department_id:leadDepartmentId,owner_user_id:ownerUserId}).eq("id",program.record_id);if(recordUpdateError)return NextResponse.json({error:recordUpdateError.message},{status:400});
 await admin.from("audit_logs").insert({actor_user_id:auth.user.id,record_id:program.record_id,table_name:"work_programs",row_id:id,action_type:"UPDATE_PLAN_DRAFT",new_value:{revision_no:program.revision_no,draft_action_count:draftActions.length,specific_objective_count:specificObjectives.length},request_meta:{source:"qlcl-ui",composer:"v2"}});
 return NextResponse.json({ok:true});
}
