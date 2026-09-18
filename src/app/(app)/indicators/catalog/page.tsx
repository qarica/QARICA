import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { IndicatorCatalogClient } from "@/components/indicator-catalog-client";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function IndicatorCatalogPage(){
 const {user}=await requireUserContext();
 if(!hasAnyPermission(user,["indicators.view","indicators.manage"]))redirect("/dashboard?forbidden=1");
 const supabase=await createClient();
 const [defsRes,versionsRes]=await Promise.all([
  supabase.from("indicator_definitions").select("id,code,name,purpose,quality_dimension,is_active,created_at,updated_at").order("is_active",{ascending:false}).order("code"),
  supabase.from("indicator_definition_versions").select("id,indicator_definition_id,version_no,calculation_type,desired_direction,frequency,unit,multiplier,status,effective_from,effective_to,published_at,created_at,updated_at").order("version_no",{ascending:false}),
 ]);
 const versions=(versionsRes.data??[]) as any[];const latestMap=new Map<string,any>();const publishedMap=new Map<string,any>();
 for(const v of versions){if(!latestMap.has(v.indicator_definition_id))latestMap.set(v.indicator_definition_id,v);if(v.status==="PUBLISHED"&&!publishedMap.has(v.indicator_definition_id))publishedMap.set(v.indicator_definition_id,v);}
 const rows=(defsRes.data??[]).map((d:any)=>({...d,latest_version:latestMap.get(d.id)||null,published_version:publishedMap.get(d.id)||null}));
 const firstError=defsRes.error||versionsRes.error;
 return <div className="page-stack" style={{maxWidth:1400,margin:"0 auto"}}>
  <PageHeader eyebrow="ĐO LƯỜNG & GIÁM SÁT · DANH MỤC CHUẨN" title="Danh mục chỉ số chất lượng" description="Khai báo định nghĩa chỉ số một lần, quản lý phiên bản công thức/tần suất và ngưng áp dụng mà không làm mất dữ liệu kỳ đo cũ." actions={<Link className="button secondary" href="/indicators">← Vận hành chỉ số</Link>}/>
  {firstError?<div className="alert error">Không tải được danh mục chỉ số: {firstError.message}</div>:null}
  <IndicatorCatalogClient rows={rows as any[]} canManage={user.permissions.includes("indicators.manage")}/>
 </div>;
}
