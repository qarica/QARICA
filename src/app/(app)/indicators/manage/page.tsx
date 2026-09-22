import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { IndicatorCreateForm } from "./indicator-create-form";

const statusLabel=(v:string)=>v==="PUBLISHED"?"Đã công bố":v==="DRAFT"?"Bản nháp":v==="RETIRED"?"Ngưng sử dụng":v||"—";
const frequencyLabel=(v:string)=>({DAILY:"Hằng ngày",WEEKLY:"Hằng tuần",MONTHLY:"Hằng tháng",QUARTERLY:"Hằng quý",SEMIANNUAL:"6 tháng",ANNUAL:"Hằng năm"} as Record<string,string>)[v]||v||"—";

export default async function IndicatorManagementPage(){
  const user:any=await requireUserContext();
  const supabase=await createClient();
  const {data:defs,error}=await supabase.from("indicator_definitions").select("id,code,name,purpose,quality_dimension,is_active").eq("organization_id",user.organizationId).order("code");
  const ids=(defs??[]).map((x:any)=>x.id);
  const {data:versions}=ids.length?await supabase.from("indicator_definition_versions").select("id,indicator_definition_id,version_no,calculation_type,desired_direction,frequency,unit,status,effective_from,effective_to").in("indicator_definition_id",ids).order("version_no",{ascending:false}):{data:[]};
  const latest=new Map<string,any>();
  for(const v of versions??[]) if(!latest.has((v as any).indicator_definition_id)) latest.set((v as any).indicator_definition_id,v);
  return <div className="page-stack">
    <PageHeader eyebrow="CẤU HÌNH & DANH MỤC" title="Quản lý chỉ số chất lượng" description="Khai báo danh mục chuẩn và quản lý phiên bản chỉ số. Dữ liệu đo lường được thực hiện riêng để bảo toàn lịch sử." />
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Link className="btn btn-secondary" href="/indicators">← Theo dõi chỉ số</Link></div>
    <IndicatorCreateForm />
    {error?<div className="card" style={{padding:16}}>Không tải được danh mục chỉ số.</div>:
    <div className="card" style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
      <thead><tr><th>Mã</th><th>Tên chỉ số</th><th>Lĩnh vực</th><th>Đơn vị</th><th>Tần suất</th><th>Phiên bản</th><th>Trạng thái</th><th>Hiệu lực</th></tr></thead>
      <tbody>{(defs??[]).map((d:any)=>{const v=latest.get(d.id);return <tr key={d.id}><td><strong>{d.code}</strong></td><td>{d.name}<div className="muted">{d.purpose||""}</div></td><td>{d.quality_dimension||"—"}</td><td>{v?.unit||"—"}</td><td>{frequencyLabel(v?.frequency)}</td><td>v{v?.version_no??"—"}</td><td>{d.is_active===false?"Ngưng sử dụng":statusLabel(v?.status)}</td><td>{v?.effective_from||"—"}</td></tr>})}{!(defs??[]).length&&<tr><td colSpan={8} style={{padding:24,textAlign:"center"}}>Chưa có chỉ số. Tạo chỉ số đầu tiên bằng biểu mẫu phía trên.</td></tr>}</tbody>
    </table></div>}
  </div>
}