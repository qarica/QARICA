import { NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-auth";

export async function GET(request: Request) {
  const auth = await requireApiContext();
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const state = String(searchParams.get("state") || "OPEN").toUpperCase();
  let query = auth.supabase.from("vw_work_items")
    .select("source_type,source_id,record_id,organization_id,owner_user_id,owner_department_id,title,description,priority,source_status,normalized_state,start_at,due_at,completed_at,created_at,updated_at,target_route,metadata")
    .order("due_at",{ascending:true,nullsFirst:false}).limit(500);
  if (state==="OPEN" || state==="WAITING") query=query.eq("normalized_state","ACTIVE");
  if (state==="DONE") query=query.eq("normalized_state","DONE");
  if (state==="CANCELLED") query=query.eq("normalized_state","CANCELLED");
  const {data:rows,error}=await query;
  if (error) return NextResponse.json({error:error.message},{status:400});
  const openRows=rows??[];
  const sourceIds=openRows.map((row:any)=>row.source_id).filter(Boolean);
  let followups:any[]=[];
  if(sourceIds.length){
    const {data,error:followError}=await auth.supabase.from("work_followups")
      .select("id,source_type,source_id,state,waiting_for_type,waiting_for_id,waiting_for_label,follow_up_at,note,updated_at")
      .in("source_id",sourceIds).in("state",["ACTIVE","WAITING"]);
    if(followError) return NextResponse.json({error:followError.message},{status:400});
    followups=data??[];
  }
  const map=new Map(followups.map((f:any)=>[f.source_type+":"+f.source_id,f]));
  let items=openRows.map((row:any)=>({...row,followup:map.get(row.source_type+":"+row.source_id)??null}));
  if(state==="WAITING") items=items.filter((row:any)=>row.followup?.state==="WAITING");
  return NextResponse.json({ok:true,items});
}
