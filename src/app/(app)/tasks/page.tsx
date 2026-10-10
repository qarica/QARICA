import Link from "next/link";
import { Icon } from "@/components/icon";
import { WorkRowCheckbox, WorkRowSelectionProvider, WorkSelectionCount } from "@/components/work-row-checkbox";
import { MyWorkSyncClient } from "@/components/my-work-sync-client";
import { PageHeader } from "@/components/page-header";
import { PersonalReminders } from "@/components/personal-reminders";
import { RECORD_TYPE_LABEL } from "@/components/record-traceability-panel";
import { ReminderRowDelete } from "@/components/reminder-row-delete";
import { StatusBadge } from "@/components/status-badge";
import { hasPermission, requirePermission, requireUserContext } from "@/lib/auth";
import { EMR_CATEGORIES } from "@/lib/emr-categories";
import { formatDate } from "@/lib/format";
import { hcmDateKey } from "@/lib/hcm-date";
import { isOperationallyHiddenStatus } from "@/lib/operational-record";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";

function hcmToday(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}).format(new Date())}
// Note cá nhân lưu due_at là mốc UTC của "nửa đêm giờ VN" (xem personal-reminders.tsx:
// new Date(`${due}T00:00:00`).toISOString()) — cắt chuỗi 10 ký tự đầu lấy ngày UTC sẽ lùi
// 1 ngày so với ngày người dùng chọn (UTC+7). Phải quy đổi theo giờ VN, không cắt chuỗi.
function dateOnly(value:string){return value.length>10?(hcmDateKey(value)||value.slice(0,10)):value}
const WEEKDAYS=["T2","T3","T4","T5","T6","T7","CN"];
const MONTH_NAMES=["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6","Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"];
function priorityLabel(value?:string|null){if(value==="CRITICAL")return"Rất khẩn";if(value==="URGENT")return"Khẩn";if(value==="HIGH")return"Cao";if(value==="LOW")return"Thấp";return"Bình thường"}
function priorityTone(value?:string|null){if(["CRITICAL","URGENT"].includes(String(value)))return"danger";if(value==="HIGH")return"warning";if(value==="LOW")return"muted";return"info"}
function workCue(row:any){const days=Number(row.days_to_due||0);if(row.is_overdue){const late=Math.abs(days);if(late>=7)return`Đôn đốc ngay · quá hạn ${late} ngày`;return`Xử lý ngay · quá hạn ${late} ngày`}if(["EVIDENCE_SUBMITTED","VERIFYING"].includes(String(row.workflow_status)))return"Cần kiểm tra / xác minh";if(row.workflow_status==="RETURNED")return"Cần bổ sung sau khi bị trả lại";if(days===0)return"Hoàn tất trong hôm nay";if(days>0&&days<=3)return`Chuẩn bị xử lý · còn ${days} ngày`;if(["CRITICAL","URGENT"].includes(String(row.priority)))return"Ưu tiên xử lý sớm";return days>0?`Theo dõi · còn ${days} ngày`:"Cần kiểm tra tiến độ"}
function workScore(row:any){const days=Number(row.days_to_due||0);let score=0;if(row.is_overdue)score+=200+Math.abs(days)*5;if(row.workflow_status==="RETURNED")score+=150;if(["EVIDENCE_SUBMITTED","VERIFYING"].includes(String(row.workflow_status)))score+=135;if(days===0)score+=160;if(days>0&&days<=3)score+=100;if(row.priority==="CRITICAL")score+=90;else if(row.priority==="URGENT")score+=70;else if(row.priority==="HIGH")score+=40;return score}
const ACTION_SELECT="action_id,record_id,record_code,title,work_year,workflow_status,priority,due_date,is_overdue,days_to_due,lead_department_id,assignee_user_id,assignment_target_type,assignee_group_id";

