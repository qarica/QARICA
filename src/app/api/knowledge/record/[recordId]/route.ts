import { NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
export async function GET(_request:Request,{params}:{params:Promise<{recordId:string}>}){
 const auth=await requireApiContext();if(!auth.ok)return auth.response;const{recordId}=await params;
 const {data:visibleRecord,error:recordError}=await auth.supabase.from("records").select("id,organization_id").eq("id",recordId).maybeSingle();
 if(recordError)return NextResponse.json({error:recordError.message},{status:400});if(!visibleRecord)return NextResponse.json({error:"Không tìm thấy hồ sơ hoặc bạn không có quyền xem."},{status:404});
 const admin=createAdminClient();const {data:links,error:linksError}=await admin.from("knowledge_links").select("note_id,relation_type,target_label").eq("target_type","RECORD").eq("target_id",recordId);
 if(linksError)return NextResponse.json({error:linksError.message},{status:400});const noteIds=Array.from(new Set((links??[]).map((x:any)=>x.note_id).filter(Boolean)));if(!noteIds.length)return NextResponse.json({ok:true,notes:[]});
 const {data:notes,error:notesError}=await admin.from("knowledge_notes").select("id,owner_user_id,organization_id,note_type,visibility,title,content,source_kind,created_at,updated_at").in("id",noteIds).eq("status","ACTIVE");
 if(notesError)return NextResponse.json({error:notesError.message},{status:400});
 const allowed=(notes??[]).filter((n:any)=>n.owner_user_id===auth.user.id||(n.organization_id===visibleRecord.organization_id&&(n.visibility==="TEAM"||n.visibility==="LINKED_RECORD")));
 return NextResponse.json({ok:true,notes:allowed});
}
