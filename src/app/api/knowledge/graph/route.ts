import { NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-auth";

export async function GET() {
 const auth = await requireApiContext();
 if (!auth.ok) return auth.response;
 const { data: notes, error: noteError } = await auth.supabase.from("knowledge_notes")
  .select("id,title,note_type,status,created_at").eq("owner_user_id",auth.user.id)
  .order("created_at",{ascending:false}).limit(250);
 if (noteError) return NextResponse.json({error:noteError.message},{status:400});
 const {data:legacy,error:legacyError}=await auth.supabase.from("personal_workspace_items")
  .select("id,title,item_type,deleted_at").eq("owner_user_id",auth.user.id)
  .eq("item_type","NOTE").is("deleted_at",null).order("created_at",{ascending:false}).limit(250);
 if(legacyError)return NextResponse.json({error:legacyError.message},{status:400});
 const legacyNodes=(legacy??[]).map(n=>({id:`legacy:${n.id}`,label:n.title,type:"NOTE",status:"ACTIVE",source:"PERSONAL_WORKSPACE"}));
 const ids = (notes ?? []).map(n=>n.id);
 if (!ids.length) return NextResponse.json({ok:true,nodes:legacyNodes,edges:[],truncated:(legacy??[]).length===250});
 const {data:links,error:linkError} = await auth.supabase.from("knowledge_links")
  .select("id,note_id,relation_type,target_type,target_id,target_label")
  .in("note_id",ids).limit(1000);
 if (linkError) return NextResponse.json({error:linkError.message},{status:400});
 const owned = new Set(ids);
 const nodes = [...(notes??[]).map(n=>({id:n.id,label:n.title,type:n.note_type,status:n.status,source:"KNOWLEDGE"})),...legacyNodes];
 const edges = (links??[]).filter(l=>l.target_type==="NOTE"&&owned.has(l.target_id))
  .map(l=>({id:l.id,source:l.note_id,target:l.target_id,label:l.relation_type}));
 return NextResponse.json({ok:true,nodes,edges,truncated:(notes??[]).length===250||(links??[]).length===1000||(legacy??[]).length===250});
}
