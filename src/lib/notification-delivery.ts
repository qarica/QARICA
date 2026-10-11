import type { SupabaseClient } from "@supabase/supabase-js";
import { sendZaloOaText } from "@/lib/zalo-oa";
type AdminClient=SupabaseClient;type NewNotification={id:string;priority?:string|null};
const ZALO_PUSH_PRIORITIES=new Set(["HIGH","URGENT","CRITICAL"]);
const ZALO_PRIORITY_LABEL:Record<string,string>={CRITICAL:"nghiêm trọng",URGENT:"khẩn",HIGH:"cao"};
function nextRetry(attemptCount:number){const minutes=Math.min(120,5*Math.pow(2,Math.max(0,attemptCount-1)));return new Date(Date.now()+minutes*60_000).toISOString();}
export async function queueAndDeliverZalo(admin:AdminClient,userId:string,insertedRows:NewNotification[]|null|undefined){
 const fresh=(insertedRows??[]).filter(row=>row?.id&&ZALO_PUSH_PRIORITIES.has(String(row.priority||"")));
 if(fresh.length){const jobs=fresh.map(row=>({notification_id:row.id,recipient_user_id:userId,channel:"ZALO",delivery_status:"QUEUED",idempotency_key:"notification:"+row.id+":zalo",payload_class:"MINIMAL",updated_at:new Date().toISOString()}));const{error}=await admin.from("notification_deliveries").upsert(jobs,{onConflict:"channel,idempotency_key",ignoreDuplicates:true});if(error)console.error("[notification-delivery] queue Zalo failed:",error.message);}
 const now=new Date().toISOString();const{data:queued,error:queueError}=await admin.from("notification_deliveries").select("id,notification_id,attempt_count").eq("recipient_user_id",userId).eq("channel","ZALO").in("delivery_status",["QUEUED","FAILED"]).or("next_attempt_at.is.null,next_attempt_at.lte."+now).lt("attempt_count",5).order("created_at",{ascending:true}).limit(50);
 if(queueError||!queued?.length){if(queueError)console.error("[notification-delivery] load Zalo queue failed:",queueError.message);return{attempted:0,sent:0};}
 const ids=queued.map((job:any)=>job.notification_id);const[{data:profile,error:profileError},{data:notifications,error:notificationsError}]=await Promise.all([admin.from("profiles").select("zalo_user_id").eq("user_id",userId).maybeSingle(),admin.from("notifications").select("id,priority").in("id",ids).eq("recipient_user_id",userId)]);
 if(profileError||notificationsError){console.error("[notification-delivery] context load failed:",profileError?.message||notificationsError?.message);return{attempted:0,sent:0};}
 const zaloUserId=profile?.zalo_user_id;if(!zaloUserId){await admin.from("notification_deliveries").update({delivery_status:"SKIPPED",last_error:"Zalo user chưa được liên kết.",updated_at:new Date().toISOString()}).in("id",queued.map((job:any)=>job.id));return{attempted:queued.length,sent:0};}
 const priorityByNotification=new Map((notifications??[]).map((n:any)=>[n.id,String(n.priority||"")]));const countBySeverity=new Map<string,number>();
 for(const job of queued as any[]){const priority=priorityByNotification.get(job.notification_id);if(!priority||!ZALO_PUSH_PRIORITIES.has(priority))continue;countBySeverity.set(priority,(countBySeverity.get(priority)??0)+1);}
 if(!countBySeverity.size){await admin.from("notification_deliveries").update({delivery_status:"SKIPPED",last_error:"Notification không còn thuộc mức gửi Zalo.",updated_at:now}).in("id",queued.map((job:any)=>job.id));return{attempted:queued.length,sent:0};}
 const parts=Array.from(countBySeverity.entries()).map(([priority,count])=>String(count)+" thông báo mức "+(ZALO_PRIORITY_LABEL[priority]||priority));
 const text="QARICA: "+parts.join(", ")+" cần xử lý. Mở app QARICA để xem chi tiết.";const jobIds=queued.map((job:any)=>job.id);
 await admin.from("notification_deliveries").update({delivery_status:"SENDING",last_attempt_at:now,updated_at:now}).in("id",jobIds);
 const result=await sendZaloOaText(zaloUserId,text);
 if(result.ok){await admin.from("notification_deliveries").update({delivery_status:"SENT",sent_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()}).in("id",jobIds);return{attempted:queued.length,sent:queued.length};}
 if(result.skipped){await admin.from("notification_deliveries").update({delivery_status:"SKIPPED",last_error:result.error||"Zalo provider chưa cấu hình.",updated_at:new Date().toISOString()}).in("id",jobIds);return{attempted:queued.length,sent:0};}
 for(const job of queued as any[]){const attemptCount=Number(job.attempt_count||0)+1;await admin.from("notification_deliveries").update({delivery_status:"FAILED",attempt_count:attemptCount,next_attempt_at:attemptCount>=5?null:nextRetry(attemptCount),last_error:result.error||"Zalo send failed.",updated_at:new Date().toISOString()}).eq("id",job.id);}
 return{attempted:queued.length,sent:0};
}
