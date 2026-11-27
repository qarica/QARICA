import { PersonalTaskProgressTitle } from "@/components/personal-task-progress-title";
import { UnifiedPersonalTaskActions } from "@/components/unified-personal-task-actions";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { MyWorkSyncClient } from "@/components/my-work-sync-client";
import { MyWorkExportButton } from "@/components/my-work-export-button";
import { MyWorkKanban, type MyWorkKanbanRow } from "@/components/my-work-kanban";
import { MyWorkMatrix } from "@/components/my-work-matrix";
import { EISENHOWER_ACTION, EISENHOWER_LABEL, EISENHOWER_TONE, workRowQuadrant } from "@/lib/eisenhower";
import { MyWorkHanded } from "@/components/my-work-handed";
import { loadHandedWork } from "@/lib/my-work-handed";
import { createAdminClient } from "@/lib/supabase/admin";
import { WorkReassignButton } from "@/components/work-reassign-button";
import { workKanbanColumn } from "@/lib/my-work-kanban";
import { WorkFollowupControl } from "@/components/work-followup-control";
import { PageHeader } from "@/components/page-header";
import { PersonalReminders } from "@/components/personal-reminders";
import { RECORD_TYPE_LABEL } from "@/components/record-traceability-panel";
import { StatusBadge } from "@/components/status-badge";
import { hasPermission, requirePermission, requireUserContext } from "@/lib/auth";
import { EMR_CATEGORIES } from "@/lib/emr-categories";
import { formatDate, humanStatus } from "@/lib/format";
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
function workScore(row:any){const days=Number(row.days_to_due||0);let score=0;if(row.is_overdue)score+=200+Math.abs(days)*5;if(row.workflow_status==="RETURNED")score+=150;if(["EVIDENCE_SUBMITTED","VERIFYING"].includes(String(row.workflow_status)))score+=135;if(days===0)score+=160;if(days>0&&days<=3)score+=100;if(row.priority==="CRITICAL")score+=90;else if(row.priority==="URGENT")score+=70;else if(row.priority==="HIGH")score+=40;return score}
// Đề xuất báo cáo kiểm thử menu: "gắn đầu việc Kế hoạch công việc
// vào Việc của tôi" — work_plan_items không có priority riêng, chỉ có
// eisenhower_quadrant (2 trục quan trọng x khẩn cấp). Quy đổi gần đúng sang
// thang priority 1 trục sẵn có để tái dùng đúng priorityLabel/priorityTone,
// không tạo badge/màu riêng cho 1 nguồn dữ liệu: P1 (quan trọng+khẩn cấp)
// ->CRITICAL, P2 (quan trọng, không khẩn)->HIGH, P3 (không quan trọng,
// khẩn cấp)->URGENT (giữ tính khẩn cấp vì đó là tín hiệu quan trọng hơn ở
// màn hình này), P4->LOW.
function eisenhowerToPriority(quadrant?:string|null){if(quadrant==="P1")return"CRITICAL";if(quadrant==="P2")return"HIGH";if(quadrant==="P3")return"URGENT";return"LOW"}
function workCue(row:any){const days=Number(row.days_to_due||0);if(row.is_overdue){const late=Math.abs(days);if(late>=7)return`Đôn đốc ngay · quá hạn ${late} ngày`;return`Xử lý ngay · quá hạn ${late} ngày`}if(["EVIDENCE_SUBMITTED","VERIFYING"].includes(String(row.workflow_status)))return"Cần kiểm tra / xác minh";if(row.workflow_status==="RETURNED")return"Cần bổ sung sau khi bị trả lại";if(days===0)return"Hoàn tất trong hôm nay";if(days>0&&days<=3)return`Chuẩn bị xử lý · còn ${days} ngày`;if(["CRITICAL","URGENT"].includes(String(row.priority)))return"Ưu tiên xử lý sớm";return days>0?`Theo dõi · còn ${days} ngày`:"Cần kiểm tra tiến độ"}
// Báo cáo thực tế: việc đã hoàn thành vẫn chỉ hiện hạn xử lý cũ ("08/10/2026")
// thay vì ngày hoàn thành thật — nhìn vào không biết việc đó xong lúc nào,
// đặc biệt khó dùng khi đây chính là màn hình dùng để báo cáo việc đã xong
// trong tuần. Việc đã xong hiện "Hoàn thành: DD/MM/YYYY" (completedAt); việc
// chưa xong vẫn hiện hạn xử lý như cũ.
function dueOrCompletedLabel(row:{isDone:boolean;completedAt:string|null;dueDate:string|null}){if(row.isDone)return row.completedAt?`Hoàn thành: ${formatDate(row.completedAt)}`:"Đã hoàn thành";return row.dueDate?formatDate(row.dueDate):"Không có hạn"}
const ACTION_SELECT="action_id,record_id,record_code,title,work_year,workflow_status,priority,due_date,is_overdue,days_to_due,lead_department_id,assignee_user_id,assignment_target_type,assignee_group_id,updated_at,created_at";

