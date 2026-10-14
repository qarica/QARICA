import { NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-auth";
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await requireApiContext();if(!auth.ok)return auth.response;const{id}=await params;const body=await request.json().catch(()=>({}));
 const update:Record<string,unknown>={updated_at:new Date().toISOString()};
 if(body.title!==undefined){const title=String(body.title||"").trim();if(!title||title.length>300)return NextResponse.json({error:"Tiêu đề không hợp lệ."},{status:400});update.title=title;}
 if(body.content!==undefined)update.content=body.content==null?null:String(body.content).trim()||null;
 if(body.status==="ARCHIVED"){update.status="ARCHIVED";update.archived_at=new Date().toISOString();}
 if(body.status==="ACTIVE"){update.status="ACTIVE";update.archived_at=null;}
 const {data,error}=await auth.supabase.from("knowledge_notes").update(update).eq("id",id).eq("owner_user_id",auth.user.id).select("id,title,content,status,updated_at,archived_at").maybeSingle();
 if(error)return NextResponse.json({error:error.message},{status:400});if(!data)return NextResponse.json({error:"Không tìm thấy ghi chú hoặc bạn không phải chủ sở hữu."},{status:404});return NextResponse.json({ok:true,note:data});
}

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await requireApiContext();if(!auth.ok)return auth.response;
 const {id}=await params;
 const {data,error}=await auth.supabase.from("knowledge_notes").select("id,note_type,visibility,title,content,journal_date,status,source_kind,created_at").eq("id",id).eq("owner_user_id",auth.user.id).maybeSingle();
 if(error)return NextResponse.json({error:error.message},{status:400});
 if(!data)return NextResponse.json({error:"Không tìm thấy ghi chú hoặc bạn không có quyền truy cập."},{status:404});
 return NextResponse.json({ok:true,note:data});
}