export default async function TasksPage({searchParams}:{searchParams:Promise<{tab?:string;q?:string;page?:string}>}){
 const {user}=await requireUserContext();requirePermission(user,"tasks.view");const year=await getWorkYear();const supabase=await createClient();const today=hcmToday();
 const {tab:rawTab,q:rawQ,page:rawPage}=await searchParams;
 const tab=(["ALL","REMINDER","ASSIGNED","WATCH","DONE"].includes(String(rawTab).toUpperCase())?String(rawTab).toUpperCase():"ALL") as "ALL"|"REMINDER"|"ASSIGNED"|"WATCH"|"DONE";
 const searchQuery=String(rawQ||"").trim();
 const page=Math.max(1,Number(rawPage)||1);
 const PAGE_SIZE=10;
 const isQlcl=user.roleCodes.includes("QLCL_MANAGER")||user.roleCodes.includes("HOI_DONG_QLCL");const isDepartmentHead=user.roleCodes.includes("DEPARTMENT_HEAD");const isBoard=user.roleCodes.includes("BAN_GIAM_DOC");
 const groupAssignmentRes=await supabase
  .from("work_group_assignment_snapshots")
  .select("target_record_id,group_id,member_snapshot")
  .eq("assignment_role","ACTION_ASSIGNEE_GROUP");
 const myGroupActionRecordIds=Array.from(new Set((groupAssignmentRes.data??[]).filter((row:any)=>Array.isArray(row.member_snapshot)&&row.member_snapshot.some((member:any)=>member?.user_id===user.id)).map((row:any)=>row.target_record_id).filter(Boolean))) as string[];
 const departmentRoleRes=user.primaryDepartmentId?await supabase.from("department_user_roles").select("role_type").eq("department_id",user.primaryDepartmentId).eq("user_id",user.id).eq("is_active",true).in("role_type",["HEAD","QUALITY_NETWORK_MEMBER"]):{data:[],error:null};
 const canOperateDepartment=!!user.primaryDepartmentId&&(departmentRoleRes.data??[]).length>0;
 const departmentExecutionRes=canOperateDepartment?await supabase.from("action_department_executions").select("action_id,workflow_status").eq("department_id",user.primaryDepartmentId):{data:[],error:null};
 const departmentActionIds=Array.from(new Set((departmentExecutionRes.data??[]).map((x:any)=>x.action_id).filter(Boolean))) as string[];
 const recurringLegacyRes=await supabase.from("recurring_work_runs").select("generated_action_id,recurring_work_templates!inner(automation_kind)").not("generated_action_id","is",null).eq("recurring_work_templates.automation_kind","REMINDER");
 const legacyReminderActionIds=new Set((recurringLegacyRes.data??[]).map((x:any)=>x.generated_action_id).filter(Boolean));
 const [directActionsRes,groupActionsRes,departmentActionsRes,attentionRes,personalRemindersRes]=await Promise.all([
  supabase.from("vw_actions_dashboard").select(ACTION_SELECT).eq("work_year",year).eq("assignee_user_id",user.id).order("due_date",{ascending:true,nullsFirst:false}),
  myGroupActionRecordIds.length
   ? supabase.from("vw_actions_dashboard").select(ACTION_SELECT).eq("work_year",year).in("record_id",myGroupActionRecordIds).order("due_date",{ascending:true,nullsFirst:false})
   : Promise.resolve({data:[] as any[],error:null}),
  departmentActionIds.length
   ? supabase.from("vw_actions_dashboard").select(ACTION_SELECT).eq("work_year",year).in("action_id",departmentActionIds).order("due_date",{ascending:true,nullsFirst:false})
   : Promise.resolve({data:[] as any[],error:null}),
  supabase.from("notifications").select("id,title,message,priority,target_route,target_record_id,created_at,is_read").eq("recipient_user_id",user.id).eq("is_read",false).order("created_at",{ascending:false}).limit(20),
  supabase.from("personal_reminders").select("id,title,note,due_at,priority,status").eq("owner_user_id",user.id).neq("status","CANCELLED").order("due_at",{ascending:true,nullsFirst:false}),
 ]);
 // Hạng mục dự án EMR của khoa/phòng mình, còn mở và có hạn — để người vừa
 // phụ trách QLCL vừa EMR thấy việc EMR ngay ở "Việc của tôi" thay vì phải
 // mở riêng menu EMR mới biết. emr_rollout_items vẫn là nguồn dữ liệu duy
 // nhất (không copy sang bảng khác); lọc theo khoa/phòng ở client, giống
 // cách route dashboard EMR đã làm, vì cột department_ids là mảng.
 const emrItemsRes=hasPermission(user,"emr.view")&&user.organizationId
  ?await supabase.from("emr_rollout_items").select("id,category,title,status,due_date,priority,owner_department_id,department_ids,publish_status").eq("organization_id",user.organizationId).neq("status","DONE").not("due_date","is",null)
  :{data:[] as any[],error:null};
 // Báo cáo thực tế "Tổng quan EMR chưa đồng bộ": Biểu mẫu còn Nháp (chưa
 // duyệt phát hành) chưa được coi là đang triển khai chính thức — loại khỏi
 // "Việc của tôi" (KPI + danh sách), nhất quán với Tổng quan EMR, lịch và
 // nhắc hạn.
 const myEmrItems=user.primaryDepartmentId
  ?(emrItemsRes.data??[]).filter((item:any)=>!(item.category==="BIEU_MAU"&&item.publish_status==="DRAFT")&&(item.owner_department_id===user.primaryDepartmentId||item.department_ids?.includes(user.primaryDepartmentId)))
  :[];
 const actionRowsById=new Map<string,any>();
 for(const row of [...(directActionsRes.data??[]),...(groupActionsRes.data??[]),...(departmentActionsRes.data??[])])actionRowsById.set((row as any).action_id,row);
 const actionsRes={data:Array.from(actionRowsById.values()),error:directActionsRes.error||groupActionsRes.error||departmentActionsRes.error||groupAssignmentRes.error||departmentRoleRes.error||departmentExecutionRes.error};
 let scopeActionsRes:any={data:[] as any[],error:null};
 if(isQlcl){scopeActionsRes=await supabase.from("vw_actions_dashboard").select(ACTION_SELECT).eq("work_year",year).order("due_date",{ascending:true,nullsFirst:false});}
 else if(isDepartmentHead&&user.primaryDepartmentId){const leadScopeRes=await supabase.from("vw_actions_dashboard").select(ACTION_SELECT).eq("work_year",year).eq("lead_department_id",user.primaryDepartmentId).order("due_date",{ascending:true,nullsFirst:false});const executionScopeRes=departmentActionIds.length?await supabase.from("vw_actions_dashboard").select(ACTION_SELECT).eq("work_year",year).in("action_id",departmentActionIds).order("due_date",{ascending:true,nullsFirst:false}):{data:[] as any[],error:null};const scopedById=new Map<string,any>();for(const row of [...(leadScopeRes.data??[]),...(executionScopeRes.data??[])])scopedById.set((row as any).action_id,row);scopeActionsRes={data:Array.from(scopedById.values()),error:leadScopeRes.error||executionScopeRes.error};}
 const sourceRows=(actionsRes.data??[]) as any[];const scopeSourceRows=(scopeActionsRes.data??[]) as any[];const recordIds=Array.from(new Set([...sourceRows,...scopeSourceRows].map(r=>r.record_id).filter(Boolean)));const recordRes=recordIds.length?await supabase.from("records").select("id,lifecycle_status,record_type,record_code,created_by").in("id",recordIds):{data:[],error:null};const hidden=new Set((recordRes.data??[]).filter((r:any)=>isOperationallyHiddenStatus(r.lifecycle_status)).map((r:any)=>r.id));const recordTypeMap=new Map((recordRes.data??[]).map((r:any)=>[r.id,r.record_type]));const recordCodeMap=new Map((recordRes.data??[]).map((r:any)=>[r.id,r.record_code]));
 const creatorIds=Array.from(new Set((recordRes.data??[]).map((r:any)=>r.created_by).filter(Boolean))) as string[];
 const creatorsRes=creatorIds.length?await supabase.from("profiles").select("user_id,full_name,email").in("user_id",creatorIds):{data:[],error:null};
 const creatorNameMap=new Map((creatorsRes.data??[]).map((p:any)=>[p.user_id,p.full_name||p.email]));
 const recordCreatedByMap=new Map((recordRes.data??[]).map((r:any)=>[r.id,r.created_by]));
 const createdByForRecord=(recordId:string)=>{const creatorId=recordCreatedByMap.get(recordId);return creatorId?creatorNameMap.get(creatorId)||"—":"—"};
 const roleDepartmentIds=Array.from(new Set([...scopeSourceRows.map(r=>r.lead_department_id),user.primaryDepartmentId].filter(Boolean)));const roleDepartmentsRes=roleDepartmentIds.length?await supabase.from("departments").select("id,name,short_name").in("id",roleDepartmentIds):{data:[],error:null};const roleDepartmentMap=new Map((roleDepartmentsRes.data??[]).map((d:any)=>[d.id,d.short_name||d.name]));
 const assignedGroupIds=Array.from(new Set([...sourceRows,...scopeSourceRows].map((r:any)=>r.assignee_group_id).filter(Boolean))) as string[];const assignedGroupsRes=assignedGroupIds.length?await supabase.from("work_groups").select("id,name,code").in("id",assignedGroupIds):{data:[],error:null};const assignedGroupMap=new Map((assignedGroupsRes.data??[]).map((g:any)=>[g.id,[g.code,g.name].filter(Boolean).join(" · ")]));
 const rows=sourceRows.filter(r=>r.workflow_status!=="CANCELLED"&&!hidden.has(r.record_id)&&!legacyReminderActionIds.has(r.action_id));const attention=(attentionRes.data??[]) as any[];const personalReminders=(personalRemindersRes.data??[]) as any[];const scopedRows=scopeSourceRows.filter(r=>!["COMPLETED","CANCELLED","CLOSED","NOT_APPLICABLE"].includes(String(r.workflow_status))&&!hidden.has(r.record_id)&&!legacyReminderActionIds.has(r.action_id));const firstError=actionsRes.error||attentionRes.error||personalRemindersRes.error||scopeActionsRes.error||recordRes.error||roleDepartmentsRes.error||assignedGroupsRes.error||recurringLegacyRes.error||emrItemsRes.error;
 // EMR items chưa DONE được tính gộp vào 4 KPI đầu (quá hạn/đến hạn/sắp tới/
 // đang mở) — không tính vào "Hoàn thành" vì emrItemsRes chỉ tải các mục
 // chưa DONE (không có lịch sử hoàn thành để đếm ở đây).
 const emrKpiRows=myEmrItems.map((item:any)=>{const isOverdue=!!item.due_date&&item.due_date<today;const daysToDue=item.due_date?Math.round((new Date(`${item.due_date}T00:00:00Z`).getTime()-new Date(`${today}T00:00:00Z`).getTime())/86400000):null;return{is_overdue:isOverdue,days_to_due:daysToDue,workflow_status:item.status};});
 const kpiRows=[...rows,...emrKpiRows];
 const overdue=kpiRows.filter(r=>r.is_overdue).length,dueToday=kpiRows.filter(r=>!r.is_overdue&&Number(r.days_to_due)===0).length,dueSoon=kpiRows.filter(r=>!r.is_overdue&&Number(r.days_to_due)>0&&Number(r.days_to_due)<=7).length,open=kpiRows.filter(r=>!["COMPLETED","CANCELLED","CLOSED"].includes(r.workflow_status)).length,completed=rows.filter(r=>r.workflow_status==="COMPLETED").length;
 const overdue7=rows.filter(r=>r.is_overdue&&Math.abs(Number(r.days_to_due||0))>=7).length;
 const secretaryQueue=[...rows].filter(r=>!["COMPLETED","CLOSED"].includes(r.workflow_status)).sort((a,b)=>workScore(b)-workScore(a)).slice(0,6);
 const roleQueue=[...scopedRows].filter(r=>r.is_overdue||Number(r.days_to_due)===0||(Number(r.days_to_due)>0&&Number(r.days_to_due)<=3)||["RETURNED","EVIDENCE_SUBMITTED","VERIFYING"].includes(String(r.workflow_status))||["CRITICAL","URGENT"].includes(String(r.priority))).sort((a,b)=>workScore(b)-workScore(a)).slice(0,8);
 const roleQueueTitle=isQlcl?"Hàng đợi điều phối QLCL":isDepartmentHead?"Hàng đợi của khoa/phòng":"";
 const attentionTitle=isBoard?"Cần theo dõi / quyết định":isQlcl?"Hồ sơ cần QLCL xử lý / xác minh":isDepartmentHead?"Hồ sơ khoa/phòng cần xử lý":"Cần tôi xử lý / xác minh";
 const roleViewLabel=isBoard?"BAN GIÁM ĐỐC":isQlcl?"QLCL":isDepartmentHead?"TRƯỞNG KHOA/PHÒNG":"CÁ NHÂN";
 const secretaryHeadline=overdue7>0?`${overdue7} việc đã quá hạn từ 7 ngày trở lên cần đôn đốc ngay.`:overdue>0?`${overdue} việc đang quá hạn; ưu tiên xử lý trước các công việc mới.`:dueToday>0?`${dueToday} việc đến hạn hôm nay cần hoàn tất trước cuối ngày.`:attention.length>0?`${attention.length} hồ sơ/thông báo đang chờ bạn xử lý.`:"Không có việc cá nhân quá hạn. Tiếp tục theo dõi hàng đợi nghiệp vụ theo vai trò.";

 const openRows=rows.filter(r=>!["COMPLETED","CANCELLED","CLOSED"].includes(r.workflow_status));

 type UnifiedRow={key:string;title:string;typeLabel:string;relatedTo:string;priority:string|null;dueDate:string|null;statusLabel:string;isOverdue:boolean;isDone:boolean;isWatch:boolean;assignedBy:string;href:string;source:"action"|"reminder"|"emr"};
 const unifiedActionRows:UnifiedRow[]=rows.map(r=>({
  key:`a-${r.action_id}`,title:r.title,typeLabel:RECORD_TYPE_LABEL[recordTypeMap.get(r.record_id)||""]||"—",
  relatedTo:recordCodeMap.get(r.record_id)||"—",priority:r.priority,dueDate:r.due_date,
  statusLabel:r.is_overdue?"OVERDUE":r.workflow_status,isOverdue:!!r.is_overdue,isDone:r.workflow_status==="COMPLETED",
  isWatch:!r.is_overdue&&!["COMPLETED","CANCELLED","CLOSED"].includes(r.workflow_status)&&Number(r.days_to_due)>0,
  assignedBy:createdByForRecord(r.record_id),href:`/tasks/${r.record_id}`,source:"action",
 }));
 const unifiedReminderRows:UnifiedRow[]=personalReminders.map((p:any)=>({
  key:`p-${p.id}`,title:p.title,typeLabel:"Note cá nhân",relatedTo:"—",priority:p.priority,
  dueDate:p.due_at?dateOnly(p.due_at):null,statusLabel:p.status==="COMPLETED"?"COMPLETED":(p.due_at&&dateOnly(p.due_at)<today?"OVERDUE":p.status),
  isOverdue:p.status==="OPEN"&&!!p.due_at&&dateOnly(p.due_at)<today,isDone:p.status==="COMPLETED",
  isWatch:p.status==="OPEN"&&(!p.due_at||dateOnly(p.due_at)>=today),
  assignedBy:"—",href:"/tasks",source:"reminder",
 }));
 const unifiedEmrRows:UnifiedRow[]=myEmrItems.map((item:any)=>{
  const category=EMR_CATEGORIES.find(c=>c.code===item.category);
  const overdueItem=!!item.due_date&&item.due_date<today;
  return{
   key:`e-${item.id}`,title:item.title,typeLabel:`EMR · ${category?.label||item.category}`,
   relatedTo:category?.label||"EMR",priority:item.priority,dueDate:item.due_date,
   statusLabel:overdueItem?"OVERDUE":item.status,isOverdue:overdueItem,isDone:false,
   isWatch:!overdueItem,assignedBy:"—",href:category?`/emr/${category.slug}`:"/emr",source:"emr",
  };
 });
 const unifiedAssignedRows=[...unifiedActionRows,...unifiedEmrRows];
 const allWorkRows=[...unifiedAssignedRows,...unifiedReminderRows].sort((a,b)=>(a.dueDate||"9999").localeCompare(b.dueDate||"9999"));
 const byTab=tab==="REMINDER"?unifiedReminderRows:tab==="ASSIGNED"?unifiedAssignedRows:tab==="WATCH"?allWorkRows.filter(r=>r.isWatch):tab==="DONE"?allWorkRows.filter(r=>r.isDone):allWorkRows;
 const searched=searchQuery?byTab.filter(r=>r.title.toLowerCase().includes(searchQuery.toLowerCase())||r.relatedTo.toLowerCase().includes(searchQuery.toLowerCase())):byTab;
 const totalPages=Math.max(1,Math.ceil(searched.length/PAGE_SIZE));
 const currentPage=Math.min(page,totalPages);
 const tableRowsPage=searched.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
 const tabHref=(t:string)=>`?tab=${t}${searchQuery?`&q=${encodeURIComponent(searchQuery)}`:""}#all-work`;
 const pageHref=(p:number)=>`?tab=${tab}${searchQuery?`&q=${encodeURIComponent(searchQuery)}`:""}&page=${p}#all-work`;

 // Mini "Lịch cá nhân": chỉ đánh dấu ngày có việc thật (Action mở + note cá nhân), không vẽ ô trang trí.
 const dueDateSet=new Set<string>([...openRows.map(r=>r.due_date).filter(Boolean),...personalReminders.filter((p:any)=>p.status==="OPEN"&&p.due_at).map((p:any)=>dateOnly(p.due_at)),...myEmrItems.map((e:any)=>e.due_date).filter(Boolean)]);
 const [calYear,calMonth]=today.split("-").map(Number);
 const firstWeekdaySundayZero=new Date(Date.UTC(calYear,calMonth-1,1)).getUTCDay();
 const leadingBlanks=(firstWeekdaySundayZero+6)%7;
 const daysInMonth=new Date(Date.UTC(calYear,calMonth,0)).getUTCDate();
 const totalCells=Math.ceil((leadingBlanks+daysInMonth)/7)*7;
 const calCells=Array.from({length:totalCells},(_,index)=>{const day=index-leadingBlanks+1;if(day<1||day>daysInMonth)return null;return `${calYear}-${String(calMonth).padStart(2,"0")}-${String(day).padStart(2,"0")}`});

 // "Việc sắp đến hạn": gộp Action mở + note cá nhân còn mở, sắp theo hạn gần nhất.
 const upcoming=[
  ...openRows.filter(r=>r.due_date).map(r=>({key:`a-${r.action_id}`,title:r.title,date:r.due_date as string,overdue:!!r.is_overdue,href:`/tasks/${r.record_id}`})),
  ...personalReminders.filter((p:any)=>p.status==="OPEN"&&p.due_at).map((p:any)=>({key:`p-${p.id}`,title:p.title,date:dateOnly(p.due_at),overdue:dateOnly(p.due_at)<today,href:"/tasks"})),
  ...myEmrItems.filter((e:any)=>e.due_date).map((e:any)=>({key:`e-${e.id}`,title:e.title,date:e.due_date as string,overdue:e.due_date<today,href:EMR_CATEGORIES.find(c=>c.code===e.category)?.slug?`/emr/${EMR_CATEGORIES.find(c=>c.code===e.category)!.slug}`:"/emr"})),
 ].sort((a,b)=>a.date.localeCompare(b.date)).slice(0,6);

 return <div className="page-stack my-work-page tqm-my-work">
  <MyWorkSyncClient/>
  <style>{`.tqm-my-work{max-width:1180px;margin:0 auto}.tqm-my-work .kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.tqm-my-work .kpi-card{background:#fff;border:1px solid #e5eaf2;border-radius:14px;padding:16px;box-shadow:0 1px 2px rgba(15,23,42,.03)}.tqm-my-work .kpi-card-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.tqm-my-work .kpi-icon{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center}.tqm-my-work .kpi-icon.blue{background:#dbeafe;color:#2563eb}.tqm-my-work .kpi-icon.green{background:#dcfce7;color:#16a34a}.tqm-my-work .kpi-icon.amber{background:#fef3c7;color:#b45309}.tqm-my-work .kpi-icon.red{background:#fee2e2;color:#dc2626}.tqm-my-work .kpi-icon.purple{background:#ede9fe;color:#7c3aed}.tqm-my-work .kpi-value{font-size:26px;font-weight:800;color:#0f172a}.tqm-my-work .kpi-title{font-size:12.5px;color:#475569;font-weight:600;margin-top:2px}.tqm-my-work .kpi-trend{font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;white-space:nowrap}.tqm-my-work .kpi-trend.down{color:#dc2626;background:#fef2f2}@media(max-width:1100px){.tqm-my-work .kpis{grid-template-columns:repeat(2,1fr)}}.tqm-my-work .work-section{background:#fff;border:1px solid #d3dee3;border-radius:16px;overflow:hidden}.tqm-my-work .work-section.primary{border:2px solid #9fb8c5}.tqm-my-work .section-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:15px 17px;border-bottom:1px solid #e2e9ec;background:#f8fbfc}.tqm-my-work .section-head h2{margin:0;font-size:16px}.tqm-my-work .section-head p{margin:4px 0 0;color:#687a80;font-size:11px}.tqm-my-work .work-list{display:grid}.tqm-my-work .work-row{display:grid;grid-template-columns:minmax(0,1fr) 115px 110px auto;gap:12px;align-items:center;padding:13px 16px;border-bottom:1px solid #e7edef}.tqm-my-work .work-row:last-child{border-bottom:0}.tqm-my-work .work-row.danger{background:#fffafa}.tqm-my-work .work-main strong{font-size:12px}.tqm-my-work .work-main small{display:block;margin-top:4px;color:#718187;font-size:10px}.tqm-my-work .role-badge{display:inline-flex;border-radius:999px;background:#eaf2fb;color:#1d4f7a;padding:5px 8px;font-size:9px;font-weight:900}.tqm-my-work details{border-top:1px solid #dbe5e9}.tqm-my-work summary{cursor:pointer;padding:13px 16px;font-weight:800;font-size:12px;background:#fafcfd}.tqm-my-work .all-table{padding:0}.tqm-my-work .attention-list{display:grid;gap:8px;padding:12px 16px 16px}.tqm-my-work .attention-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;border:1px solid #e4eaec;border-radius:12px;padding:11px}.tqm-my-work .attention-item strong{font-size:11px}.tqm-my-work .attention-item small{display:block;margin-top:3px;color:#7b898f}.tqm-my-work .mobile-only{display:none}@media(max-width:760px){.tqm-my-work .work-row{grid-template-columns:1fr auto}.tqm-my-work .work-row>div:nth-child(2),.tqm-my-work .work-row>div:nth-child(3){display:none}.tqm-my-work .desktop-only{display:none}.tqm-my-work .mobile-only{display:grid;gap:10px}.tqm-my-work .my-work-card{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"title action" "cue action";column-gap:12px;row-gap:5px;align-items:center;padding:14px 14px;background:#fff;border:1px solid #d7e1e5;border-radius:14px;overflow:hidden}.tqm-my-work .my-work-card.overdue{border-color:#efc6c6;background:#fffafa}.tqm-my-work .my-work-card strong{grid-area:title;display:block;min-width:0;font-size:14px;line-height:1.35;overflow-wrap:anywhere}.tqm-my-work .my-work-card small{grid-area:cue;display:block;color:#687a80;font-size:11px;line-height:1.35}.tqm-my-work .my-work-card .button{grid-area:action;align-self:center;white-space:nowrap;padding:8px 10px;font-size:11px;min-height:auto}}
  .tqm-my-work .kpi-card-foot{margin-top:10px;font-size:11px;font-weight:700;color:#2563eb}
  .tqm-my-work .work-columns{display:grid;grid-template-columns:minmax(0,2fr) minmax(240px,1fr);gap:14px;align-items:start}
  .tqm-my-work .work-tabs{display:flex;gap:6px;flex-wrap:wrap;padding:12px 16px 0}.tqm-my-work .work-tab{display:inline-flex;align-items:center;min-height:32px;padding:0 12px;border-radius:999px;font-size:11px;font-weight:800;color:#52656d;border:1px solid #d7e1e5;background:#fff}.tqm-my-work .work-tab.active{background:#2563eb;border-color:#2563eb;color:#fff}
  .tqm-my-work .work-search-row{display:flex;gap:8px;align-items:center;padding:10px 16px}.tqm-my-work .work-search-row .search-box{flex:1;max-width:280px}
  .tqm-my-work .work-selection-count{display:inline-flex;align-items:center;min-height:32px;padding:0 12px;border-radius:999px;font-size:11px;font-weight:800;color:#1d4ed8;background:#eff6ff}
  .tqm-my-work .my-work-header{display:flex;align-items:center;justify-content:space-between;gap:16px}
  .tqm-my-work .my-work-header .page-header{flex:1}
  .tqm-my-work .my-work-header-side{display:flex;align-items:center;gap:14px;flex:0 0 auto}
  .tqm-my-work .my-work-quote{max-width:200px;margin:0;padding:12px 14px;border-radius:14px;background:#eff6ff;color:#1e40af;font-size:11.5px;font-weight:600;font-style:italic;line-height:1.4}
  @media(max-width:900px){.tqm-my-work .my-work-header{flex-direction:column;align-items:flex-start}.tqm-my-work .my-work-header-side{display:none}}
  @media(max-width:760px){.tqm-my-work .work-tabs{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:2px}.tqm-my-work .work-tab{flex:0 0 auto;white-space:nowrap}.tqm-my-work .work-search-row .search-box{max-width:none}}
  .tqm-my-work .work-pagination{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 16px;flex-wrap:wrap;font-size:11px;color:#64748b}.tqm-my-work .work-pagination-pages{display:flex;gap:5px}
  .tqm-my-work .mini-cal{padding:13px 14px}.tqm-my-work .mini-cal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.tqm-my-work .mini-cal-head strong{font-size:12px;color:#243247}.tqm-my-work .mini-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;text-align:center}.tqm-my-work .mini-cal-wd{font-size:9px;font-weight:800;color:#94a3b8;padding:3px 0}.tqm-my-work .mini-cal-day{position:relative;font-size:10.5px;padding:5px 0;border-radius:7px;color:#334155}.tqm-my-work .mini-cal-day.today{background:#2563eb;color:#fff;font-weight:800}.tqm-my-work .mini-cal-day.has-event:not(.today):after{content:"";position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:#2563eb}
  .tqm-my-work .upcoming-list{display:grid;padding:4px 0}.tqm-my-work .upcoming-item{display:flex;justify-content:space-between;gap:8px;padding:9px 14px;border-top:1px solid #eef2f3;font-size:11px}.tqm-my-work .upcoming-item strong{display:block;font-size:11.5px;color:#243247;font-weight:700}.tqm-my-work .upcoming-item small{color:#94a3b8}.tqm-my-work .upcoming-item small.overdue{color:#c43232;font-weight:800}
  @media(max-width:900px){.tqm-my-work .work-columns{grid-template-columns:1fr}}`}</style>
  <div className="my-work-header">
   <PageHeader eyebrow={`CÔNG VIỆC HÔM NAY · ${roleViewLabel} · ${year}`} title="Việc của tôi" description="Chỉ tập trung vào việc cần làm. Việc khẩn và đến hạn được đưa lên trước; các danh sách quản lý mở khi cần." icon="inbox"/>
   <div className="my-work-header-side">
    <svg className="my-work-illustration" width="120" height="100" viewBox="0 0 120 100" fill="none" aria-hidden="true">
     <rect x="28" y="6" width="64" height="88" rx="10" fill="#eff6ff" stroke="#bfdbfe" strokeWidth="2"/>
     <rect x="46" y="0" width="28" height="14" rx="5" fill="#93c5fd"/>
     <path d="M40 34h40M40 50h40M40 66h24" stroke="#93c5fd" strokeWidth="4" strokeLinecap="round"/>
     <circle cx="40" cy="34" r="3" fill="#2563eb"/><circle cx="40" cy="50" r="3" fill="#2563eb"/><circle cx="40" cy="66" r="3" fill="#2563eb"/>
     <path d="M6 60c0-16 12-28 28-28" stroke="#60a5fa" strokeWidth="4" strokeLinecap="round" opacity=".5"/>
     <path d="m86 22 6 6 12-12" stroke="#22c55e" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    <p className="my-work-quote">&ldquo;Mỗi công việc nhỏ hôm nay là nền tảng cho chất lượng ngày mai.&rdquo;</p>
   </div>
  </div>
  <section className="kpis">
    <article className="kpi-card"><div className="kpi-card-top"><span className="kpi-icon red"><Icon name="triangle-alert" size={18}/></span>{overdue7?<span className="kpi-trend down">{overdue7} ≥7 ngày</span>:null}</div><div className="kpi-value">{overdue}</div><div className="kpi-title">Quá hạn</div><Link className="kpi-card-foot" href="?tab=OPEN#all-work">Xem chi tiết →</Link></article>
    <article className="kpi-card"><div className="kpi-card-top"><span className="kpi-icon amber"><Icon name="calendar-days" size={18}/></span></div><div className="kpi-value">{dueToday}</div><div className="kpi-title">Đến hạn hôm nay</div><Link className="kpi-card-foot" href="?tab=OPEN#all-work">Xem chi tiết →</Link></article>
    <article className="kpi-card"><div className="kpi-card-top"><span className="kpi-icon blue"><Icon name="calendar-range" size={18}/></span></div><div className="kpi-value">{dueSoon}</div><div className="kpi-title">7 ngày tới</div><Link className="kpi-card-foot" href="?tab=OPEN#all-work">Xem chi tiết →</Link></article>
    <article className="kpi-card"><div className="kpi-card-top"><span className="kpi-icon purple"><Icon name="list-checks" size={18}/></span></div><div className="kpi-value">{open}</div><div className="kpi-title">Đang mở</div><Link className="kpi-card-foot" href="?tab=OPEN#all-work">Xem chi tiết →</Link></article>
    <article className="kpi-card"><div className="kpi-card-top"><span className="kpi-icon green"><Icon name="check-square" size={18}/></span></div><div className="kpi-value">{completed}</div><div className="kpi-title">Hoàn thành</div><Link className="kpi-card-foot" href="?tab=DONE#all-work">Xem báo cáo →</Link></article>
  </section>
  <section className="work-section primary">
    <div className="section-head"><div><h2>Việc cần làm trước</h2><p>{secretaryHeadline} Hệ thống đã xếp theo hạn, trạng thái chờ xử lý và mức ưu tiên.</p></div></div>
    <div className="work-list">{secretaryQueue.map(r=><div className={`work-row ${r.is_overdue||r.workflow_status==="RETURNED"?"danger":""}`} key={r.action_id}><div className="work-main"><strong>{r.title}</strong><small>{r.record_code} · {workCue(r)}{r.assignment_target_type==="GROUP"?` · ${assignedGroupMap.get(r.assignee_group_id)||"Nhóm phân công"}`:""}</small></div><div><span className={`status-badge ${priorityTone(r.priority)}`}>{priorityLabel(r.priority)}</span></div><div><StatusBadge status={r.is_overdue?"OVERDUE":r.workflow_status}/></div><Link className="button primary small" href={`/tasks/${r.record_id}`}>Làm ngay</Link></div>)}{!secretaryQueue.length?<div className="empty-state">Không có việc khẩn hoặc sát hạn cần xử lý.</div>:null}</div>
  </section>
  {(isQlcl||isDepartmentHead)&&roleQueue.length?<section className="work-section"><div className="section-head"><div><div style={{display:"flex",gap:8,alignItems:"center"}}><h2>{roleQueueTitle}</h2><span className="role-badge">{isQlcl?"TOÀN VIỆN":user.primaryDepartmentName||"KHOA/PHÒNG"}</span></div><p>Chỉ các việc cần anh/chị can thiệp theo vai trò quản lý; không trộn với việc cá nhân.</p></div></div><div className="work-list">{roleQueue.map(r=><div className={`work-row ${r.is_overdue||r.workflow_status==="RETURNED"?"danger":""}`} key={`role-${r.action_id}`}><div className="work-main"><strong>{r.title}</strong><small>{roleDepartmentMap.get(r.lead_department_id)||(departmentActionIds.includes(r.action_id)?user.primaryDepartmentName:"Chưa gán khoa/phòng")} · {workCue(r)}</small></div><div><span className={`status-badge ${priorityTone(r.priority)}`}>{priorityLabel(r.priority)}</span></div><div><StatusBadge status={r.is_overdue?"OVERDUE":r.workflow_status}/></div><Link className="button secondary small" href={`/tasks/${r.record_id}`}>Mở</Link></div>)}</div></section>:null}
  {attention.length?<section className="work-section"><details><summary>{attentionTitle} · {attention.length} thông báo chưa đọc</summary><div className="attention-list">{attention.slice(0,8).map(n=><div className="attention-item" key={n.id}><div><strong>{n.title}</strong><small>{n.message||"Có hồ sơ cần xử lý."}</small></div>{n.target_route?<Link className="button secondary small" href={n.target_route}>Mở hồ sơ</Link>:null}</div>)}</div></details></section>:null}

  <div className="work-columns">
   <div style={{display:"grid",gap:14}}>
    <PersonalReminders initialRows={personalReminders} organizationId={user.organizationId!} userId={user.id}/>
    <WorkRowSelectionProvider>
    {/* Tabs/search/pagination are plain query-string links + a GET form (no
        client state), so there is no reason they were desktop-only — that
        left mobile with no way to filter by tab, search, or reach page 2+.
        Only the TABLE vs CARD-LIST body actually needs to differ by
        viewport; the surrounding controls now render on both. */}
    <section id="all-work" className="work-section">
     <nav className="work-tabs" aria-label="Lọc việc được giao">
      <Link href={tabHref("ALL")} className={`work-tab ${tab==="ALL"?"active":""}`}>Tất cả · {allWorkRows.length}</Link>
      <Link href={tabHref("REMINDER")} className={`work-tab ${tab==="REMINDER"?"active":""}`}>Note cá nhân · {unifiedReminderRows.length}</Link>
      <Link href={tabHref("ASSIGNED")} className={`work-tab ${tab==="ASSIGNED"?"active":""}`}>Đã giao · {unifiedAssignedRows.length}</Link>
      <Link href={tabHref("WATCH")} className={`work-tab ${tab==="WATCH"?"active":""}`}>Theo dõi · {allWorkRows.filter(r=>r.isWatch).length}</Link>
      <Link href={tabHref("DONE")} className={`work-tab ${tab==="DONE"?"active":""}`}>Hoàn thành · {allWorkRows.filter(r=>r.isDone).length}</Link>
      <WorkSelectionCount/>
     </nav>
     <form method="get" className="work-search-row">
      <input type="hidden" name="tab" value={tab}/>
      <div className="search-box"><Icon name="search" size={16}/><input name="q" defaultValue={searchQuery} placeholder="Tìm công việc..."/></div>
      <button type="submit" className="button secondary small">Lọc</button>
     </form>
     <div className="table-wrap all-table desktop-only"><table><thead><tr><th></th><th>#</th><th>Tiêu đề công việc</th><th>Loại</th><th>Liên quan đến</th><th>Ưu tiên</th><th>Hạn xử lý</th><th>Trạng thái</th><th>Người giao</th><th>Thao tác</th></tr></thead><tbody>{tableRowsPage.map((r,idx)=><tr key={r.key}><td><WorkRowCheckbox rowKey={r.key}/></td><td>{(currentPage-1)*PAGE_SIZE+idx+1}</td><td><Link className="table-link" href={r.href}>{r.title}</Link></td><td>{r.typeLabel}</td><td>{r.relatedTo}</td><td><span className={`status-badge ${priorityTone(r.priority)}`}>{priorityLabel(r.priority)}</span></td><td className={r.isOverdue?"text-danger":""}>{r.dueDate?formatDate(r.dueDate):"—"}</td><td><StatusBadge status={r.statusLabel}/></td><td>{r.assignedBy}</td><td>{r.source==="reminder"?<ReminderRowDelete id={r.key.slice(2)} title={r.title}/>:null}</td></tr>)}{!tableRowsPage.length?<tr><td colSpan={10}><div className="empty-state">Không có việc phù hợp.</div></td></tr>:null}</tbody></table></div>
     <div className="mobile-only work-card-list">{tableRowsPage.map(r=><article className={`my-work-card ${r.isOverdue?"overdue":""}`} key={r.key}><strong>{r.title}</strong><small>{r.typeLabel} · {r.dueDate?formatDate(r.dueDate):"Không có hạn"}</small><Link className="button primary small" href={r.href}>Mở</Link></article>)}{!tableRowsPage.length?<div className="empty-state">Không có việc phù hợp.</div>:null}</div>
     {searched.length?<div className="work-pagination"><span>Hiển thị {(currentPage-1)*PAGE_SIZE+1}-{Math.min(currentPage*PAGE_SIZE,searched.length)} của {searched.length} bản ghi</span><div className="work-pagination-pages">{Array.from({length:totalPages},(_,i)=>i+1).map(p=><Link key={p} href={pageHref(p)} className={`button small ${p===currentPage?"primary":"secondary"}`}>{p}</Link>)}</div></div>:null}
    </section>
    </WorkRowSelectionProvider>
   </div>
   <div style={{display:"grid",gap:14}}>
    <section className="work-section desktop-only">
     <div className="section-head"><div><h2>Lịch cá nhân</h2><p><Link href="/calendar">Xem toàn bộ →</Link></p></div></div>
     <div className="mini-cal"><div className="mini-cal-head"><strong>{MONTH_NAMES[calMonth-1]}, {calYear}</strong></div><div className="mini-cal-grid">{WEEKDAYS.map(d=><div className="mini-cal-wd" key={d}>{d}</div>)}{calCells.map((date,idx)=><div key={date||`b-${idx}`} className={`mini-cal-day ${date===today?"today":""} ${date&&dueDateSet.has(date)?"has-event":""}`}>{date?Number(date.slice(-2)):""}</div>)}</div></div>
    </section>
    <section className="work-section">
     <div className="section-head"><div><h2>Việc sắp đến hạn</h2><p>Gộp từ Action được giao, note cá nhân và hạng mục EMR của khoa/phòng còn mở.</p></div></div>
     <div className="upcoming-list">{upcoming.map(u=><Link key={u.key} className="upcoming-item" href={u.href}><strong>{u.title}</strong><small className={u.overdue?"overdue":""}>{formatDate(u.date)}</small></Link>)}{!upcoming.length?<div className="empty-state compact">Không có việc sắp đến hạn.</div>:null}</div>
    </section>
   </div>
  </div>
  {firstError?<div className="alert error">Một phần dữ liệu tác nghiệp chưa tải được: {firstError.message}</div>:null}
 </div>
}