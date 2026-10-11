import{NextResponse}from"next/server";import{requireApiContext}from"@/lib/api-auth";import{canFollowSource,isUuid}from"@/lib/work-followups-validate";
const SOURCE=new Set(["ACTION","EMR","RECORD","OTHER"]),WAIT=new Set(["USER","DEPARTMENT","EXTERNAL_PARTY","DOCUMENT","APPROVAL"]);
const err=(s:string,n=400)=>NextResponse.json({error:s},{status:n});
export async function postFollowup(req:Request){const a=await requireApiContext();if(!a.ok)return a.response;const org=a.context.user.organizationId;if(!org)return err("Thiếu tổ chức.");const b=await req.json().catch(()=>({})),type=String(b.source_type||"").toUpperCase(),id=String(b.source_id||"").trim(),wait=b.waiting_for_type?String(b.waiting_for_type).toUpperCase():null;
if(!SOURCE.has(type)||!isUuid(id)||wait&&!WAIT.has(wait))return err("Follow-up không hợp lệ.");
try{if(!await canFollowSource(a,type,id))return err("Không tìm thấy công việc hoặc không có quyền.",404);}catch(e){return err(e instanceof Error?e.message:"Lỗi kiểm tra quyền.");}
const x=await a.supabase.from("work_followups").select("id").eq("owner_user_id",a.user.id).eq("source_type",type).eq("source_id",id).in("state",["ACTIVE","WAITING"]).maybeSingle();if(x.error)return err(x.error.message);
const p={organization_id:org,owner_user_id:a.user.id,source_type:type,source_id:id,state:"WAITING",waiting_for_type:wait,waiting_for_label:b.waiting_for_label?String(b.waiting_for_label).trim().slice(0,300):null,follow_up_at:b.follow_up_at?String(b.follow_up_at):null,note:b.note?String(b.note).trim().slice(0,2000):null,created_by:a.user.id,updated_at:new Date().toISOString()};
const r=x.data?await a.supabase.from("work_followups").update(p).eq("id",x.data.id).select("*").single():await a.supabase.from("work_followups").insert(p).select("*").single();
return r.error?err(r.error.message):NextResponse.json({ok:true,followup:r.data});}
