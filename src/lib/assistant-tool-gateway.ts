import{searchRecords}from"@/lib/assistant-search";import{getRecordContext}from"@/lib/assistant-record";import{canViewWorkItem}from"@/lib/work-visibility";import{safeLimit,type ToolContext}from"@/lib/assistant-tool-context";
type ToolName="search_records"|"get_my_work_summary"|"get_record_context";
export async function runAssistantTool(tool:ToolName,args:Record<string,unknown>,context:ToolContext){
if(tool==="search_records")return searchRecords(args,context);if(tool==="get_record_context")return getRecordContext(args,context);
if(tool==="get_my_work_summary"){const{data,error}=await context.supabase.from("vw_work_items").select("source_type,source_id,record_id,organization_id,owner_user_id,metadata,title,priority,normalized_state,due_at,target_route").eq("normalized_state","ACTIVE").eq("owner_user_id",context.user.id).order("due_at",{ascending:true,nullsFirst:false}).limit(safeLimit(args.limit,50));if(error)throw error;
const rows=(data??[]).filter((r:any)=>canViewWorkItem(context.user,r)),now=Date.now(),overdue=rows.filter((r:any)=>r.due_at&&new Date(r.due_at).getTime()<now),ids=rows.map((r:any)=>r.source_id);let waiting:any[]=[];
if(ids.length){const r=await context.supabase.from("work_followups").select("source_type,source_id,waiting_for_label,follow_up_at").eq("owner_user_id",context.user.id).in("source_id",ids).eq("state","WAITING");if(r.error)throw r.error;const keys=new Set(rows.map((x:any)=>x.source_type+":"+x.source_id));waiting=(r.data??[]).filter((x:any)=>keys.has(x.source_type+":"+x.source_id));}
return{tool,data:{open_count:rows.length,overdue_count:overdue.length,waiting_count:waiting.length,next_items:rows.slice(0,10),waiting:waiting.slice(0,10)},provenance:rows.slice(0,10).map((r:any)=>({source_type:r.source_type,source_id:r.source_id,href:r.target_route}))};}
throw Error("Tool không được phép.");}
export const ASSISTANT_READ_ONLY_TOOLS=["search_records","get_my_work_summary","get_record_context"]as const;
