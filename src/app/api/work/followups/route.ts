import { NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-auth";
const SOURCE_TYPES=new Set(["ACTION","EMR","RECORD","OTHER"]);
const WAIT_TYPES=new Set(["USER","DEPARTMENT","EXTERNAL_PARTY","DOCUMENT","APPROVAL"]);

export async function POST(request:Request){
  const auth=await requireApiContext(); if(!auth.ok)return auth.response;
  const organizationId=auth.context.user.organizationId;
  if(!organizationId)return NextResponse.json({error:"Tài khoản chưa gắn tổ chức."},{status:400});
  const body=await request.json().catch(()=>({}));
  const sourceType=String(body.source_type||"").toUpperCase();
  const sourceId=String(body.source_id||"").trim();
  const waitingForType=body.waiting_for_type?String(body.waiting_for_type).toUpperCase():null;
  const waitingForLabel=body.waiting_for_label?String(body.waiting_for_label).trim().slice(0,300):null;
  const note=body.note?String(body.note).trim().slice(0,2000):null;
  const followUpAt=body.follow_up_at?String(body.follow_up_at):null;
  if(!SOURCE_TYPES.has(sourceType)||!sourceId)return NextResponse.json({error:"Nguồn công việc không hợp lệ."},{status:400});
  if(waitingForType&&!WAIT_TYPES.has(waitingForType))return NextResponse.json({error:"Loại đối tượng đang chờ không hợp lệ."},{status:400});
  const {data:sourceRows,error:sourceError}=await auth.supabase.from("vw_work_items").select("source_id")
    .eq("source_type",sourceType).eq("source_id",sourceId).limit(1);
  if(sourceError)return NextResponse.json({error:sourceError.message},{status:400});
  if(!sourceRows?.length)return NextResponse.json({error:"Không tìm thấy công việc hoặc bạn không có quyền xem."},{status:404});
  const {data:existing,error:existingError}=await auth.supabase.from("work_followups").select("id")
    .eq("owner_user_id",auth.user.id).eq("source_type",sourceType).eq("source_id",sourceId).in("state",["ACTIVE","WAITING"]).maybeSingle();
  if(existingError)return NextResponse.json({error:existingError.message},{status:400});
  const payload={organization_id:organizationId,owner_user_id:auth.user.id,source_type:sourceType,source_id:sourceId,state:"WAITING",
    waiting_for_type:waitingForType,waiting_for_label:waitingForLabel,follow_up_at:followUpAt,note,created_by:auth.user.id,updated_at:new Date().toISOString()};
  const result=existing
    ? await auth.supabase.from("work_followups").update(payload).eq("id",existing.id).select("*").single()
    : await auth.supabase.from("work_followups").insert(payload).select("*").single();
  if(result.error)return NextResponse.json({error:result.error.message},{status:400});
  return NextResponse.json({ok:true,followup:result.data});
}
export async function DELETE(request:Request){
  const auth=await requireApiContext(); if(!auth.ok)return auth.response;
  const {searchParams}=new URL(request.url); const id=String(searchParams.get("id")||"").trim();
  if(!id)return NextResponse.json({error:"Thiếu follow-up id."},{status:400});
  const {error}=await auth.supabase.from("work_followups").update({state:"CANCELLED",completed_at:new Date().toISOString(),updated_at:new Date().toISOString()})
    .eq("id",id).eq("owner_user_id",auth.user.id);
  if(error)return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json({ok:true});
}
