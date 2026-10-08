import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { TQM_CHART_CSS, TqmDonut, TqmHorizontalBars, TqmTrend } from "@/components/tqm-charts";
import { EvidenceDeleteButton } from "@/components/evidence-delete-button";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const SOURCE_MODULE_LABEL:Record<string,string>={INCIDENT:"Sự cố & Phản ánh",FEEDBACK:"Sự cố & Phản ánh",CAPA:"Khắc phục & CAPA",FINDING:"Khắc phục & CAPA",ASSESSMENT:"Đánh giá & Kiểm tra",EXTERNAL_ASSESSMENT:"Đánh giá & Kiểm tra",AUDIT:"Đánh giá & Kiểm tra",INSPECTION:"Đánh giá & Kiểm tra",RISK:"Rủi ro & FMEA",FMEA:"Rủi ro & FMEA",IMPROVEMENT_PROJECT:"Cải tiến chất lượng",IMPROVEMENT_PROPOSAL:"Cải tiến chất lượng"};
function mimeClass(mime:string,filename:string){
 const m=String(mime||"").toLowerCase();const f=String(filename||"").toLowerCase();
 if(m.startsWith("image/")||/\.(jpg|jpeg|png|gif|webp)$/.test(f))return"Hình ảnh";
 if(m.startsWith("video/")||/\.(mp4|mov|avi|webm)$/.test(f))return"Video";
 if(m.includes("pdf")||m.includes("word")||m.includes("spreadsheet")||m.includes("excel")||m.includes("presentation")||/\.(pdf|docx?|xlsx?|pptx?)$/.test(f))return"Tài liệu";
 if(m.includes("csv")||m.includes("json")||/\.(csv|json)$/.test(f))return"Dữ liệu/Export";
 return"Khác";
}
function fmtGb(bytes:number){return `${(bytes/1024/1024/1024).toFixed(1)} GB`}

