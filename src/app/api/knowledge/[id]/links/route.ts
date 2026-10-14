import { NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-auth";
const RELATIONS=new Set(["RELATED_TO","ABOUT","SUPPORTS","DECISION_FOR","LESSON_FROM","MENTIONS"]);
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await requireApiContext();if(!auth.ok)return auth.response;const{id:noteId}=await params;const body=await request.json().catch(()=>({}));
 const relationType=String(body.relation_type||"RELATED_TO").toUpperCase();const targetType=String(body.target_type||"RECORD").toUpperCase();const targetId=String(body.target_id||"").trim();
 if(!RELATIONS.has(relationType)||!targetId)return NextResponse.json({error:"Liên kết không hợp lệ."},{status:400});
 if(targetType!=="RECORD"&&targetType!=="NOTE")return NextResponse.json({error:"Loại liên kết không hợp lệ."},{status:400});
 const {data:note,error:noteError}=await auth.supabase.from("knowledge_notes").select("id,owner_user_id").eq("id",noteId).eq("owner_user_id",auth.user.id).maybeSingle();
 if(noteError)return NextResponse.json({error:noteError.message},{status:400});if(!note)return NextResponse.json({error:"Không tìm thấy ghi chú."},{status:404});
 if(targetType==="NOTE"){
  if(targetId===noteId)return NextResponse.json({error:"Không thể tự liên kết ghi chú."},{status:400});
  const {data:target,error:targetError}=await auth.supabase.from("knowledge_notes").select("id,title").eq("id",targetId).eq("owner_user_id",auth.user.id).maybeSingle();
  if(targetError)return NextResponse.json({error:targetError.message},{status:400});
  if(!target)return NextResponse.json({error:"Không tìm thấy ghi chú đích."},{status:404});
  const {data,error}=await auth.supabase.from("knowledge_links").upsert({note_id:noteId,relation_type:relationType,target_type:"NOTE",target_id:target.id,target_label:target.title,created_by:auth.user.id},{onConflict:"note_id,relation_type,target_type,target_id"}).select("id,note_id,relation_type,target_type,target_id,target_label,created_at").single();
  if(error)return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json({ok:true,link:data});
 }
 const {data:record,error:recordError}=await auth.supabase.from("records").select("id,record_code,title").eq("id",targetId).maybeSingle();
 if(recordError)return NextResponse.json({error:recordError.message},{status:400});if(!record)return NextResponse.json({error:"Không tìm thấy hồ sơ hoặc bạn không có quyền xem."},{status:404});
 const {data,error}=await auth.supabase.from("knowledge_links").upsert({note_id:noteId,relation_type:relationType,target_type:"RECORD",target_id:record.id,target_label:record.record_code||record.title||null,created_by:auth.user.id},{onConflict:"note_id,relation_type,target_type,target_id"}).select("id,note_id,relation_type,target_type,target_id,target_label,created_at").single();
 if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json({ok:true,link:data});
}
