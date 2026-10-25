import { TaskExtensionReviewQueue } from "@/components/task-extension-review-queue";
import { PersonalTaskProgressTitle } from "@/components/personal-task-progress-title";
import { UnifiedPersonalTaskActions } from "@/components/unified-personal-task-actions";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { MyWorkSyncClient } from "@/components/my-work-sync-client";
import { WorkFollowupControl } from "@/components/work-followup-control";
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
// Tuần làm việc theo quy ước VN: Thứ 2 -> Chủ nhật. Tính thuần bằng Date.UTC
// trên chuỗi "YYYY-MM-DD" (cùng cách mini-lịch cá nhân phía dưới đã làm),
// không qua Date() mặc định để tránh lệch timezone của máy chủ.
function mondayOfWeek(dateStr:string){const [y,m,d]=dateStr.split("-").map(Number);const dt=new Date(Date.UTC(y,m-1,d));const dow=dt.getUTCDay();dt.setUTCDate(dt.getUTCDate()+(dow===0?-6:1-dow));return dt.toISOString().slice(0,10)}
function addDays(dateStr:string,days:number){const [y,m,d]=dateStr.split("-").map(Number);const dt=new Date(Date.UTC(y,m-1,d));dt.setUTCDate(dt.getUTCDate()+days);return dt.toISOString().slice(0,10)}
function priorityLabel(value?:string|null){if(value==="CRITICAL")return"Rất khẩn";if(value==="URGENT")return"Khẩn";if(value==="HIGH")return"Cao";if(value==="LOW")return"Thấp";return"Bình thường"}
function priorityTone(value?:string|null){if(["CRITICAL","URGENT"].includes(String(value)))return"danger";if(value==="HIGH")return"warning";if(value==="LOW")return"muted";return"info"}
function workCue(row:any){const days=Number(row.days_to_due||0);if(row.is_overdue){const late=Math.abs(days);if(late>=7)return`Đôn đốc ngay · quá hạn ${late} ngày`;return`Xử lý ngay · quá hạn ${late} ngày`}if(["EVIDENCE_SUBMITTED","VERIFYING"].includes(String(row.workflow_status)))return"Cần kiểm tra / xác minh";if(row.workflow_status==="RETURNED")return"Cần bổ sung sau khi bị trả lại";if(days===0)return"Hoàn tất trong hôm nay";if(days>0&&days<=3)return`Chuẩn bị xử lý · còn ${days} ngày`;if(["CRITICAL","URGENT"].includes(String(row.priority)))return"Ưu tiên xử lý sớm";return days>0?`Theo dõi · còn ${days} ngày`:"Cần kiểm tra tiến độ"}
// Báo cáo thực tế: việc đã hoàn thành vẫn chỉ hiện hạn xử lý cũ ("08/10/2026")
// thay vì ngày hoàn thành thật — nhìn vào không biết việc đó xong lúc nào,
// đặc biệt khó dùng khi đây chính là màn hình dùng để báo cáo việc đã xong
// trong tuần. Việc đã xong hiện "Hoàn thành: DD/MM/YYYY" (completedAt); việc
// chưa xong vẫn hiện hạn xử lý như cũ.
function dueOrCompletedLabel(row:{isDone:boolean;completedAt:string|null;dueDate:string|null}){if(row.isDone)return row.completedAt?`Hoàn thành: ${formatDate(row.completedAt)}`:"Đã hoàn thành";return row.dueDate?formatDate(row.dueDate):"Không có hạn"}
function workScore(row:any){const days=Number(row.days_to_due||0);let score=0;if(row.is_overdue)score+=200+Math.abs(days)*5;if(row.workflow_status==="RETURNED")score+=150;if(["EVIDENCE_SUBMITTED","VERIFYING"].includes(String(row.workflow_status)))score+=135;if(days===0)score+=160;if(days>0&&days<=3)score+=100;if(row.priority==="CRITICAL")score+=90;else if(row.priority==="URGENT")score+=70;else if(row.priority==="HIGH")score+=40;return score}
const ACTION_SELECT="action_id,record_id,record_code,title,work_year,workflow_status,priority,due_date,is_overdue,days_to_due,lead_department_id,assignee_user_id,assignment_target_type,assignee_group_id,updated_at,created_at";

