import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CriteriaSetEditorClient } from "@/components/criteria-set-editor-client";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CriteriaSetDetailPage({params}:{params:Promise<{id:string}>}){
 const {user}=await requireUserContext();if(!hasAnyPermission(user,["criteria.view","criteria.manage"]))redirect("/dashboard?forbidden=1");
 const {id}=await params;const supabase=await createClient();
 const {data:set,error:setError}=await supabase.from("criteria_sets").select("id,code,name,description,is_active,created_at,updated_at").eq("id",id).maybeSingle();
 if(setError)return <div className="alert error">Không tải được bộ tiêu chí: {setError.message}</div>;if(!set)notFound();
 const {data:versions,error:versionsError}=await supabase.from("criteria_set_versions").select("id,version_no,status,effective_from,effective_to,published_at,created_at,updated_at").eq("criteria_set_id",id).order("version_no",{ascending:false});
 const current=(versions??[]).find((v:any)=>v.status==="DRAFT")||(versions??[])[0]||null;
 const {data:items,error:itemsError}=current?await supabase.from("criteria_items").select("id,criteria_version_id,code,title,description,sequence_no,chapter_code,chapter_name,score_weight,is_core,is_mandatory,max_score,parent_criteria_item_id,item_type,is_active,created_at,updated_at").eq("criteria_version_id",current.id).order("sequence_no",{ascending:true}):{data:[],error:null};
 const firstError=versionsError||itemsError;
 return <div className="page-stack" style={{maxWidth:1280,margin:"0 auto"}}>
  <section className="panel" style={{padding:20}}><Link className="table-link" href="/assessments/catalog">← Bộ tiêu chí</Link><div className="eyebrow" style={{marginTop:12}}>BỘ TIÊU CHÍ · {set.code||"CHƯA CÓ MÃ"}</div><h1 style={{margin:"5px 0 6px"}}>{set.name}</h1><p className="muted" style={{margin:0}}>{set.description||"Khai báo cấu trúc tiêu chí và tiểu mục của bộ tiêu chí."}</p></section>
  {firstError?<div className="alert error">Không tải được đầy đủ cấu trúc: {firstError.message}</div>:null}
  <CriteriaSetEditorClient criteriaSet={set as any} versions={(versions??[]) as any[]} version={current as any} items={(items??[]) as any[]} canManage={user.permissions.includes("criteria.manage")}/>
 </div>;
}