export default async function EvidencePage(){
 const {user}=await requireUserContext();if(!hasAnyPermission(user,["evidence.upload","evidence.review","criteria.view"]))redirect("/dashboard?forbidden=1");const canDelete=hasAnyPermission(user,["evidence.upload"]);const supabase=await createClient();
 const [recentRes,totalRes,validCountRes,pendingCountRes,allSizesRes]=await Promise.all([
  supabase.from("evidence").select("id,title,evidence_type,mime_type,document_number,document_date,validity_status,uploaded_at,owner_department_id,original_file_name,file_size").order("uploaded_at",{ascending:false}).limit(300),
  supabase.from("evidence").select("id",{count:"exact",head:true}),
  supabase.from("evidence").select("id",{count:"exact",head:true}).eq("validity_status","VALID"),
  supabase.from("evidence").select("id",{count:"exact",head:true}).eq("validity_status","PENDING"),
  supabase.from("evidence").select("file_size"),
 ]);
 const rows=(recentRes.data??[]) as any[];const total=totalRes.count??0,valid=validCountRes.count??0,pending=pendingCountRes.count??0,otherReview=Math.max(0,total-valid-pending),validPct=total?Math.round(valid/total*100):0;
 const storageUsedBytes=((allSizesRes.data??[]) as any[]).reduce((s,x)=>s+Number(x.file_size||0),0);
 const departmentIds=Array.from(new Set(rows.map(r=>r.owner_department_id).filter(Boolean)));const deps=departmentIds.length?await supabase.from("departments").select("id,name,short_name").in("id",departmentIds):{data:[],error:null};const depMap=new Map((deps.data??[]).map((r:any)=>[r.id,r.short_name||r.name]));
 const evidenceIds=rows.map(r=>r.id);const linksRes=evidenceIds.length?await supabase.from("evidence_links").select("evidence_id,record_id").in("evidence_id",evidenceIds):{data:[],error:null};
 const linkRecordIds=Array.from(new Set(((linksRes.data??[]) as any[]).map((l:any)=>String(l.record_id))));
 const linkedRecordsRes=linkRecordIds.length?await supabase.from("records").select("id,record_code,record_type").in("id",linkRecordIds):{data:[],error:null};
 const recordById=new Map(((linkedRecordsRes.data??[]) as any[]).map((r:any)=>[String(r.id),r]));
 const linkByEvidence=new Map<string,{code:string;type:string}>();((linksRes.data??[]) as any[]).forEach((l:any)=>{if(linkByEvidence.has(l.evidence_id))return;const r=recordById.get(String(l.record_id));if(r)linkByEvidence.set(l.evidence_id,{code:r.record_code,type:r.record_type})});
 const sampleValid=rows.filter(r=>r.validity_status==="VALID").length,sampleOther=Math.max(0,rows.length-sampleValid),sampleValidPct=rows.length?Math.round(sampleValid/rows.length*100):0;
 const typeMap=new Map<string,number>();const depAgg=new Map<string,number>();const sourceAgg=new Map<string,number>();const months=Array.from({length:12},(_,i)=>({label:`T${i+1}`,value:0}));rows.forEach(r=>{const t=mimeClass(r.mime_type,r.original_file_name);typeMap.set(t,(typeMap.get(t)||0)+1);const d=String(depMap.get(r.owner_department_id)||"Chưa xác định");depAgg.set(d,(depAgg.get(d)||0)+1);const link=linkByEvidence.get(r.id);const src=link?(SOURCE_MODULE_LABEL[link.type]||"Khác"):"Chưa liên kết";sourceAgg.set(src,(sourceAgg.get(src)||0)+1);const x=new Date(r.uploaded_at);if(!Number.isNaN(x.getTime()))months[x.getMonth()].value++});
 const depBars=Array.from(depAgg.entries()).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([label,value],i)=>({label,value,tone:(i<3?"brand":"blue") as any}));
 const typeTones=["blue","green","amber","red","slate"] as const;const typeSegments=Array.from(typeMap.entries()).sort((a,b)=>b[1]-a[1]).map(([label,value],i)=>({label,value,tone:typeTones[i%typeTones.length]}));
 const sourceBars=Array.from(sourceAgg.entries()).sort((a,b)=>b[1]-a[1]).map(([label,value],i)=>({label,value,tone:(i<3?"brand":"blue") as any}));
 const firstError=[recentRes,totalRes,validCountRes,pendingCountRes,allSizesRes,deps,linksRes,linkedRecordsRes].find((x:any)=>x.error)?.error;
 return <div className="page-stack evidence-tqm">
  <style>{TQM_CHART_CSS+`.evidence-tqm .kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.evidence-tqm .kpi{background:#fff;border:1px solid #e1e9ec;border-radius:14px;padding:14px 15px;display:flex;gap:10px;align-items:flex-start}.evidence-tqm .kpi .kpi-body{min-width:0}.evidence-tqm .kpi span{display:block;font-size:10px;color:#718187;font-weight:800;text-transform:uppercase}.evidence-tqm .kpi strong{display:block;font-size:26px;line-height:1.2;margin-top:2px}.evidence-tqm .kpi small{font-size:10px;color:#7d8c92;margin-top:4px}.evidence-tqm .kpi .kpi-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex:0 0 auto}.evidence-tqm .kpi-icon.blue{background:#dbeafe;color:#2563eb}.evidence-tqm .kpi-icon.green{background:#dcfce7;color:#16a34a}.evidence-tqm .kpi-icon.amber{background:#fef3c7;color:#b45309}.evidence-tqm .kpi-icon.purple{background:#ede9fe;color:#7c3aed}.evidence-tqm .kpi-icon.red{background:#fee2e2;color:#dc2626}.evidence-tqm .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.evidence-tqm .grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.evidence-tqm .head{padding:16px 18px 4px}.evidence-tqm .head h2{margin:0;font-size:15px}.evidence-tqm .head p{margin:4px 0 0;color:#74838a;font-size:11px}@media(max-width:900px){.evidence-tqm .grid{grid-template-columns:1fr}.evidence-tqm .grid3{grid-template-columns:1fr}.evidence-tqm .kpis{grid-template-columns:1fr 1fr}}`}</style>
  <PageHeader eyebrow="TÀI LIỆU & MINH CHỨNG" title="Kho minh chứng" description="KPI sử dụng số đếm toàn kho theo phạm vi RLS của người dùng. Biểu đồ cơ cấu và danh sách phía dưới sử dụng tối đa 300 bản gần nhất để giữ hiệu năng." icon="folder-check"/>
  {firstError?<div className="alert error">Không tải được đầy đủ kho minh chứng: {firstError.message}</div>:null}
  <section className="kpis">
   <article className="kpi"><span className="kpi-icon blue"><Icon name="folder-archive" size={17}/></span><span className="kpi-body"><span>Tổng minh chứng</span><strong>{total}</strong><small>Toàn bộ theo phạm vi được phép xem</small></span></article>
   <article className="kpi"><span className="kpi-icon green"><Icon name="badge-check" size={17}/></span><span className="kpi-body"><span>Hợp lệ toàn kho</span><strong>{validPct}%</strong><small>{valid}/{total || 0} minh chứng</small></span></article>
   <article className="kpi"><span className="kpi-icon amber"><Icon name="calendar-days" size={17}/></span><span className="kpi-body"><span>Chưa xác nhận</span><strong>{pending}</strong><small>Trạng thái PENDING</small></span></article>
   <article className="kpi"><span className="kpi-icon red"><Icon name="triangle-alert" size={17}/></span><span className="kpi-body"><span>Cần rà soát khác</span><strong>{otherReview}</strong><small>Khác VALID/PENDING</small></span></article>
   <article className="kpi"><span className="kpi-icon purple"><Icon name="folder-check" size={17}/></span><span className="kpi-body"><span>Dung lượng đã dùng</span><strong>{fmtGb(storageUsedBytes)}</strong><small>Toàn bộ file đã tải lên</small></span></article>
   <article className="kpi"><span className="kpi-icon blue"><Icon name="file-text" size={17}/></span><span className="kpi-body"><span>Mẫu đang hiển thị</span><strong>{rows.length}</strong><small>Tối đa 300 bản gần nhất</small></span></article>
  </section>
  <section className="grid3"><article className="panel"><div className="head"><h2>Cơ cấu minh chứng theo loại</h2><p>Phân loại theo mime-type/đuôi file thực tế trong tối đa 300 bản gần nhất.</p></div><TqmDonut value={rows.length?Math.round((typeMap.get("Tài liệu")||0)/rows.length*100):0} label="Tài liệu" segments={typeSegments.length?typeSegments:[{label:"Chưa có dữ liệu",value:1,tone:"slate"}]}/></article><article className="panel"><div className="head"><h2>Minh chứng theo nguồn</h2><p>Suy ra từ liên kết evidence_links tới hồ sơ nghiệp vụ; minh chứng chưa gắn hồ sơ nào tính riêng.</p></div><TqmHorizontalBars rows={sourceBars}/></article><article className="panel"><div className="head"><h2>Xu hướng tải minh chứng</h2><p>Phân bố thời điểm tải lên của tối đa 300 bản đang hiển thị.</p></div><TqmTrend points={months} unit=""/></article></section>
  <section className="grid"><article className="panel"><div className="head"><h2>Hiệu lực của 300 bản gần nhất</h2><p>Tỷ lệ mẫu gần nhất: {sampleValidPct}% hợp lệ; dùng để quan sát cơ cấu gần đây, trong khi KPI phía trên là toàn kho.</p></div><TqmDonut value={sampleValidPct} label="Hợp lệ gần đây" segments={[{label:"Hợp lệ",value:sampleValid,tone:"green"},{label:"Chưa xác nhận hợp lệ",value:sampleOther,tone:"amber"}]}/></article><article className="panel"><div className="head"><h2>Minh chứng theo khoa/phòng</h2><p>Phân bố trong tối đa 300 bản gần nhất; dùng để định hướng drill-down, không phải xếp hạng toàn viện.</p></div><TqmHorizontalBars rows={depBars}/></article></section>
  <section className="module-shortcuts-grid"><Link className="module-shortcut" href="/tasks"><strong>Việc của tôi</strong><span>Nộp minh chứng từ Action →</span></Link><Link className="module-shortcut" href="/assessments"><strong>Tự đánh giá</strong><span>Dùng minh chứng cho tiêu chí →</span></Link><Link className="module-shortcut" href="/audits"><strong>Audit / Tracer</strong><span>Tra cứu bằng chứng theo đợt →</span></Link></section>
  <section className="panel module-list-panel"><div className="panel-title"><div><h2>300 minh chứng gần nhất</h2><p>File mở qua API bảo vệ quyền truy cập.</p></div></div><div className="table-wrap"><table><thead><tr><th>Minh chứng</th><th>Liên quan</th><th>Đơn vị</th><th>Ngày / số văn bản</th><th>Trạng thái</th><th>Tải lên</th><th></th></tr></thead><tbody>{rows.map((r:any)=>{const link=linkByEvidence.get(r.id);return <tr key={r.id}><td><strong>{r.title}</strong><span className="subline">{r.original_file_name||r.evidence_type||"—"}{r.file_size?` · ${Math.max(1,Math.round(r.file_size/1024))} KB`:""}</span></td><td>{link?<span className="record-code-pill">{link.code}</span>:"—"}</td><td>{depMap.get(r.owner_department_id)||"—"}</td><td><strong>{formatDate(r.document_date)}</strong>{r.document_number?<span className="subline">{r.document_number}</span>:null}</td><td><StatusBadge status={r.validity_status}/></td><td>{formatDateTime(r.uploaded_at)}</td><td style={{display:"flex",gap:8,justifyContent:"flex-end"}}><a className="button tertiary small" href={`/api/evidence/${r.id}/download`} target="_blank" rel="noreferrer">Mở file</a>{canDelete?<EvidenceDeleteButton id={r.id} title={r.title}/>:null}</td></tr>})}{!rows.length?<tr><td colSpan={7}><div className="empty-state">Chưa có minh chứng.</div></td></tr>:null}</tbody></table></div></section>
 </div>
}