export default async function TasksPage({searchParams}:{searchParams:Promise<{tab?:string;q?:string;page?:string;week?:string}>}){
 const {user}=await requireUserContext();requirePermission(user,"tasks.view");const year=await getWorkYear();const supabase=await createClient();const today=hcmToday();
 const {tab:rawTab,q:rawQ,page:rawPage,week:rawWeek}=await searchParams;
 const tab=(["ALL","OPEN","REMINDER","ASSIGNED","WAITING","WATCH","DONE"].includes(String(rawTab).toUpperCase())?String(rawTab).toUpperCase():"OPEN") as "ALL"|"OPEN"|"REMINDER"|"ASSIGNED"|"WAITING"|"WATCH"|"DONE";
 const searchQuery=String(rawQ||"").trim();
 const requestedPage=Number(rawPage ?? 1);
 const page=Number.isSafeInteger(requestedPage)&&requestedPage>0?requestedPage:1;
 const PAGE_SIZE=10;
 // Lọc theo tuần (Thứ 2 -> CN) để xem/báo cáo công việc trong 1 tuần cụ thể —
 // mặc định KHÔNG lọc (giữ đúng hành vi cũ) nếu không truyền ?week=. Giá trị
 // truyền vào luôn được quy về đúng Thứ 2 của tuần chứa ngày đó, nên link có
 // thể trỏ tới bất kỳ ngày nào trong tuần muốn xem.
 const rawWeekValue=String(rawWeek||"").trim();
 const weekStart=/^\d{4}-\d{2}-\d{2}$/.test(rawWeekValue)&&!Number.isNaN(Date.parse(rawWeekValue))?mondayOfWeek(rawWeekValue):null;
 const weekEnd=weekStart?addDays(weekStart,6):null;
 const thisWeekMonday=mondayOfWeek(today);
 const weekNavBase=weekStart||thisWeekMonday;
 const weekHref=(w:string|null)=>{const params=new URLSearchParams();params.set("tab",tab);if(searchQuery)params.set("q",searchQuery);if(w)params.set("week",w);return `?${params.toString()}#all-work`};
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
  supabase.from("personal_reminders").select("id,title,note,due_at,priority,status,completed_at,created_at").eq("owner_user_id",user.id).neq("status","CANCELLED").order("due_at",{ascending:true,nullsFirst:false}),
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
 const rows=sourceRows.filter(r=>r.workflow_status!=="CANCELLED"&&!hidden.has(r.record_id)&&!legacyReminderActionIds.has(r.action_id));const attention=(attentionRes.data??[]) as any[];const personalReminders=(personalRemindersRes.data??[]) as any[];
 const {data:legacyPersonalTasks,error:legacyPersonalError}=await supabase.from("personal_workspace_items").select("id,title,content,category,due_at,status,completed_at,item_type,created_at").eq("owner_user_id",user.id).eq("item_type","TASK").is("deleted_at",null).limit(500);const workFollowupSourceIds=Array.from(new Set([...rows.map((r:any)=>r.action_id),...myEmrItems.map((r:any)=>r.id)].filter(Boolean))) as string[];
 const workFollowupsRes=workFollowupSourceIds.length
  ? await supabase.from("work_followups").select("id,source_type,source_id,state,waiting_for_label,follow_up_at,note").eq("owner_user_id",user.id).in("source_id",workFollowupSourceIds).in("state",["ACTIVE","WAITING"])
  : {data:[],error:null};
 const workFollowups=(workFollowupsRes.data??[]) as any[];
 const followupBySource=new Map(workFollowups.map((f:any)=>[f.source_type+":"+f.source_id,f]));
 const scopedRows=scopeSourceRows.filter(r=>!["COMPLETED","CANCELLED","CLOSED","NOT_APPLICABLE"].includes(String(r.workflow_status))&&!hidden.has(r.record_id)&&!legacyReminderActionIds.has(r.action_id));const firstError=legacyPersonalError||actionsRes.error||attentionRes.error||personalRemindersRes.error||scopeActionsRes.error||recordRes.error||creatorsRes.error||roleDepartmentsRes.error||assignedGroupsRes.error||recurringLegacyRes.error||emrItemsRes.error||workFollowupsRes.error;
 // EMR items chưa DONE được tính gộp vào 4 KPI đầu (quá hạn/đến hạn/sắp tới/
 // đang mở) — không tính vào "Hoàn thành" vì emrItemsRes chỉ tải các mục
 // chưa DONE (không có lịch sử hoàn thành để đếm ở đây).
 const emrKpiRows=myEmrItems.map((item:any)=>{const isOverdue=!!item.due_date&&item.due_date<today;const daysToDue=item.due_date?Math.round((new Date(`${item.due_date}T00:00:00Z`).getTime()-new Date(`${today}T00:00:00Z`).getTime())/86400000):null;return{is_overdue:isOverdue,days_to_due:daysToDue,workflow_status:item.status};});
 // Báo cáo thực tế (ảnh chụp "Quá hạn: 0" dù có note cá nhân hạn 7/10 — đã
 // qua hạn so với hôm nay 10/10): note cá nhân trước đây hoàn toàn không
 // được tính vào 4 KPI đầu (quá hạn/đến hạn/sắp tới/đang mở) lẫn "Hoàn
 // thành" — dù secretaryHeadline phía dưới vẫn nói "Không có việc cá nhân
 // quá hạn" khi overdue=0, tức bản thân trang đã coi note cá nhân là một
 // phần của "quá hạn". dueDate dùng dateOnly (giống unifiedReminderRows) vì
 // due_at là mốc UTC của nửa đêm giờ VN, không được cắt chuỗi trực tiếp.
 const personalReminderKpiRows=personalReminders.map((p:any)=>{const dueDate=p.due_at?dateOnly(p.due_at):null;const isOverdue=p.status==="OPEN"&&!!dueDate&&dueDate<today;const daysToDue=dueDate?Math.round((new Date(`${dueDate}T00:00:00Z`).getTime()-new Date(`${today}T00:00:00Z`).getTime())/86400000):null;return{is_overdue:isOverdue,days_to_due:daysToDue,workflow_status:p.status};});
 const kpiRows=[...rows,...emrKpiRows,...personalReminderKpiRows];
 const overdue=kpiRows.filter(r=>r.is_overdue).length,dueToday=kpiRows.filter(r=>!r.is_overdue&&Number(r.days_to_due)===0).length,dueSoon=kpiRows.filter(r=>!r.is_overdue&&Number(r.days_to_due)>0&&Number(r.days_to_due)<=7).length,open=kpiRows.filter(r=>!["COMPLETED","CANCELLED","CLOSED"].includes(r.workflow_status)).length,completed=rows.filter(r=>r.workflow_status==="COMPLETED").length+personalReminders.filter((p:any)=>p.status==="COMPLETED").length;
 // Tự rà lại sau phản hồi "rà chưa sát": overdue7 (mức cảnh báo cao nhất
 // trong secretaryHeadline) trước đây cũng chỉ đếm từ rows (Action), bỏ sót
 // EMR/note cá nhân giống hệt lỗi kpiRows vừa sửa ở trên — một note cá nhân
 // hoặc hạng mục EMR quá hạn ≥7 ngày (không có Action nào quá hạn 7 ngày)
 // sẽ không được đẩy lên mức cảnh báo cao nhất dù overdue (tổng quát) đã
 // đúng. Dùng kpiRows (đã gộp đủ 3 nguồn) thay vì rows.
 const overdue7=kpiRows.filter(r=>r.is_overdue&&Math.abs(Number(r.days_to_due||0))>=7).length;
 const secretaryQueue=[...rows].filter(r=>!["COMPLETED","CLOSED"].includes(r.workflow_status)).sort((a,b)=>workScore(b)-workScore(a)).slice(0,6);
 const roleQueue=[...scopedRows].filter(r=>r.is_overdue||Number(r.days_to_due)===0||(Number(r.days_to_due)>0&&Number(r.days_to_due)<=3)||["RETURNED","EVIDENCE_SUBMITTED","VERIFYING"].includes(String(r.workflow_status))||["CRITICAL","URGENT"].includes(String(r.priority))).sort((a,b)=>workScore(b)-workScore(a)).slice(0,8);
 const roleQueueTitle=isQlcl?"Hàng đợi điều phối QLCL":isDepartmentHead?"Hàng đợi của khoa/phòng":"";
 const attentionTitle=isBoard?"Cần theo dõi / quyết định":isQlcl?"Hồ sơ cần QLCL xử lý / xác minh":isDepartmentHead?"Hồ sơ khoa/phòng cần xử lý":"Cần tôi xử lý / xác minh";
 const secretaryHeadline=overdue7>0?`${overdue7} việc đã quá hạn từ 7 ngày trở lên cần đôn đốc ngay.`:overdue>0?`${overdue} việc đang quá hạn; ưu tiên xử lý trước các công việc mới.`:dueToday>0?`${dueToday} việc đến hạn hôm nay cần hoàn tất trước cuối ngày.`:attention.length>0?`${attention.length} hồ sơ/thông báo đang chờ bạn xử lý.`:"Không có việc cá nhân quá hạn. Tiếp tục theo dõi hàng đợi nghiệp vụ theo vai trò.";

 type UnifiedRow={key:string;title:string;typeLabel:string;relatedTo:string;priority:string|null;dueDate:string|null;completedAt:string|null;createdAt:string|null;statusLabel:string;isOverdue:boolean;isDone:boolean;isWatch:boolean;assignedBy:string;href:string;source:"action"|"reminder"|"emr"|"legacy";sourceId:string|null;sourceType:"ACTION"|"EMR"|null;followup:any|null};
 const unifiedActionRows:UnifiedRow[]=rows.map(r=>({
  key:`a-${r.action_id}`,title:r.title,typeLabel:RECORD_TYPE_LABEL[recordTypeMap.get(r.record_id)||""]||"—",
  relatedTo:recordCodeMap.get(r.record_id)||"—",priority:r.priority,dueDate:r.due_date,
  // Chưa có cột completed_at riêng trên actions (chỉ có completion_note) —
  // updated_at tại đúng thời điểm chuyển COMPLETED là xấp xỉ hợp lý duy nhất
  // hiện có để báo cáo "hoàn thành trong tuần nào".
  completedAt:r.workflow_status==="COMPLETED"&&r.updated_at?dateOnly(r.updated_at):null,
  createdAt:r.created_at?dateOnly(r.created_at):null,
  statusLabel:r.is_overdue?"OVERDUE":r.workflow_status,isOverdue:!!r.is_overdue,isDone:r.workflow_status==="COMPLETED",
  isWatch:!r.is_overdue&&!["COMPLETED","CANCELLED","CLOSED"].includes(r.workflow_status)&&Number(r.days_to_due)>0,
  assignedBy:createdByForRecord(r.record_id),href:`/tasks/${r.record_id}`,source:"action",sourceId:r.action_id,sourceType:"ACTION",followup:followupBySource.get("ACTION:"+r.action_id)??null,
 }));
 const unifiedReminderRows:UnifiedRow[]=[...personalReminders.map((p:any):UnifiedRow=>({
  key:`p-${p.id}`,title:p.title,typeLabel:"Note cá nhân",relatedTo:"—",priority:p.priority,
  dueDate:p.due_at?dateOnly(p.due_at):null,completedAt:p.status==="COMPLETED"&&p.completed_at?dateOnly(p.completed_at):null,
  createdAt:p.created_at?dateOnly(p.created_at):null,
  statusLabel:p.status==="COMPLETED"?"COMPLETED":(p.due_at&&dateOnly(p.due_at)<today?"OVERDUE":p.status),
  isOverdue:p.status==="OPEN"&&!!p.due_at&&dateOnly(p.due_at)<today,isDone:p.status==="COMPLETED",
  isWatch:p.status==="OPEN"&&(!p.due_at||dateOnly(p.due_at)>=today),
  assignedBy:"—",href:"/tasks?tab=REMINDER#all-work",source:"reminder",sourceId:p.id,sourceType:null,followup:p.note??null,
 })),...(legacyPersonalTasks??[]).map((p:any):UnifiedRow=>({
  key:`legacy-${p.id}`,title:p.title,typeLabel:"Việc cá nhân",relatedTo:p.category||"Cá nhân",priority:"MEDIUM",
  dueDate:p.due_at?dateOnly(p.due_at):null,completedAt:p.status==="DONE"&&p.completed_at?dateOnly(p.completed_at):null,
  createdAt:p.created_at?dateOnly(p.created_at):null,
  statusLabel:p.status==="DONE"?"COMPLETED":"OPEN",
  isOverdue:p.status==="OPEN"&&!!p.due_at&&dateOnly(p.due_at)<today,isDone:p.status==="DONE",
  isWatch:p.status==="OPEN",assignedBy:"—",href:`/me?item=${encodeURIComponent(p.id)}#personal-workspace`,source:"legacy",sourceId:p.id,sourceType:null,followup:p.content??null,
 }))];
 const unifiedEmrRows:UnifiedRow[]=myEmrItems.map((item:any)=>{
  const category=EMR_CATEGORIES.find(c=>c.code===item.category);
  const overdueItem=!!item.due_date&&item.due_date<today;
  return{
   key:`e-${item.id}`,title:item.title,typeLabel:`EMR · ${category?.label||item.category}`,
   relatedTo:category?.label||"EMR",priority:item.priority,dueDate:item.due_date,completedAt:null,createdAt:null,
   statusLabel:overdueItem?"OVERDUE":item.status,isOverdue:overdueItem,isDone:false,
   isWatch:!overdueItem,assignedBy:"—",href:category?`/emr/${category.slug}`:"/emr",source:"emr",sourceId:item.id,sourceType:"EMR",followup:followupBySource.get("EMR:"+item.id)??null,
  };
 });
 const unifiedAssignedRows=[...unifiedActionRows,...unifiedEmrRows];
 const allWorkRows=[...unifiedAssignedRows,...unifiedReminderRows].sort((a,b)=>(a.dueDate||"9999").localeCompare(b.dueDate||"9999"));
 // Báo cáo thực tế: tab trống (0 việc) vẫn luôn hiện trong thanh tab, gây
 // thắc mắc "3 loại này là gì" — ẩn hẳn pill của tab khi không có việc nào
 // thuộc loại đó, thay vì luôn hiện cả 7 tab bất kể có dữ liệu hay không.
 const waitingCount=allWorkRows.filter(r=>r.followup?.state==="WAITING").length;
 const watchCount=allWorkRows.filter(r=>r.isWatch).length;
 // Tab Đã hoàn thành sắp theo completedAt GẦN NHẤT -> XA NHẤT (giảm dần) —
 // khác với mọi tab khác vẫn giữ nguyên thứ tự theo hạn xử lý tăng dần của
 // allWorkRows, vì "đã xong" cần đọc như một nhật ký/báo cáo (việc mới hoàn
 // thành lên trên), không phải một hàng đợi cần xử lý tiếp theo.
 const byTab=tab==="OPEN"?allWorkRows.filter(r=>!r.isDone):tab==="REMINDER"?unifiedReminderRows:tab==="ASSIGNED"?unifiedAssignedRows:tab==="WAITING"?allWorkRows.filter(r=>r.followup?.state==="WAITING"):tab==="WATCH"?allWorkRows.filter(r=>r.isWatch):tab==="DONE"?allWorkRows.filter(r=>r.isDone).sort((a,b)=>(b.completedAt||"").localeCompare(a.completedAt||"")):allWorkRows;
 const searched=searchQuery?byTab.filter(r=>r.title.toLowerCase().includes(searchQuery.toLowerCase())||r.relatedTo.toLowerCase().includes(searchQuery.toLowerCase())):byTab;
 // Ở tab Đã hoàn thành, "trong tuần" nghĩa là hoàn thành trong tuần đó
 // (completedAt, phải nằm trong đúng khoảng tuần). Các dòng CHƯA hoàn thành
 // thì lọc theo "còn tồn đọng tính đến hết tuần này": chỉ cần dueDate<=weekEnd
 // — KHÔNG đòi dueDate>=weekStart, vì việc quá hạn (hạn nằm trước cả tuần
 // đang xem) vẫn chưa xong thì vẫn phải hiện trong báo cáo tuần, không phải
 // chỉ việc mới phát sinh hạn đúng trong tuần đó. Báo cáo thực tế: lọc tuần
 // trước đây chỉ bắt hạn nằm trong [weekStart,weekEnd] nên các việc quá hạn
 // từ trước bị rớt khỏi danh sách "chưa xong".
 const weekScoped=weekStart&&weekEnd?searched.filter(r=>r.isDone?(!!r.completedAt&&r.completedAt>=weekStart&&r.completedAt<=weekEnd):(!!r.dueDate&&r.dueDate<=weekEnd)):searched;
 const totalPages=Math.max(1,Math.ceil(weekScoped.length/PAGE_SIZE));
 const currentPage=Math.min(page,totalPages);
 const tableRowsPage=weekScoped.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
 const tabHref=(t:string)=>`?tab=${t}${searchQuery?`&q=${encodeURIComponent(searchQuery)}`:""}${weekStart?`&week=${weekStart}`:""}#all-work`;
 const pageHref=(p:number)=>`?tab=${tab}${searchQuery?`&q=${encodeURIComponent(searchQuery)}`:""}${weekStart?`&week=${weekStart}`:""}&page=${p}#all-work`;
 // Báo cáo "việc nào đã xong, việc nào chưa xong" trong tuần: tính từ TOÀN BỘ
 // allWorkRows (không phụ thuộc tab đang mở) để luôn ra đúng 2 số này dù đang
 // xem tab nào — đã xong = hoàn thành trong tuần (completedAt, đúng khoảng
 // tuần); chưa xong = còn mở, hạn xử lý rơi ĐẾN HẾT tuần này (dueDate<=weekEnd,
 // gồm cả việc đã quá hạn từ trước — không chỉ việc mới phát sinh hạn trong
 // tuần, nếu không sẽ bỏ sót đúng loại việc cần đôn đốc nhất). Không lọc theo
 // searchQuery vì đây là báo cáo tổng, không phải danh sách đang xem.
 const weekDoneRows=weekStart&&weekEnd?allWorkRows.filter(r=>r.isDone&&r.completedAt&&r.completedAt>=weekStart&&r.completedAt<=weekEnd):[];
 const weekPendingRows=weekStart&&weekEnd?allWorkRows.filter(r=>!r.isDone&&r.dueDate&&r.dueDate<=weekEnd):[];
 const reportTabHref=(t:string)=>{const params=new URLSearchParams();params.set("tab",t);if(weekStart)params.set("week",weekStart);return `?${params.toString()}#all-work`};

 return <div className="page-stack my-work-page tqm-my-work">
  <MyWorkSyncClient/>
  <style>{`.tqm-my-work{max-width:1180px;margin:0 auto}.tqm-my-work .kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.tqm-my-work .kpi-card{background:#fff;border:1px solid #e5eaf2;border-radius:14px;padding:16px;box-shadow:0 1px 2px rgba(15,23,42,.03)}.tqm-my-work .kpi-card-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.tqm-my-work .kpi-icon{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center}.tqm-my-work .kpi-icon.blue{background:#dbeafe;color:#2563eb}.tqm-my-work .kpi-icon.green{background:#dcfce7;color:#16a34a}.tqm-my-work .kpi-icon.amber{background:#fef3c7;color:#b45309}.tqm-my-work .kpi-icon.red{background:#fee2e2;color:#dc2626}.tqm-my-work .kpi-icon.purple{background:#ede9fe;color:#7c3aed}.tqm-my-work .kpi-value{font-size:26px;font-weight:800;color:#0f172a}.tqm-my-work .kpi-title{font-size:13px;color:#475569;font-weight:600;margin-top:2px}.tqm-my-work .kpi-trend{font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;white-space:nowrap}.tqm-my-work .kpi-trend.down{color:#dc2626;background:#fef2f2}@media(max-width:1100px){.tqm-my-work .kpis{grid-template-columns:repeat(2,1fr)}}.tqm-my-work .work-section{background:#fff;border:1px solid #d3dee3;border-radius:16px;overflow:hidden}.tqm-my-work .work-section.primary{border:2px solid #9fb8c5}.tqm-my-work .section-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:15px 17px;border-bottom:1px solid #e2e9ec;background:#f8fbfc}.tqm-my-work .section-head h2{margin:0;font-size:16px}.tqm-my-work .section-head p{margin:4px 0 0;color:#687a80;font-size:11px}.tqm-my-work .work-list{display:grid}.tqm-my-work .work-row{display:grid;grid-template-columns:minmax(0,1fr) 115px 110px auto;gap:12px;align-items:center;padding:13px 16px;border-bottom:1px solid #e7edef}.tqm-my-work .work-row:last-child{border-bottom:0}.tqm-my-work .work-row.danger{background:#fffafa}.tqm-my-work .work-main strong{font-size:12px}.tqm-my-work .work-main small{display:block;margin-top:4px;color:#718187;font-size:10px}.tqm-my-work .role-badge{display:inline-flex;border-radius:999px;background:#eaf2fb;color:#1d4f7a;padding:5px 8px;font-size:9px;font-weight:900}.tqm-my-work details{border-top:1px solid #dbe5e9}.tqm-my-work summary{cursor:pointer;padding:13px 16px;font-weight:800;font-size:12px;background:#fafcfd}.tqm-my-work .all-table{padding:0;max-width:100%;overflow-x:auto}.tqm-my-work .all-table table{width:100%;min-width:920px;table-layout:auto;border-collapse:collapse}.tqm-my-work .all-table th,.tqm-my-work .all-table td{padding:10px 8px;vertical-align:middle;white-space:normal;overflow-wrap:anywhere}.tqm-my-work .all-table th:nth-child(2),.tqm-my-work .all-table td:nth-child(2){min-width:180px;width:26%}.tqm-my-work .all-table th:last-child,.tqm-my-work .all-table td:last-child{min-width:175px;width:190px}.tqm-my-work .work-columns>div{min-width:0}.tqm-my-work .attention-list{display:grid;gap:8px;padding:12px 16px 16px}.tqm-my-work .attention-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;border:1px solid #e4eaec;border-radius:12px;padding:11px}.tqm-my-work .attention-item strong{font-size:11px}.tqm-my-work .attention-item small{display:block;margin-top:3px;color:#7b898f}.tqm-my-work .mobile-only{display:none}@media(max-width:760px){.tqm-my-work .work-row{grid-template-columns:1fr auto}.tqm-my-work .work-row>div:nth-child(2),.tqm-my-work .work-row>div:nth-child(3){display:none}.tqm-my-work .desktop-only{display:none}.tqm-my-work .mobile-only{display:grid;gap:10px}.tqm-my-work .my-work-card{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"title action" "cue action";column-gap:12px;row-gap:5px;align-items:center;padding:14px 14px;background:#fff;border:1px solid #d7e1e5;border-radius:14px;overflow:hidden}.tqm-my-work .my-work-card.overdue{border-color:#efc6c6;background:#fffafa}.tqm-my-work .my-work-card strong{grid-area:title;display:block;min-width:0;font-size:14px;line-height:1.35;overflow-wrap:anywhere}.tqm-my-work .my-work-card small{grid-area:cue;display:block;color:#687a80;font-size:11px;line-height:1.35}.tqm-my-work .my-work-card .button{grid-area:action;align-self:center;white-space:nowrap;padding:8px 10px;font-size:11px;min-height:auto}}
  .tqm-my-work .kpi-card-foot{margin-top:10px;font-size:11px;font-weight:700;color:#1E3A8A}
  .tqm-my-work .work-columns{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}
  .tqm-my-work .work-tabs{display:flex;gap:6px;flex-wrap:wrap;padding:12px 16px 0}.tqm-my-work .work-tab{display:inline-flex;align-items:center;min-height:32px;padding:0 12px;border-radius:999px;font-size:11px;font-weight:800;color:#52656d;border:1px solid #d7e1e5;background:#fff}.tqm-my-work .work-tab.active{background:#1E3A8A;border-color:#1E3A8A;color:#fff}
  .tqm-my-work .work-search-row{display:flex;gap:8px;align-items:center;padding:10px 16px}.tqm-my-work .work-search-row .search-box{flex:1;max-width:280px}
  .tqm-my-work .week-filter-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:8px 16px 10px}
  .tqm-my-work .week-nav-controls{display:flex;align-items:center;gap:8px}
  .tqm-my-work .week-nav-arrow{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;flex:0 0 30px;border-radius:8px;border:1px solid #d7e1e5;background:#fff;color:#334155}
  .tqm-my-work .week-nav-arrow:hover{background:#f1f5f9;border-color:#bcd0d8}
  .tqm-my-work .week-filter-label{font-size:12px;font-weight:800;color:#0f172a;white-space:nowrap}
  .tqm-my-work .week-nav-links{display:flex;align-items:center;gap:12px}
  .tqm-my-work .week-nav-link{font-size:11px;font-weight:700;color:#1E3A8A;text-decoration:underline;white-space:nowrap}
  .tqm-my-work .week-nav-link.clear{color:#64748b}
  .tqm-my-work .week-filter-report{margin:0;padding:9px 16px;background:#EEF2FF;color:#172554;font-size:12px;font-weight:600;border-top:1px solid #e2e9ec;border-bottom:1px solid #e2e9ec}
  .tqm-my-work .week-filter-report .muted{color:#64748b;font-weight:500}
  .tqm-my-work .week-report-link{text-decoration:underline}
  .tqm-my-work .week-report-link.done strong{color:#16a34a}
  .tqm-my-work .week-report-link.pending strong{color:#b45309}
  @media(max-width:760px){.tqm-my-work .week-filter-row{padding:8px 12px 10px}.tqm-my-work .week-nav-controls{flex:1 1 100%;justify-content:center}.tqm-my-work .week-nav-links{flex:1 1 100%;justify-content:center}}
  .tqm-my-work .my-work-header{display:flex;align-items:center;justify-content:space-between;gap:16px}
  .tqm-my-work .my-work-header .page-header{flex:1}
  .tqm-my-work .my-work-header-side{display:flex;align-items:center;gap:14px;flex:0 0 auto}
  .tqm-my-work .my-work-quote{max-width:200px;margin:0;padding:12px 14px;border-radius:14px;background:#EEF2FF;color:#172554;font-size:12px;font-weight:600;font-style:italic;line-height:1.4}
  @media(max-width:900px){.tqm-my-work .my-work-header{flex-direction:column;align-items:flex-start}.tqm-my-work .my-work-header-side{display:none}}
  @media(max-width:760px){.tqm-my-work .work-tabs{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:2px}.tqm-my-work .work-tab{flex:0 0 auto;white-space:nowrap}.tqm-my-work .work-search-row .search-box{max-width:none}}
  .tqm-my-work .work-pagination{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 16px;flex-wrap:wrap;font-size:11px;color:#64748b}.tqm-my-work .work-pagination-pages{display:flex;gap:5px}
  @media(max-width:760px){
  .tqm-my-work .my-work-card{grid-template-columns:minmax(0,1fr)!important;grid-template-areas:"title" "cue" "action"!important;align-items:stretch;overflow:visible;min-width:0}
  .tqm-my-work .my-work-card>strong{grid-area:title;min-width:0;max-width:100%;overflow-wrap:break-word;word-break:normal;white-space:normal}
  .tqm-my-work .my-work-card>small{grid-area:cue;min-width:0}
  .tqm-my-work .my-work-card>div{grid-area:action;min-width:0;width:100%}
  .tqm-my-work .my-work-card>div>div{min-width:0!important;width:100%;max-width:100%}
  .tqm-my-work .my-work-card .button{white-space:normal}
}
@media(max-width:900px){.tqm-my-work .work-columns{grid-template-columns:1fr}}`}</style>
  <div className="my-work-header">
   <PageHeader eyebrow={`CÔNG VIỆC HÔM NAY · ${year}`} title="Việc của tôi" description="Chỉ tập trung vào việc cần làm. Việc khẩn và đến hạn được đưa lên trước; các danh sách quản lý mở khi cần." icon="inbox"/>
   <div className="my-work-header-side">
    <svg className="my-work-illustration" width="120" height="100" viewBox="0 0 120 100" fill="none" aria-hidden="true">
     <rect x="28" y="6" width="64" height="88" rx="10" fill="#EEF2FF" stroke="#C7D2FE" strokeWidth="2"/>
     <rect x="46" y="0" width="28" height="14" rx="5" fill="#93c5fd"/>
     <path d="M40 34h40M40 50h40M40 66h24" stroke="#93c5fd" strokeWidth="4" strokeLinecap="round"/>
     <circle cx="40" cy="34" r="3" fill="#1E3A8A"/><circle cx="40" cy="50" r="3" fill="#1E3A8A"/><circle cx="40" cy="66" r="3" fill="#1E3A8A"/>
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
  {secretaryQueue.length?<section className="work-section primary">
    <div className="section-head"><div><h2>Việc cần làm trước</h2><p>{secretaryHeadline} Hệ thống đã xếp theo hạn, trạng thái chờ xử lý và mức ưu tiên.</p></div></div>
    <div className="work-list">{secretaryQueue.map(r=><div className={`work-row ${r.is_overdue||r.workflow_status==="RETURNED"?"danger":""}`} key={r.action_id}><div className="work-main"><strong>{r.title}</strong><small>{r.record_code} · {workCue(r)}{r.assignment_target_type==="GROUP"?` · ${assignedGroupMap.get(r.assignee_group_id)||"Nhóm phân công"}`:""}</small></div><div><span className={`status-badge ${priorityTone(r.priority)}`}>{priorityLabel(r.priority)}</span></div><div><StatusBadge status={r.is_overdue?"OVERDUE":r.workflow_status}/></div><Link className="button primary small" href={`/tasks/${r.record_id}`}>Làm ngay</Link></div>)}</div>
  </section>:null}
  {(isQlcl||isDepartmentHead)&&roleQueue.length?<section className="work-section"><div className="section-head"><div><div style={{display:"flex",gap:8,alignItems:"center"}}><h2>{roleQueueTitle}</h2><span className="role-badge">{isQlcl?"TOÀN VIỆN":user.primaryDepartmentName||"KHOA/PHÒNG"}</span></div><p>Chỉ các việc cần anh/chị can thiệp theo vai trò quản lý; không trộn với việc cá nhân.</p></div></div><div className="work-list">{roleQueue.map(r=><div className={`work-row ${r.is_overdue||r.workflow_status==="RETURNED"?"danger":""}`} key={`role-${r.action_id}`}><div className="work-main"><strong>{r.title}</strong><small>{roleDepartmentMap.get(r.lead_department_id)||(departmentActionIds.includes(r.action_id)?user.primaryDepartmentName:"Chưa gán khoa/phòng")} · {workCue(r)}</small></div><div><span className={`status-badge ${priorityTone(r.priority)}`}>{priorityLabel(r.priority)}</span></div><div><StatusBadge status={r.is_overdue?"OVERDUE":r.workflow_status}/></div><Link className="button secondary small" href={`/tasks/${r.record_id}`}>Mở</Link></div>)}</div></section>:null}
  {attention.length?<section className="work-section"><details><summary>{attentionTitle} · {attention.length} thông báo chưa đọc</summary><div className="attention-list">{attention.slice(0,8).map(n=><div className="attention-item" key={n.id}><div><strong>{n.title}</strong><small>{n.message||"Có hồ sơ cần xử lý."}</small></div>{n.target_route?<Link className="button secondary small" href={n.target_route}>Mở hồ sơ</Link>:null}</div>)}</div></details></section>:null}

  <div className="work-columns">
   <div style={{display:"grid",gap:14}}>
    <TaskExtensionReviewQueue userId={user.id}/>
    <PersonalReminders initialRows={personalReminders} organizationId={user.organizationId!} userId={user.id}/>
    {/* Tabs/search/pagination are plain query-string links + a GET form (no
        client state), so there is no reason they were desktop-only — that
        left mobile with no way to filter by tab, search, or reach page 2+.
        Only the TABLE vs CARD-LIST body actually needs to differ by
        viewport; the surrounding controls now render on both. */}
    <section id="all-work" className="work-section">
     <nav className="work-tabs" aria-label="Lọc việc được giao">
      <Link href={tabHref("ALL")} className={`work-tab ${tab==="ALL"?"active":""}`}>Tất cả · {allWorkRows.length}</Link>
      <Link href={tabHref("OPEN")} className={`work-tab ${tab==="OPEN"?"active":""}`}>Chưa hoàn thành · {allWorkRows.filter(r=>!r.isDone).length}</Link>
      <Link href={tabHref("DONE")} className={`work-tab ${tab==="DONE"?"active":""}`}>Đã hoàn thành · {allWorkRows.filter(r=>r.isDone).length}</Link>
      <Link href={tabHref("REMINDER")} className={`work-tab ${tab==="REMINDER"?"active":""}`}>Việc cá nhân · {unifiedReminderRows.length}</Link>
      {unifiedAssignedRows.length?<Link href={tabHref("ASSIGNED")} className={`work-tab ${tab==="ASSIGNED"?"active":""}`} title="Việc theo quy trình chính thức (Action/CAPA/Audit...) được giao qua hồ sơ, khác với note cá nhân tự tạo">Việc được giao · {unifiedAssignedRows.length}</Link>:null}
      {waitingCount?<Link href={tabHref("WAITING")} className={tab==="WAITING"?"work-tab active":"work-tab"} title="Việc đang đợi người khác phản hồi hoặc hoàn thành phần việc liên quan">Chờ phản hồi · {waitingCount}</Link>:null}
      {watchCount?<Link href={tabHref("WATCH")} className={`work-tab ${tab==="WATCH"?"active":""}`} title="Việc còn mở có hạn trong tương lai, cần tiếp tục theo dõi tiến độ">Cần theo dõi · {watchCount}</Link>:null}
     </nav>
     <form method="get" className="work-search-row">
      <input type="hidden" name="tab" value={tab}/>
      {weekStart?<input type="hidden" name="week" value={weekStart}/>:null}
      <div className="search-box"><Icon name="search" size={16}/><input name="q" defaultValue={searchQuery} placeholder="Tìm theo tên công việc / hồ sơ..."/></div>
      <button type="submit" className="button secondary small">Tìm kiếm</button>
     </form>
     <div className="week-filter-row">
      <div className="week-nav-controls">
       <Link href={weekHref(addDays(weekNavBase,-7))} className="week-nav-arrow" aria-label="Tuần trước" title="Tuần trước"><Icon name="arrow-left" size={16}/></Link>
       <span className="week-filter-label">{weekStart&&weekEnd?`Tuần ${formatDate(weekStart)} – ${formatDate(weekEnd)}`:"Xem theo tuần"}</span>
       <Link href={weekHref(addDays(weekNavBase,7))} className="week-nav-arrow" aria-label="Tuần sau" title="Tuần sau"><Icon name="arrow-right" size={16}/></Link>
      </div>
      <div className="week-nav-links">
       {weekStart!==thisWeekMonday?<Link href={weekHref(thisWeekMonday)} className="week-nav-link">Tuần này</Link>:null}
       {weekStart?<Link href={weekHref(null)} className="week-nav-link clear">Bỏ lọc tuần</Link>:null}
      </div>
     </div>
     {weekStart&&weekEnd?<p className="week-filter-report" role="status">
      Báo cáo tuần {formatDate(weekStart)} – {formatDate(weekEnd)}: <Link href={reportTabHref("DONE")} className="week-report-link done"><strong>{weekDoneRows.length} đã xong</strong></Link> · <Link href={reportTabHref("OPEN")} className="week-report-link pending"><strong>{weekPendingRows.length} chưa xong</strong></Link> <span className="muted">(đã xong = hoàn thành trong tuần; chưa xong = còn mở, có hạn trong tuần).</span>
     </p>:null}
     {/* Bỏ 3 cột theo phản hồi thực tế: ô chọn dòng (chưa từng gắn bulk action
         thật — xem work-row-checkbox.tsx), "Liên quan đến" và "Người giao"
         (luôn "—" với note/việc cá nhân, không có chỗ nhập nên không có
         nghĩa gì để hiển thị). Thêm "Ngày giao việc" (createdAt) thay vào
         chỗ trống đó — cột này luôn có giá trị thật cho mọi dòng. */}
     <div className="table-wrap all-table desktop-only"><table><thead><tr><th>#</th><th>Tiêu đề công việc</th><th>Loại</th><th>Ngày giao việc</th><th>Ưu tiên</th><th>Hạn xử lý / Hoàn thành</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{tableRowsPage.map((r,idx)=><tr key={r.key}><td>{(currentPage-1)*PAGE_SIZE+idx+1}</td><td>{r.source==="reminder"||r.source==="legacy"?<PersonalTaskProgressTitle title={r.title} note={r.followup} taskId={r.sourceId!} source={r.source} ownerId={user.id}/>:<Link className="table-link" href={r.href}>{r.title}</Link>}</td><td>{r.typeLabel}</td><td>{r.createdAt?formatDate(r.createdAt):"—"}</td><td><span className={`status-badge ${priorityTone(r.priority)}`}>{priorityLabel(r.priority)}</span></td><td className={r.isOverdue?"text-danger":r.isDone?"text-success":""}>{dueOrCompletedLabel(r)}</td><td><StatusBadge status={r.statusLabel}/></td><td>{(r.source==="reminder"||r.source==="legacy")&&r.sourceId?<UnifiedPersonalTaskActions id={r.sourceId} source={r.source} ownerId={user.id} initialNote={r.followup} isDone={r.isDone} title={r.title}/>:r.sourceType&&r.sourceId?<WorkFollowupControl sourceType={r.sourceType} sourceId={r.sourceId} initial={r.followup}/>:null}</td></tr>)}{!tableRowsPage.length?<tr><td colSpan={8}><div className="empty-state">Không có việc phù hợp.</div></td></tr>:null}</tbody></table></div>
     <div className="mobile-only work-card-list">{tableRowsPage.map(r=><article className={`my-work-card ${r.isOverdue?"overdue":""}`} key={r.key}><strong>{r.source==="reminder"||r.source==="legacy"?<PersonalTaskProgressTitle title={r.title} note={r.followup} taskId={r.sourceId!} source={r.source} ownerId={user.id}/>:r.title}</strong><small>{r.typeLabel} · Giao: {r.createdAt?formatDate(r.createdAt):"—"} · {dueOrCompletedLabel(r)}</small><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{(r.source==="reminder"||r.source==="legacy")&&r.sourceId?<UnifiedPersonalTaskActions id={r.sourceId} source={r.source} ownerId={user.id} initialNote={r.followup} isDone={r.isDone} title={r.title}/>:<><Link className="button primary small" href={r.href}>Mở</Link>{r.sourceType&&r.sourceId?<WorkFollowupControl sourceType={r.sourceType} sourceId={r.sourceId} initial={r.followup}/>:null}</>}</div></article>)}{!tableRowsPage.length?<div className="empty-state">Không có việc phù hợp.</div>:null}</div>
     {weekScoped.length?<div className="work-pagination"><span>Hiển thị {(currentPage-1)*PAGE_SIZE+1}-{Math.min(currentPage*PAGE_SIZE,weekScoped.length)} của {weekScoped.length} bản ghi</span><div className="work-pagination-pages">{Array.from({length:totalPages},(_,i)=>i+1).map(p=><Link key={p} href={pageHref(p)} className={`button small ${p===currentPage?"primary":"secondary"}`}>{p}</Link>)}</div></div>:null}
    </section>
   </div>
  </div>
  {firstError?<div className="alert error">Một phần dữ liệu tác nghiệp chưa tải được: {firstError.message}</div>:null}
 </div>
}