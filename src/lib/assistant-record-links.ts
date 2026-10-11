import{visibleRecordTypes}from"@/lib/record-view-permissions";import type{ToolContext}from"@/lib/assistant-tool-context";
export async function visibleRecordLinks(c:ToolContext,id:string){const{data,error}=await c.supabase.from("record_links").select("source_record_id,target_record_id,relation_type,created_at").or("source_record_id.eq."+id+",target_record_id.eq."+id).order("created_at",{ascending:false}).limit(30);if(error)throw error;
const links=data??[],other=(x:any)=>x.source_record_id===id?x.target_record_id:x.source_record_id,ids=Array.from(new Set(links.map(other).filter(Boolean)));if(!ids.length)return[];
const types=visibleRecordTypes(c.user);if(!types.length)return[];
const r=await c.supabase.from("records").select("id,record_type").eq("organization_id",c.user.organizationId!).in("id",ids).in("record_type",types);if(r.error)throw r.error;const allowed=new Set((r.data??[]).map((x:any)=>x.id));return links.filter((x:any)=>allowed.has(other(x)));}
