"use client";
import Link from "next/link";
import { useMemo,useState } from "react";
import { usePathname,useRouter,useSearchParams } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { buildRegistryCsv, registryExportFileName } from "@/lib/registry-export";
import type { ModuleOperatingSpec } from "@/lib/module-operating-spec";

type Row={id:string;record_type:string;record_code:string;title:string;lifecycle_status:string;department_name:string;owner_name:string;created_at:string;updated_at:string;route:string};
const CSV_EXPORT_TYPES=new Set(["FINDING","CAPA","RISK","AUDIT"]);

function SpecColumn({title,items,tone}:{title:string;items:string[];tone:string}){
 return <article className={`operating-spec-card ${tone}`}><div className="operating-spec-title">{title}</div><ul>{items.map((x,i)=><li key={`${title}-${i}`}>{x}</li>)}</ul></article>;
}

export function RegistryModuleWorkspace(p:{year:number;rows:Row[];recordType:string;workflow:string[];principle:string;related:{label:string;href:string}[];operatingSpec?:ModuleOperatingSpec|null}){
 const searchParams=useSearchParams();const router=useRouter();const pathname=usePathname();
 const initialStatus=searchParams.get("status")||"ALL";const initialQuery=searchParams.get("q")||"";
 const [q,setQ]=useState(initialQuery);const [status,setStatus]=useState(initialStatus);
 function syncUrl(nextQ:string,nextStatus:string){const params=new URLSearchParams(searchParams.toString());if(nextQ.trim())params.set("q",nextQ.trim());else params.delete("q");if(nextStatus!=="ALL")params.set("status",nextStatus);else params.delete("status");const query=params.toString();router.replace(query?`${pathname}?${query}`:pathname,{scroll:false})}
 const rows=useMemo(()=>{const needle=q.trim().toLowerCase();return p.rows.filter(r=>(!needle||`${r.record_code} ${r.title} ${r.department_name} ${r.owner_name}`.toLowerCase().includes(needle))&&(status==="ALL"||r.lifecycle_status===status))},[p.rows,q,status]);
 function exportCsv(){
  const csv=buildRegistryCsv({recordType:p.recordType,year:p.year,query:q,status,rows});
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;anchor.download=registryExportFileName(p.recordType,p.year);document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);
 }
 return <>
  <section className="module-process-card"><div className="module-process-flow">{p.workflow.map((s,i)=><div className="module-process-step" key={s}><span>{i+1}</span><strong>{s}</strong></div>)}</div><p className="module-principle">{p.principle}</p></section>
  {p.operatingSpec?<details className="operating-spec-panel"><summary><strong>Điều kiện chốt đợt</strong><span> · mở xem quy tắc và minh chứng</span></summary><section>
    <div className="operating-spec-head"><div><span className="module-overline">CHUẨN VẬN HÀNH TỪ TÀI LIỆU NGUỒN</span><h3>Hồ sơ phải đủ trước khi được đóng</h3></div>{p.operatingSpec.cadence?.length?<div className="cadence-chip">Có nhịp công việc</div>:null}</div>
    <div className="operating-spec-grid"><SpecColumn title="Dữ liệu bắt buộc" items={p.operatingSpec.required} tone="info"/><SpecColumn title="Minh chứng phải giữ" items={p.operatingSpec.evidence} tone="success"/><SpecColumn title="Điều kiện đóng" items={p.operatingSpec.closeGate} tone="warning"/></div>
    {p.operatingSpec.cadence?.length?<div className="operating-cadence"><strong>Nhịp / thời điểm:</strong>{p.operatingSpec.cadence.map((x,i)=><span key={i}>{x}</span>)}</div>:null}
    <div className="operating-source-row"><strong>Nguồn đã dùng:</strong>{p.operatingSpec.source.map((x,i)=><span key={`${x}-${i}`}>{x}</span>)}</div>
  </section>:null}
  <section className="module-shortcuts-grid">{p.related.map(x=><Link className="module-shortcut" href={x.href} key={x.href+x.label}><strong>{x.label}</strong><span>Mở chức năng liên quan →</span></Link>)}</section>
  {!isAssessment?<section className="panel module-list-panel" id="registry-list"><div className="module-toolbar"><input value={q} onChange={e=>{const value=e.target.value;setQ(value);syncUrl(value,status)}} placeholder="Tìm mã, tên, đơn vị, người phụ trách..."/><select value={status} onChange={e=>{const value=e.target.value;setStatus(value);syncUrl(q,value)}}><option value="ALL">Tất cả trạng thái</option><option value="ACTIVE">Đang hoạt động</option><option value="CLOSED">Đã đóng</option><option value="CANCELLED">Đã hủy</option><option value="ARCHIVED">Lưu trữ</option></select>{CSV_EXPORT_TYPES.has(p.recordType)?<button type="button" className="button secondary" onClick={exportCsv} disabled={!rows.length}>Xuất Excel (CSV)</button>:null}</div><div className="module-list-summary"><strong>{rows.length}</strong> / {p.rows.length} hồ sơ · năm {p.year}{CSV_EXPORT_TYPES.has(p.recordType)?<span> · file xuất theo đúng bộ lọc hiện tại</span>:null}</div>
   <div className="table-wrap registry-desktop"><table><thead><tr><th>Mã</th><th>Hồ sơ</th><th>Phụ trách</th><th>Trạng thái</th><th>Cập nhật</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><span className="record-code-pill">{r.record_code}</span></td><td><Link className="record-title-link" href={r.route}>{r.title}</Link></td><td><div className="registry-owner"><strong>{r.department_name}</strong><small>{r.owner_name}</small></div></td><td><StatusBadge status={r.lifecycle_status}/></td><td>{formatDateTime(r.updated_at)}</td></tr>)}{!rows.length?<tr><td colSpan={5}><div className="empty-state">Không có hồ sơ phù hợp.</div></td></tr>:null}</tbody></table></div>
   <div className="registry-mobile">{rows.map(r=><Link className="registry-card" href={r.route} key={r.id}><div className="registry-card-head"><span className="record-code-pill">{r.record_code}</span><StatusBadge status={r.lifecycle_status}/></div><div className="registry-title">{r.title}</div><div className="registry-owner"><strong>{r.department_name}</strong><small>{r.owner_name}</small></div><div className="registry-card-foot"><span>Cập nhật</span><strong>{formatDateTime(r.updated_at)}</strong></div></Link>)}{!rows.length?<div className="empty-state">Không có hồ sơ phù hợp.</div>:null}</div>
  </section>
 </>
}
