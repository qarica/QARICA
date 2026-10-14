import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { routeForRecord } from "@/lib/record-route";
const RECORD_TYPE_LABELS:Record<string,string>={INCIDENT:"Sự cố y khoa",CAPA:"CAPA",FINDING:"Finding",RISK:"Rủi ro",FMEA:"FMEA",AUDIT:"Audit",ASSESSMENT:"Tự đánh giá",INSPECTION:"Tiếp đoàn",ACTION:"Action",IMPROVEMENT_PROJECT:"Đề án cải tiến",IMPROVEMENT_PROPOSAL:"Đề xuất cải tiến",DIRECTIVE:"Chỉ đạo",REPORT:"Nghĩa vụ báo cáo",FEEDBACK:"Phản ánh",SAFETY_ALERT:"Bài học/Cảnh báo"};
const KNOWLEDGE_TYPE_LABELS:Record<string,string>={NOTE:"Knowledge · Ghi chú",JOURNAL:"Knowledge · Nhật ký",DECISION:"Knowledge · Quyết định",LESSON:"Knowledge · Bài học",REFERENCE:"Knowledge · Tham khảo"};
export async function GET(request:Request){const auth=await requireApiUser();if(!auth.ok)return auth.response;const{searchParams}=new URL(request.url);const q=(searchParams.get("q")||"").trim();if(q.length<2)return NextResponse.json({ok:true,results:[]});
 const admin=createAdminClient();const{organizationId,error:callerError}=await callerOrganizationId(admin,auth.user.id);if(callerError)return NextResponse.json({error:callerError.message},{status:400});
 let recordRows:any[]=[];if(organizationId){const BACKSLASH = String.fromCharCode(92);
    const ilikeEscaped = q.replace(/[\%_]/g, (m) => BACKSLASH + m);
    const orQuoted = (value: string) => '"' + value.split(BACKSLASH).join(BACKSLASH + BACKSLASH).replace(/"/g, BACKSLASH + '"') + '"';
    const pattern = orQuoted("%" + ilikeEscaped + "%");
 const{data,error}=await admin.from("records").select("id,record_type,record_code,title").eq("organization_id",organizationId).or("title.ilike."+pattern+",record_code.ilike."+pattern).order("created_at",{ascending:false}).limit(8);if(error)return NextResponse.json({error:error.message},{status:400});recordRows=data??[];}
 const{data:knowledgeRows,error:knowledgeError}=await auth.supabase.from("knowledge_notes").select("id,note_type,visibility,title,content").eq("status","ACTIVE").textSearch("search_document",q,{type:"websearch",config:"simple"}).order("created_at",{ascending:false}).limit(8);if(knowledgeError)return NextResponse.json({error:knowledgeError.message},{status:400});
 const recordResults=recordRows.map((r:any)=>({id:r.id,kind:"RECORD",label:RECORD_TYPE_LABELS[r.record_type]||r.record_type,title:r.title,code:r.record_code,href:routeForRecord(r.record_type,r.id)}));
 const knowledgeResults=(knowledgeRows??[]).map((n:any)=>({id:"knowledge:"+n.id,kind:"KNOWLEDGE",label:KNOWLEDGE_TYPE_LABELS[n.note_type]||"Knowledge",title:n.title,code:n.visibility==="PRIVATE"?"Riêng tư":n.visibility==="TEAM"?"Cùng tổ chức":"Theo hồ sơ",href:"/me#knowledge-journal"}));
 return NextResponse.json({ok:true,results:[...recordResults,...knowledgeResults].slice(0,12)});}
