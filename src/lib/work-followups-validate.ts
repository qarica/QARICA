import{canViewWorkItem}from"@/lib/work-visibility";
export const isUuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export async function canFollowSource(auth:any,type:string,id:string){
if(!isUuid(id))return false;
const{data,error}=await auth.supabase.from("vw_work_items").select("source_type,source_id,record_id,organization_id,owner_user_id,metadata").eq("source_type",type).eq("source_id",id).limit(1);
if(error)throw error;
return !!data?.length&&canViewWorkItem(auth.context.user,data[0]);
}
