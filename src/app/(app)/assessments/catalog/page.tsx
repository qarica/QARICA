import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { CriteriaCatalogClient } from "@/components/criteria-catalog-client";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CriteriaCatalogPage(){
 const {user}=await requireUserContext();
 if(!hasAnyPermission(user,["criteria.view","criteria.manage"]))redirect("/dashboard?forbidden=1");
 const supabase=await createClient();
 const [setsRes,versionsRes,itemsRes]=await Promise.all([
  supabase.from("criteria_sets").select("id,code,name,description,is_active,created_at,updated_at").order("is_active",{ascending:false}).order("name"),
  supabase.from("criteria_set_versions").select("id,criteria_set_id,version_no,status,effective_from,effective_to,published_at,updated_at").order("version_no",{ascending:false}),
  supabase.from("criteria_items").select("id,criteria_version_id,parent_criteria_item_id,is_active"),
 ]);
 const versions=(versionsRes.data??[]) as any[];const items=(itemsRes.data??[]) as any[];
 const latestMap=new Map<string,any>();const publishedMap=new Map<string,any>();const itemCount=new Map<string,number>();
 for(const v of versions){if(!latestMap.has(v.criteria_set_id))latestMap.set(v.criteria_set_id,v);if(v.status==="PUBLISHED"&&!publishedMap.has(v.criteria_set_id))publishedMap.set(v.criteria_set_id,v);}
 for(const item of items){if(item.is_active!==false)itemCount.set(item.criteria_version_id,(itemCount.get(item.criteria_version_id)||0)+1);}
 const rows=(setsRes.data??[]).map((set:any)=>{const latest=latestMap.get(set.id),published=publishedMap.get(set.id);return{...set,latest_version_id:latest?.id||null,latest_version_no:latest?.version_no||null,latest_version_status:latest?.status||null,published_version_no:published?.version_no||null,item_count:latest?.id?itemCount.get(latest.id)||0:0};});
 const firstError=[setsRes,versionsRes,itemsRes].find(x=>x.error)?.error;
 return <div className="page-stack" style={{maxWidth:1380,margin:"0 auto"}}>
  <PageHeader eyebrow="ĐÁNH GIÁ & KIỂM TRA · DANH MỤC CHUẨN" title="Bộ tiêu chí" description="Khai báo Bộ tiêu chí → Tiêu chí → Tiểu mục. Bản đã phát hành được giữ nguyên; cập nhật nội dung bằng phiên bản mới." actions={<Link className="button secondary" href="/assessments">← Tự đánh giá</Link>}/>
  {firstError?<div className="alert error">Không tải được đầy đủ danh mục: {firstError.message}</div>:null}
  <CriteriaCatalogClient rows={rows as any[]} canManage={user.permissions.includes("criteria.manage")}/>
 </div>;
}
