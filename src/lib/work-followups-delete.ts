import{NextResponse}from"next/server";import{requireApiContext}from"@/lib/api-auth";
export async function deleteFollowup(req:Request){const a=await requireApiContext();if(!a.ok)return a.response;const id=String(new URL(req.url).searchParams.get("id")||"").trim();if(!id)return NextResponse.json({error:"Thiếu follow-up id."},{status:400});
const{error}=await a.supabase.from("work_followups").update({state:"CANCELLED",completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id).eq("owner_user_id",a.user.id);
return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({ok:true});}