export default async function TasksPage({searchParams}:{searchParams:Promise<{tab?:string;q?:string;page?:string;week?:string;month?:string;view?:string}>}){
 const {user}=await requireUserContext();requirePermission(user,"tasks.view");const year=await getWorkYear();const supabase=await createClient();const today=hcmToday();
 const {tab:rawTab,q:rawQ,page:rawPage,week:rawWeek,month:rawMonth,view:rawView}=await searchParams;
 // Cách xem: danh sách (mặc định) hoặc Kanban theo hạn — cùng dữ liệu, cùng bộ lọc tab/tìm kiếm/tuần.
 const rawViewKey=String(rawView).toLowerCase();const view:"list"|"kanban"|"matrix"=rawViewKey==="kanban"?"kanban":rawViewKey==="matrix"?"matrix":"list";
 const viewParam=view!=="list"?`&view=${view}`:"";
 // Bộ lọc nhanh hiện trên màn hình: Tất cả / Đang mở / Quá hạn / Hôm nay / 7 ngày tới / Chờ phản hồi / Đã xong (cùng cách xếp cột với Kanban).
 // REMINDER/ASSIGNED/WATCH không còn là nút nhưng vẫn được nhận để các liên kết cũ không hỏng.
 type WorkTab="HANDED"|"ALL"|"OPEN"|"OVERDUE"|"TODAY"|"NEXT7"|"REMINDER"|"ASSIGNED"|"WAITING"|"WATCH"|"DONE";
 const tab=(["HANDED","ALL","OPEN","OVERDUE","TODAY","NEXT7","REMINDER","ASSIGNED","WAITING","WATCH","DONE"].includes(String(rawTab).toUpperCase())?String(rawTab).toUpperCase():(String(rawView).toLowerCase()==="kanban"?"ALL":"OPEN")) as WorkTab;
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
 // Lọc theo THÁNG (?month=YYYY-MM): cùng ngữ nghĩa với lọc tuần (xong = hoàn thành trong tháng;
 // chưa xong = còn mở, hạn đến hết tháng, gồm cả việc quá hạn từ trước). Tuần và tháng loại trừ nhau, tuần ưu tiên.
 const rawMonthValue=String(rawMonth||"").trim();
 const monthKey=!weekStart&&/^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonthValue)?rawMonthValue:null;
 const monthStart=monthKey?`${monthKey}-01`:null;
 const monthEnd=monthKey?(()=>{const [y,m]=monthKey.split("-").map(Number);return `${monthKey}-${String(new Date(Date.UTC(y,m,0)).getUTCDate()).padStart(2,"0")}`})():null;
 const thisMonthKey=today.slice(0,7);
 const shiftMonth=(k:string,d:number)=>{const [y,m]=k.split("-").map(Number);const dt=new Date(Date.UTC(y,m-1+d,1));return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,"0")}`};
 const monthNavBase=monthKey||thisMonthKey;
 const monthLabel=(k:string)=>`${k.slice(5,7)}/${k.slice(0,4)}`;
 const pStart=weekStart||monthStart;const pEnd=weekEnd||monthEnd;
 const periodParam=weekStart?`&week=${weekStart}`:monthKey?`&month=${monthKey}`:"";
 const periodLabel=weekStart&&weekEnd?`tuần ${formatDate(weekStart)} – ${formatDate(weekEnd)}`:monthKey?`tháng ${monthLabel(monthKey)}`:"";
 const monthHref=(k:string|null)=>{const params=new URLSearchParams();params.set("tab",tab);if(searchQuery)params.set("q",searchQuery);if(k)params.set("month",k);if(view!=="list")params.set("view",view);return `?${params.toString()}#all-work`};
 const weekNavBase=weekStart||thisWeekMonday;
 const weekHref=(w:string|null)=>{const params=new URLSearchParams();params.set("tab",tab);if(searchQuery)params.set("q",searchQuery);if(w)params.set("week",w);if(view!=="list")params.set("view",view);return `?${params.toString()}#all-work`};
 const isQlcl=user.roleCodes.includes("QLCL_MANAGER")||user.roleCodes.includes("HOI_DONG_QLCL");const isDepartmentHead=user.roleCodes.includes("DEPARTMENT_HEAD");
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
 const [directActionsRes,groupActionsRes,departmentActionsRes,personalRemindersRes]=await Promise.all([
  supabase.from("vw_actions_dashboard").select(ACTION_SELECT).eq("work_year",year).eq("assignee_user_id",user.id).order("due_date",{ascending:true,nullsFirst:false}),
  myGroupActionRecordIds.length
   ? supabase.from("vw_actions_dashboard").select(ACTION_SELECT).eq("work_year",year).in("record_id",myGroupActionRecordIds).order("due_date",{ascending:true,nullsFirst:false})
   : Promise.resolve({data:[] as any[],error:null}),
  departmentActionIds.length
   ? supabase.from("vw_actions_dashboard").select(ACTION_SELECT).eq("work_year",year).in("action_id",departmentActionIds).order("due_date",{ascending:true,nullsFirst:false})
   : Promise.resolve({data:[] as any[],error:null}),
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
 // Đề xuất báo cáo kiểm thử menu: người được gán vai trò R (thực hiện) hoặc
 // A (chịu trách nhiệm chính) trên 1 đầu việc Kế hoạch công việc trước đây
 // không thấy việc đó ở "Việc của tôi" trừ khi tự vào module riêng kiểm
 // tra — dễ bỏ sót việc được giao. work_plan_items vẫn là nguồn dữ liệu
 // duy nhất (không copy sang bảng khác); chỉ lấy đầu việc có mình là người phụ trách.
 const workPlanItemsRes=await supabase.from("work_plan_items").select("id,work_plan_id,title,due_date,eisenhower_quadrant,status,created_at,updated_at").eq("assignee_user_id",user.id).neq("status","CANCELLED");
 const myWorkPlanItems=(workPlanItemsRes.data??[]) as any[];
 const workPlanIds=Array.from(new Set(myWorkPlanItems.map((i:any)=>i.work_plan_id)));
 const workPlansRes=workPlanIds.length?await supabase.from("work_plans").select("id,title").in("id",workPlanIds):{data:[] as any[],error:null};
 const workPlanTitleMap=new Map((workPlansRes.data??[]).map((p:any)=>[p.id,p.title]));
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
 const rows=sourceRows.filter(r=>r.workflow_status!=="CANCELLED"&&!hidden.has(r.record_id)&&!legacyReminderActionIds.has(r.action_id));const personalReminders=(personalRemindersRes.data??[]) as any[];
 const {data:legacyPersonalTasks,error:legacyPersonalError}=await supabase.from("personal_workspace_items").select("id,title,content,category,due_at,status,completed_at,item_type,created_at").eq("owner_user_id",user.id).eq("item_type","TASK").is("deleted_at",null).limit(500);const workFollowupSourceIds=Array.from(new Set([...rows.map((r:any)=>r.action_id),...myEmrItems.map((r:any)=>r.id)].filter(Boolean))) as string[];
 const workFollowupsRes=workFollowupSourceIds.length
  ? await supabase.from("work_followups").select("id,source_type,source_id,state,waiting_for_label,follow_up_at,note").eq("owner_user_id",user.id).in("source_id",workFollowupSourceIds).in("state",["ACTIVE","WAITING"])
  : {data:[],error:null};
 const workFollowups=(workFollowupsRes.data??[]) as any[];
 const followupBySource=new Map(workFollowups.map((f:any)=>[f.source_type+":"+f.source_id,f]));
 const scopedRows=scopeSourceRows.filter(r=>!["COMPLETED","CANCELLED","CLOSED","NOT_APPLICABLE"].includes(String(r.workflow_status))&&!hidden.has(r.record_id)&&!legacyReminderActionIds.has(r.action_id));const firstError=legacyPersonalError||actionsRes.error||personalRemindersRes.error||scopeActionsRes.error||recordRes.error||creatorsRes.error||roleDepartmentsRes.error||assignedGroupsRes.error||recurringLegacyRes.error||emrItemsRes.error||workFollowupsRes.error||workPlanItemsRes.error||workPlansRes.error;
 const roleQueue=[...scopedRows].filter(r=>r.is_overdue||Number(r.days_to_due)===0||(Number(r.days_to_due)>0&&Number(r.days_to_due)<=3)||["RETURNED","EVIDENCE_SUBMITTED","VERIFYING"].includes(String(r.workflow_status))||["CRITICAL","URGENT"].includes(String(r.priority))).sort((a,b)=>workScore(b)-workScore(a)).slice(0,8);
 const roleQueueTitle=isQlcl?"Hàng đợi điều phối QLCL":isDepartmentHead?"Hàng đợi của khoa/phòng":"";

 type UnifiedRow={key:string;title:string;typeLabel:string;relatedTo:string;priority:string|null;dueDate:string|null;completedAt:string|null;createdAt:string|null;statusLabel:string;isOverdue:boolean;isDone:boolean;isWatch:boolean;assignedBy:string;href:string;source:"action"|"reminder"|"emr"|"legacy"|"work_plan";sourceId:string|null;sourceType:"ACTION"|"EMR"|null;followup:any|null;canReassign?:boolean;reassignSource?:"REMINDER"|"ACTION"|"WORK_PLAN"};
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
  // Chuyển được khi mình là người thực hiện trực tiếp và việc chưa vào bước xác minh/đóng (hàm DB kiểm tra lại).
  canReassign:r.assignment_target_type==="USER"&&r.assignee_user_id===user.id&&["NOT_STARTED","IN_PROGRESS","RETURNED"].includes(String(r.workflow_status)),reassignSource:"ACTION",
 }));
 const unifiedReminderRows:UnifiedRow[]=[...personalReminders.map((p:any):UnifiedRow=>({
  key:`p-${p.id}`,title:p.title,typeLabel:"Note cá nhân",relatedTo:"—",priority:p.priority,
  dueDate:p.due_at?dateOnly(p.due_at):null,completedAt:p.status==="COMPLETED"&&p.completed_at?dateOnly(p.completed_at):null,
  createdAt:p.created_at?dateOnly(p.created_at):null,
  statusLabel:p.status==="COMPLETED"?"COMPLETED":(p.due_at&&dateOnly(p.due_at)<today?"OVERDUE":p.status),
  isOverdue:p.status==="OPEN"&&!!p.due_at&&dateOnly(p.due_at)<today,isDone:p.status==="COMPLETED",
  isWatch:p.status==="OPEN"&&(!p.due_at||dateOnly(p.due_at)>=today),
  assignedBy:"—",href:"/tasks?tab=REMINDER#all-work",source:"reminder",sourceId:p.id,sourceType:null,followup:p.note??null,canReassign:p.status==="OPEN",reassignSource:"REMINDER",
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
 // Đề xuất báo cáo kiểm thử menu: đầu việc Kế hoạch công việc giao cho
 // mình — chưa có trang chi tiết theo id (giống Cần đào tạo/Tự đọc hiểu ở
 // module khác) nên chỉ liên kết về trang danh sách /work-plans, không có
 // WorkFollowupControl (chưa có cơ chế "đang chờ" cho nguồn này).
 const unifiedWorkPlanRows:UnifiedRow[]=myWorkPlanItems.map((item:any):UnifiedRow=>{
  const isDone=item.status==="DONE";
  const isOverdue=!isDone&&!!item.due_date&&item.due_date<today;
  return{
   key:`wp-${item.id}`,title:item.title,
   typeLabel:"Kế hoạch công việc · Phụ trách",
   relatedTo:workPlanTitleMap.get(item.work_plan_id)||"—",priority:eisenhowerToPriority(item.eisenhower_quadrant),
   dueDate:item.due_date,completedAt:isDone&&item.updated_at?dateOnly(item.updated_at):null,
   createdAt:item.created_at?dateOnly(item.created_at):null,
   statusLabel:isDone?"COMPLETED":(isOverdue?"OVERDUE":item.status),isOverdue,isDone,
   isWatch:!isDone&&(!item.due_date||item.due_date>=today),
   assignedBy:"—",href:"/work-plans",source:"work_plan",sourceId:item.id,sourceType:null,followup:null,canReassign:item.status==="OPEN",reassignSource:"WORK_PLAN",
  };
 });
 const unifiedAssignedRows=[...unifiedActionRows,...unifiedEmrRows,...unifiedWorkPlanRows];
 const allWorkRows=[...unifiedAssignedRows,...unifiedReminderRows].sort((a,b)=>(a.dueDate||"9999").localeCompare(b.dueDate||"9999"));
 // Báo cáo thực tế: tab trống (0 việc) vẫn luôn hiện trong thanh tab, gây
 // thắc mắc "3 loại này là gì" — ẩn hẳn pill của tab khi không có việc nào
 // thuộc loại đó, thay vì luôn hiện cả 7 tab bất kể có dữ liệu hay không.
 const waitingCount=allWorkRows.filter(r=>r.followup?.state==="WAITING").length;
 // Tab Đã hoàn thành sắp theo completedAt GẦN NHẤT -> XA NHẤT (giảm dần) —
 // khác với mọi tab khác vẫn giữ nguyên thứ tự theo hạn xử lý tăng dần của
 // allWorkRows, vì "đã xong" cần đọc như một nhật ký/báo cáo (việc mới hoàn
 // thành lên trên), không phải một hàng đợi cần xử lý tiếp theo.
 const byTab=tab==="OPEN"?allWorkRows.filter(r=>!r.isDone):tab==="OVERDUE"||tab==="TODAY"||tab==="NEXT7"?allWorkRows.filter(r=>workKanbanColumn(r,today)===tab):tab==="REMINDER"?unifiedReminderRows:tab==="ASSIGNED"?unifiedAssignedRows:tab==="WAITING"?allWorkRows.filter(r=>r.followup?.state==="WAITING"):tab==="WATCH"?allWorkRows.filter(r=>r.isWatch):tab==="DONE"?allWorkRows.filter(r=>r.isDone).sort((a,b)=>(b.completedAt||"").localeCompare(a.completedAt||"")):allWorkRows;
 const searched=searchQuery?byTab.filter(r=>r.title.toLowerCase().includes(searchQuery.toLowerCase())||r.relatedTo.toLowerCase().includes(searchQuery.toLowerCase())):byTab;
 // Ở tab Đã hoàn thành, "trong tuần" nghĩa là hoàn thành trong tuần đó
 // (completedAt, phải nằm trong đúng khoảng tuần). Các dòng CHƯA hoàn thành
 // thì lọc theo "còn tồn đọng tính đến hết tuần này": chỉ cần dueDate<=weekEnd
 // — KHÔNG đòi dueDate>=weekStart, vì việc quá hạn (hạn nằm trước cả tuần
 // đang xem) vẫn chưa xong thì vẫn phải hiện trong báo cáo tuần, không phải
 // chỉ việc mới phát sinh hạn đúng trong tuần đó. Báo cáo thực tế: lọc tuần
 // trước đây chỉ bắt hạn nằm trong [weekStart,weekEnd] nên các việc quá hạn
 // từ trước bị rớt khỏi danh sách "chưa xong".
 const weekScoped=pStart&&pEnd?searched.filter(r=>r.isDone?(!!r.completedAt&&r.completedAt>=pStart&&r.completedAt<=pEnd):(!!r.dueDate&&r.dueDate<=pEnd)):searched;
 const totalPages=Math.max(1,Math.ceil(weekScoped.length/PAGE_SIZE));
 const currentPage=Math.min(page,totalPages);
 const tableRowsPage=weekScoped.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
 // Xuất Excel: TOÀN BỘ danh sách đang lọc (weekScoped — cùng nguồn với bảng, không cắt theo trang).
 const TAB_LABEL:Record<string,string>={ALL:"Tất cả",OPEN:"Chưa hoàn thành",DONE:"Đã hoàn thành",REMINDER:"Việc cá nhân",ASSIGNED:"Việc được giao",WAITING:"Chờ phản hồi",WATCH:"Cần theo dõi"};
 const exportRows=weekScoped.map(r=>{const f=r.followup;const note=typeof f==="string"?f:f&&typeof f==="object"?[f.state==="WAITING"?`Đang chờ${f.waiting_for_label?`: ${f.waiting_for_label}`:""}`:"",f.note||""].filter(Boolean).join(" — "):"";return{title:r.title,type:r.typeLabel,relatedTo:r.relatedTo,createdAt:r.createdAt?formatDate(r.createdAt):"—",priority:priorityLabel(r.priority),dueDate:r.dueDate?formatDate(r.dueDate):"—",completedAt:r.completedAt?formatDate(r.completedAt):"—",status:humanStatus(r.statusLabel),note}});
 const exportCaption=`Việc của tôi — ${TAB_LABEL[tab]}${periodLabel?` — ${periodLabel}`:""}${searchQuery?` — tìm "${searchQuery}"`:""} (xuất ngày ${formatDate(today)})`;
 const tabHref=(t:string)=>`?tab=${t}${searchQuery?`&q=${encodeURIComponent(searchQuery)}`:""}${periodParam}${viewParam}#all-work`;
 const pageHref=(p:number)=>`?tab=${tab}${searchQuery?`&q=${encodeURIComponent(searchQuery)}`:""}${periodParam}${viewParam}&page=${p}#all-work`;
 // Báo cáo "việc nào đã xong, việc nào chưa xong" trong tuần: tính từ TOÀN BỘ
 // allWorkRows (không phụ thuộc tab đang mở) để luôn ra đúng 2 số này dù đang
 // xem tab nào — đã xong = hoàn thành trong tuần (completedAt, đúng khoảng
 // tuần); chưa xong = còn mở, hạn xử lý rơi ĐẾN HẾT tuần này (dueDate<=weekEnd,
 // gồm cả việc đã quá hạn từ trước — không chỉ việc mới phát sinh hạn trong
 // tuần, nếu không sẽ bỏ sót đúng loại việc cần đôn đốc nhất). Không lọc theo
 // searchQuery vì đây là báo cáo tổng, không phải danh sách đang xem.
 const weekDoneRows=pStart&&pEnd?allWorkRows.filter(r=>r.isDone&&r.completedAt&&r.completedAt>=pStart&&r.completedAt<=pEnd):[];
 const weekPendingRows=pStart&&pEnd?allWorkRows.filter(r=>!r.isDone&&r.dueDate&&r.dueDate<=pEnd):[];
 const handed=await loadHandedWork(createAdminClient(),user.id);
 const pBadge=(r:{priority:string|null;dueDate:string|null;isDone:boolean})=>{if(r.isDone)return <span className="muted">—</span>;const q=workRowQuadrant(r.priority,r.dueDate,today);return <span className={`status-badge p-badge ${EISENHOWER_TONE[q]}`} title={`${EISENHOWER_LABEL[q]} — ${EISENHOWER_ACTION[q]}`}>{q}</span>};
 const colCounts={ALL:allWorkRows.length,OPEN:allWorkRows.filter(r=>!r.isDone).length,OVERDUE:allWorkRows.filter(r=>workKanbanColumn(r,today)==="OVERDUE").length,TODAY:allWorkRows.filter(r=>workKanbanColumn(r,today)==="TODAY").length,NEXT7:allWorkRows.filter(r=>workKanbanColumn(r,today)==="NEXT7").length,WAITING:waitingCount,DONE:allWorkRows.filter(r=>r.isDone).length};
 const reassignBtn=(r:UnifiedRow)=>r.canReassign&&r.reassignSource&&r.sourceId?<WorkReassignButton source={r.reassignSource} id={r.sourceId} title={r.title}/>:null;
 const viewHref=(v:"list"|"kanban"|"matrix")=>`?tab=${tab}${searchQuery?`&q=${encodeURIComponent(searchQuery)}`:""}${periodParam}${v!=="list"?`&view=${v}`:""}#all-work`;
 const kanbanRows:MyWorkKanbanRow[]=weekScoped.map(r=>({key:r.key,title:r.title,typeLabel:r.typeLabel,relatedTo:r.relatedTo,priority:r.priority,priorityLabel:priorityLabel(r.priority),priorityTone:priorityTone(r.priority),dueDate:r.dueDate,completedAt:r.completedAt,isDone:r.isDone,isOverdue:r.isOverdue,followup:r.followup,href:r.href}));
 const reportTabHref=(t:string)=>{const params=new URLSearchParams();params.set("tab",t);if(weekStart)params.set("week",weekStart);if(monthKey)params.set("month",monthKey);if(view!=="list")params.set("view",view);return `?${params.toString()}#all-work`};

 return <div className="page-stack my-work-page tqm-my-work">
  <MyWorkSyncClient/>
  <style>{`.tqm-my-work{max-width:1180px;margin:0 auto}.tqm-my-work .work-section{background:#fff;border:1px solid #d3dee3;border-radius:16px;overflow:hidden}.tqm-my-work .work-section.primary{border:2px solid #9fb8c5}.tqm-my-work .section-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:15px 17px;border-bottom:1px solid #e2e9ec;background:#f8fbfc}.tqm-my-work .section-head h2{margin:0;font-size:16px}.tqm-my-work .section-head p{margin:4px 0 0;color:#687a80;font-size:11px}.tqm-my-work .work-list{display:grid}.tqm-my-work .work-row{display:grid;grid-template-columns:minmax(0,1fr) 115px 110px auto;gap:12px;align-items:center;padding:13px 16px;border-bottom:1px solid #e7edef}.tqm-my-work .work-row:last-child{border-bottom:0}.tqm-my-work .work-row.danger{background:#fffafa}.tqm-my-work .work-main strong{font-size:12px}.tqm-my-work .work-main small{display:block;margin-top:4px;color:#718187;font-size:10px}.tqm-my-work .role-badge{display:inline-flex;border-radius:999px;background:#eaf2fb;color:#1d4f7a;padding:5px 8px;font-size:9px;font-weight:900}.tqm-my-work details{border-top:1px solid #dbe5e9}.tqm-my-work summary{cursor:pointer;padding:13px 16px;font-weight:800;font-size:12px;background:#fafcfd}.tqm-my-work .all-table{padding:0;max-width:100%;overflow-x:auto}.tqm-my-work .all-table table{width:100%;min-width:920px;table-layout:auto;border-collapse:collapse}.tqm-my-work .all-table th,.tqm-my-work .all-table td{padding:10px 8px;vertical-align:middle;white-space:normal;overflow-wrap:anywhere}.tqm-my-work .all-table th:nth-child(2),.tqm-my-work .all-table td:nth-child(2){min-width:180px;width:26%}.tqm-my-work .all-table th:last-child,.tqm-my-work .all-table td:last-child{min-width:175px;width:190px}.tqm-my-work .work-columns>div{min-width:0}.tqm-my-work .attention-list{display:grid;gap:8px;padding:12px 16px 16px}.tqm-my-work .attention-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;border:1px solid #e4eaec;border-radius:12px;padding:11px}.tqm-my-work .attention-item strong{font-size:11px}.tqm-my-work .attention-item small{display:block;margin-top:3px;color:#7b898f}.tqm-my-work .mobile-only{display:none}@media(max-width:760px){.tqm-my-work .work-row{grid-template-columns:1fr auto}.tqm-my-work .work-row>div:nth-child(2),.tqm-my-work .work-row>div:nth-child(3){display:none}.tqm-my-work .desktop-only{display:none}.tqm-my-work .mobile-only{display:grid;gap:10px}.tqm-my-work .my-work-card{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"title action" "cue action";column-gap:12px;row-gap:5px;align-items:center;padding:14px 14px;background:#fff;border:1px solid #d7e1e5;border-radius:14px;overflow:hidden}.tqm-my-work .my-work-card.overdue{border-color:#efc6c6;background:#fffafa}.tqm-my-work .my-work-card strong{grid-area:title;display:block;min-width:0;font-size:14px;line-height:1.35;overflow-wrap:anywhere}.tqm-my-work .my-work-card small{grid-area:cue;display:block;color:#687a80;font-size:11px;line-height:1.35}.tqm-my-work .my-work-card .button{grid-area:action;align-self:center;white-space:nowrap;padding:8px 10px;font-size:11px;min-height:auto}}
  .tqm-my-work .mw-chips{padding-top:12px}
  .tqm-my-work .mw-chip b{margin-left:4px;font-variant-numeric:tabular-nums}
  .tqm-my-work .mw-chip.danger:not(.active) b{color:#b91c1c}.tqm-my-work .mw-chip.warning:not(.active) b{color:#b45309}
  .tqm-my-work .mw-week{margin:2px 16px 6px;border-top:1px solid #e2e9ec}
  .tqm-my-work .mw-week>summary{cursor:pointer;padding:9px 0;font-size:12px;font-weight:700;color:#52656d}
  .tqm-my-work .mw-week .week-filter-row{padding:2px 0 8px}
  .tqm-my-work .mw-week .week-filter-report{margin:0 0 8px;border-radius:8px;border:0}
  .tqm-my-work .kb-toggle{display:inline-flex;gap:2px;margin:10px 16px 0;padding:3px;border:1px solid #d7e1e5;border-radius:10px;background:#f3f6f8}
  .tqm-my-work .kb-toggle-btn{padding:5px 14px;border-radius:8px;font-size:12px;font-weight:700;color:#52656d;text-decoration:none}
  .tqm-my-work .kb-toggle-btn.active{background:#fff;color:#0f172a;box-shadow:0 1px 2px rgba(15,23,42,.12)}
  .tqm-my-work .kb-board{display:grid;grid-template-columns:repeat(auto-fit,minmax(172px,1fr));gap:12px;padding:12px 16px 16px;align-items:start}
  .tqm-my-work .p-badge{font-weight:900;min-width:30px;justify-content:center}.tqm-my-work .all-table th:nth-child(6),.tqm-my-work .all-table td:nth-child(6){width:46px;text-align:center}
  .tqm-my-work .mx-note{margin:8px 16px 0;font-size:11px;color:#687a80}.tqm-my-work .mx-board{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:10px 16px 16px;align-items:start}.tqm-my-work .mx-col.tone-danger{border-top-color:#dc2626}.tqm-my-work .mx-col.tone-info{border-top-color:#3b82f6}.tqm-my-work .mx-col.tone-warning{border-top-color:#f59e0b}.tqm-my-work .mx-col.tone-muted{border-top-color:#94a3b8}.tqm-my-work .mx-action{padding:0 12px 4px;font-size:11px;font-weight:700;color:#52656d}@media(max-width:700px){.tqm-my-work .mx-board{grid-template-columns:1fr}}
  .tqm-my-work .kb-col{background:#f6f8fa;border:1px solid #e1e8ed;border-top:3px solid #94a3b8;border-radius:10px;min-width:0}
  .tqm-my-work .kb-col.danger{border-top-color:#dc2626}.tqm-my-work .kb-col.warning{border-top-color:#f59e0b}.tqm-my-work .kb-col.info{border-top-color:#3b82f6}.tqm-my-work .kb-col.wait{border-top-color:#8b5cf6}.tqm-my-work .kb-col.success{border-top-color:#16a34a}
  .tqm-my-work .kb-col-head{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px 6px;font-size:13px;color:#1e293b}
  .tqm-my-work .kb-count{min-width:24px;padding:1px 8px;border-radius:999px;background:#fff;border:1px solid #d7e1e5;font-size:11px;font-weight:800;text-align:center;font-variant-numeric:tabular-nums}
  .tqm-my-work .kb-cards{display:flex;flex-direction:column;gap:8px;padding:6px 10px 12px}
  .tqm-my-work .kb-card{display:flex;flex-direction:column;gap:6px;padding:10px 11px;background:#fff;border:1px solid #e1e8ed;border-radius:8px;color:inherit;text-decoration:none;min-width:0}
  .tqm-my-work .kb-card:hover{border-color:#93b4c4;box-shadow:0 1px 4px rgba(15,23,42,.1)}
  .tqm-my-work .kb-card:focus-visible{outline:2px solid #1d4ed8;outline-offset:2px}
  .tqm-my-work .kb-card.late{border-left:3px solid #dc2626}
  .tqm-my-work .kb-title{font-size:13px;font-weight:700;line-height:1.35;color:#0f172a;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
  .tqm-my-work .kb-meta{font-size:11px;color:#64748b;overflow-wrap:anywhere}
  .tqm-my-work .kb-foot{display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap}
  .tqm-my-work .kb-due{font-size:11px;color:#475569;font-variant-numeric:tabular-nums}
  .tqm-my-work .kb-col.danger .kb-due{color:#b91c1c;font-weight:700}
  .tqm-my-work .kb-wait{font-size:11px;font-weight:700;color:#6d28d9}
  .tqm-my-work .kb-empty,.tqm-my-work .kb-more{padding:10px;text-align:center;font-size:12px;color:#94a3b8}
  @media(max-width:640px){.tqm-my-work .kb-board{grid-template-columns:1fr}}
  .tqm-my-work .work-columns{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}
  .tqm-my-work .work-tabs{display:flex;gap:6px;flex-wrap:wrap;padding:12px 16px 0}.tqm-my-work .work-tab{display:inline-flex;align-items:center;min-height:32px;padding:0 12px;border-radius:999px;font-size:11px;font-weight:800;color:#52656d;border:1px solid #d7e1e5;background:#fff}.tqm-my-work .work-tab.active{background:#1D4ED8;border-color:#1D4ED8;color:#fff}
  .tqm-my-work .work-search-row{display:flex;gap:8px;align-items:center;padding:10px 16px}.tqm-my-work .work-search-row .search-box{flex:1;max-width:280px}
  .tqm-my-work .week-filter-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:8px 16px 10px}
  .tqm-my-work .week-nav-controls{display:flex;align-items:center;gap:8px}
  .tqm-my-work .week-nav-arrow{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;flex:0 0 30px;border-radius:8px;border:1px solid #d7e1e5;background:#fff;color:#334155}
  .tqm-my-work .week-nav-arrow:hover{background:#f1f5f9;border-color:#bcd0d8}
  .tqm-my-work .week-filter-label{font-size:12px;font-weight:800;color:#0f172a;white-space:nowrap}
  .tqm-my-work .week-nav-links{display:flex;align-items:center;gap:12px}
  .tqm-my-work .week-nav-link{font-size:11px;font-weight:700;color:#1D4ED8;text-decoration:underline;white-space:nowrap}
  .tqm-my-work .week-nav-link.clear{color:#64748b}
  .tqm-my-work .week-filter-report{margin:0;padding:9px 16px;background:#EEF2FF;color:#172554;font-size:12px;font-weight:600;border-top:1px solid #e2e9ec;border-bottom:1px solid #e2e9ec}
  .tqm-my-work .week-filter-report .muted{color:#64748b;font-weight:500}
  .tqm-my-work .week-report-link{text-decoration:underline}
  .tqm-my-work .week-report-link.done strong{color:#16a34a}
  .tqm-my-work .week-report-link.pending strong{color:#b45309}
  @media(max-width:760px){.tqm-my-work .week-filter-row{padding:8px 12px 10px}.tqm-my-work .week-nav-controls{flex:1 1 100%;justify-content:center}.tqm-my-work .week-nav-links{flex:1 1 100%;justify-content:center}}
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
  <PageHeader eyebrow={`CÔNG VIỆC HÔM NAY · ${year}`} title="Việc của tôi" description="Việc được giao, việc cá nhân, việc EMR và kế hoạch của bạn ở một nơi. Việc khẩn và đến hạn được đưa lên trước." icon="inbox"/>
  <PersonalReminders organizationId={user.organizationId!} userId={user.id}/>
    <section id="all-work" className="work-section">
     <nav className="work-tabs mw-chips" aria-label="Lọc việc nhanh">
      {([["OPEN","Đang mở","",colCounts.OPEN],["OVERDUE","Quá hạn","danger",colCounts.OVERDUE],["TODAY","Hôm nay","warning",colCounts.TODAY],["NEXT7","7 ngày tới","",colCounts.NEXT7],["WAITING","Chờ phản hồi","",colCounts.WAITING],["DONE","Đã xong","",colCounts.DONE],["ALL","Tất cả","",colCounts.ALL],["HANDED","Đã chuyển đi","",handed.rows.length]] as [string,string,string,number][]).map(([key,label,tone,count])=><Link key={key} href={tabHref(key)} className={`work-tab mw-chip ${tone} ${tab===key?"active":""}`} aria-current={tab===key?"true":undefined}>{label} <b>{count}</b></Link>)}
     </nav>
     <div className="kb-toggle" role="group" aria-label="Cách xem danh sách việc">
      <Link href={viewHref("list")} className={`kb-toggle-btn ${view==="list"?"active":""}`} aria-current={view==="list"?"true":undefined}>Danh sách</Link>
      <Link href={viewHref("kanban")} className={`kb-toggle-btn ${view==="kanban"?"active":""}`} aria-current={view==="kanban"?"true":undefined}>Kanban theo hạn</Link>
      <Link href={viewHref("matrix")} className={`kb-toggle-btn ${view==="matrix"?"active":""}`} aria-current={view==="matrix"?"true":undefined}>Ma trận Eisenhower</Link>
     </div>
     <form method="get" className="work-search-row">
      <input type="hidden" name="tab" value={tab}/>
      {view!=="list"?<input type="hidden" name="view" value={view}/>:null}
      {weekStart?<input type="hidden" name="week" value={weekStart}/>:null}{monthKey?<input type="hidden" name="month" value={monthKey}/>:null}
      <div className="search-box"><Icon name="search" size={16}/><input name="q" defaultValue={searchQuery} placeholder="Tìm theo tên công việc / hồ sơ..."/></div>
      <button type="submit" className="button secondary small">Tìm kiếm</button>
      <MyWorkExportButton rows={exportRows} caption={exportCaption} todayKey={today} weekStart={weekStart}/>
     </form>
     <details className="mw-week" open={!!pStart}>
      <summary>{periodLabel?`Đang lọc ${periodLabel}`:"Lọc / báo cáo theo tuần hoặc tháng"}</summary>
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
     <div className="week-filter-row">
      <div className="week-nav-controls">
       <Link href={monthHref(shiftMonth(monthNavBase,-1))} className="week-nav-arrow" aria-label="Tháng trước" title="Tháng trước"><Icon name="arrow-left" size={16}/></Link>
       <span className="week-filter-label">{monthKey?`Tháng ${monthLabel(monthKey)}`:"Xem theo tháng"}</span>
       <Link href={monthHref(shiftMonth(monthNavBase,1))} className="week-nav-arrow" aria-label="Tháng sau" title="Tháng sau"><Icon name="arrow-right" size={16}/></Link>
      </div>
      <div className="week-nav-links">
       {monthKey!==thisMonthKey?<Link href={monthHref(thisMonthKey)} className="week-nav-link">Tháng này</Link>:null}
       {monthKey?<Link href={monthHref(null)} className="week-nav-link clear">Bỏ lọc tháng</Link>:null}
      </div>
     </div>
     {pStart&&pEnd?<p className="week-filter-report" role="status">
      Báo cáo {periodLabel}: <Link href={reportTabHref("DONE")} className="week-report-link done"><strong>{weekDoneRows.length} đã xong</strong></Link> · <Link href={reportTabHref("OPEN")} className="week-report-link pending"><strong>{weekPendingRows.length} chưa xong</strong></Link> <span className="muted">(đã xong = hoàn thành trong {weekStart?"tuần":"tháng"}; chưa xong = còn mở, có hạn đến hết {weekStart?"tuần":"tháng"}).</span>
     </p>:null}
     </details>
     {/* Bỏ 3 cột theo phản hồi thực tế: ô chọn dòng (chưa từng gắn bulk action
         thật — xem work-row-checkbox.tsx), "Liên quan đến" và "Người giao"
         (luôn "—" với note/việc cá nhân, không có chỗ nhập nên không có
         nghĩa gì để hiển thị). Thêm "Ngày giao việc" (createdAt) thay vào
         chỗ trống đó — cột này luôn có giá trị thật cho mọi dòng. */}
     {tab==="HANDED"?<MyWorkHanded rows={handed.rows} error={handed.error}/>:view==="kanban"?<MyWorkKanban rows={kanbanRows} today={today}/>:view==="matrix"?<MyWorkMatrix rows={kanbanRows} today={today}/>:<>
     <div className="table-wrap all-table desktop-only"><table><thead><tr><th>#</th><th>Tiêu đề công việc</th><th>Loại</th><th>Ngày giao việc</th><th>Ưu tiên</th><th title="Ma trận Eisenhower: P1 làm ngay · P2 lên lịch · P3 giao/ủy thác · P4 bỏ qua">P</th><th>Hạn xử lý / Hoàn thành</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{tableRowsPage.map((r,idx)=><tr key={r.key}><td>{(currentPage-1)*PAGE_SIZE+idx+1}</td><td>{r.source==="reminder"||r.source==="legacy"?<PersonalTaskProgressTitle title={r.title} note={r.followup} taskId={r.sourceId!} source={r.source} ownerId={user.id}/>:<Link className="table-link" href={r.href}>{r.title}</Link>}</td><td>{r.typeLabel}</td><td>{r.createdAt?formatDate(r.createdAt):"—"}</td><td><span className={`status-badge ${priorityTone(r.priority)}`}>{priorityLabel(r.priority)}</span></td><td>{pBadge(r)}</td><td className={r.isOverdue?"text-danger":r.isDone?"text-success":""}>{dueOrCompletedLabel(r)}</td><td><StatusBadge status={r.statusLabel}/></td><td>{(r.source==="reminder"||r.source==="legacy")&&r.sourceId?<UnifiedPersonalTaskActions id={r.sourceId} source={r.source} ownerId={user.id} initialNote={r.followup} isDone={r.isDone} title={r.title}>{reassignBtn(r)}</UnifiedPersonalTaskActions>:r.sourceType&&r.sourceId?<WorkFollowupControl sourceType={r.sourceType} sourceId={r.sourceId} initial={r.followup}/>:null}{r.source==="reminder"||r.source==="legacy"?null:reassignBtn(r)}</td></tr>)}{!tableRowsPage.length?<tr><td colSpan={9}><div className="empty-state">Không có việc phù hợp.</div></td></tr>:null}</tbody></table></div>
     <div className="mobile-only work-card-list">{tableRowsPage.map(r=><article className={`my-work-card ${r.isOverdue?"overdue":""}`} key={r.key}><strong>{r.source==="reminder"||r.source==="legacy"?<PersonalTaskProgressTitle title={r.title} note={r.followup} taskId={r.sourceId!} source={r.source} ownerId={user.id}/>:r.title}</strong><small>{!r.isDone?<>{pBadge(r)}{" "}</>:null}{r.typeLabel} · Giao: {r.createdAt?formatDate(r.createdAt):"—"} · {dueOrCompletedLabel(r)}</small><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{(r.source==="reminder"||r.source==="legacy")&&r.sourceId?<UnifiedPersonalTaskActions id={r.sourceId} source={r.source} ownerId={user.id} initialNote={r.followup} isDone={r.isDone} title={r.title}>{reassignBtn(r)}</UnifiedPersonalTaskActions>:<><Link className="button primary small" href={r.href}>Mở</Link>{r.sourceType&&r.sourceId?<WorkFollowupControl sourceType={r.sourceType} sourceId={r.sourceId} initial={r.followup}/>:null}</>}{r.source==="reminder"||r.source==="legacy"?null:reassignBtn(r)}</div></article>)}{!tableRowsPage.length?<div className="empty-state">Không có việc phù hợp.</div>:null}</div>
     {weekScoped.length?<div className="work-pagination"><span>Hiển thị {(currentPage-1)*PAGE_SIZE+1}-{Math.min(currentPage*PAGE_SIZE,weekScoped.length)} của {weekScoped.length} bản ghi</span><div className="work-pagination-pages">{Array.from({length:totalPages},(_,i)=>i+1).map(p=><Link key={p} href={pageHref(p)} className={`button small ${p===currentPage?"primary":"secondary"}`}>{p}</Link>)}</div></div>:null}
     </>}
    </section>
  {(isQlcl||isDepartmentHead)&&roleQueue.length?<section className="work-section"><div className="section-head"><div><div style={{display:"flex",gap:8,alignItems:"center"}}><h2>{roleQueueTitle}</h2><span className="role-badge">{isQlcl?"TOÀN VIỆN":user.primaryDepartmentName||"KHOA/PHÒNG"}</span></div><p>Chỉ các việc cần anh/chị can thiệp theo vai trò quản lý; không trộn với việc cá nhân.</p></div></div><div className="work-list">{roleQueue.map(r=><div className={`work-row ${r.is_overdue||r.workflow_status==="RETURNED"?"danger":""}`} key={`role-${r.action_id}`}><div className="work-main"><strong>{r.title}</strong><small>{roleDepartmentMap.get(r.lead_department_id)||(departmentActionIds.includes(r.action_id)?user.primaryDepartmentName:"Chưa gán khoa/phòng")} · {workCue(r)}</small></div><div><span className={`status-badge ${priorityTone(r.priority)}`}>{priorityLabel(r.priority)}</span></div><div><StatusBadge status={r.is_overdue?"OVERDUE":r.workflow_status}/></div><Link className="button secondary small" href={`/tasks/${r.record_id}`}>Mở</Link></div>)}</div></section>:null}
  {firstError?<div className="alert error">Một phần dữ liệu tác nghiệp chưa tải được: {firstError.message}</div>:null}
 </div>
}