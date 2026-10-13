import { NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-auth";
const NOTE_TYPES=new Set(["NOTE","JOURNAL","DECISION","LESSON","REFERENCE"]);
const VISIBILITIES=new Set(["PRIVATE","TEAM","LINKED_RECORD"]);
export async function GET(request:Request){
 const auth=await requireApiContext();if(!auth.ok)return auth.response;
 const {searchParams}=new URL(request.url);const q=String(searchParams.get("q")||"").trim();const status=String(searchParams.get("status")||"ACTIVE").toUpperCase();
 const rawOffset=searchParams.get("offset")??"0";const rawLimit=searchParams.get("limit")??"50";const offset=Number(rawOffset);const limit=Number(rawLimit);
 if(!/^\d+$/.test(rawOffset)||!/^\d+$/.test(rawLimit)||!Number.isSafeInteger(offset)||!Number.isSafeInteger(limit)||offset>100000||limit<1||limit>100)return NextResponse.json({error:"Phân trang không hợp lệ."},{status:400});
 if(!["ACTIVE","ARCHIVED"].includes(status))return NextResponse.json({error:"Trạng thái ghi chú không hợp lệ."},{status:400});
 let query=auth.supabase.from("knowledge_notes").select("id,owner_user_id,organization_id,note_type,visibility,title,content,journal_date,status,source_kind,source_ref,generated_at,ai_model,ai_confidence,created_at,updated_at,archived_at").eq("status",status==="ARCHIVED"?"ARCHIVED":"ACTIVE").order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+limit);
 if(q.length>200)return NextResponse.json({error:"Từ khóa tìm kiếm quá dài."},{status:400});
 if(q)query=query.textSearch("search_document",q,{type:"websearch",config:"simple"});
 const {data,error}=await query;if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json({ok:true,notes:(data??[]).slice(0,limit),hasMore:(data??[]).length>limit,nextOffset:offset+Math.min((data??[]).length,limit)});
}
export async function POST(request:Request){
 const auth=await requireApiContext();if(!auth.ok)return auth.response;
 const body=await request.json().catch(()=>null);
 if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({error:"Dữ liệu yêu cầu không hợp lệ."},{status:400});
 const noteType=String(body.note_type||"NOTE").toUpperCase();const visibility=String(body.visibility||"PRIVATE").toUpperCase();const title=String(body.title||"").trim();const content=body.content==null?null:String(body.content).trim();const journalDate=body.journal_date?String(body.journal_date):null;
 if(!NOTE_TYPES.has(noteType))return NextResponse.json({error:"Loại ghi chú không hợp lệ."},{status:400});
 if(!VISIBILITIES.has(visibility))return NextResponse.json({error:"Phạm vi hiển thị không hợp lệ."},{status:400});
 if(content&&content.length>100000)return NextResponse.json({error:"Nội dung ghi chú vượt quá 100.000 ký tự."},{status:400});
 if(journalDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(journalDate)||Number.isNaN(Date.parse(journalDate))||new Date(journalDate).toISOString().slice(0,10)!==journalDate))return NextResponse.json({error:"Ngày nhật ký không hợp lệ."},{status:400});
 if(!title||title.length>300)return NextResponse.json({error:"Tiêu đề phải từ 1-300 ký tự."},{status:400});
 if(visibility!=="PRIVATE"&&!auth.context.user.organizationId)return NextResponse.json({error:"Tài khoản chưa gắn tổ chức."},{status:400});
 const payload={owner_user_id:auth.user.id,organization_id:visibility==="PRIVATE"?null:auth.context.user.organizationId,note_type:noteType,visibility,title,content:content||null,journal_date:journalDate,source_kind:"USER"};
 const {data,error}=await auth.supabase.from("knowledge_notes").insert(payload).select("id,owner_user_id,organization_id,note_type,visibility,title,content,journal_date,status,source_kind,created_at,updated_at").single();
 if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json({ok:true,note:data});
}
