"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type RecordInfo = { id:string; record_type:string; record_code:string; title:string; lifecycle_status:string };
type LifecycleResponse = { record:RecordInfo|null; canManage?:boolean };

const DETAIL_RE = /^\/(tasks|plans|monitoring|directives|reports|inspections|indicators\/measurements|findings|incidents|capa|risks|fmea|improvement\/projects|improvement\/proposals|assessments|external-assessments|audits|safety-alerts|feedback)\/[0-9a-f-]{36}$/i;
const TERMINAL = new Set(["CANCELLED","ARCHIVED","INACTIVE","RETIRED"]);

function parentHref(pathname:string){
  if(pathname.startsWith("/indicators/measurements/"))return "/indicators";
  if(pathname.startsWith("/improvement/projects/"))return "/improvement/projects";
  if(pathname.startsWith("/improvement/proposals/"))return "/improvement/proposals";
  return `/${pathname.split("/").filter(Boolean)[0]}`;
}

export function GlobalRecordLifecycleActions(){
  const pathname=usePathname(); const router=useRouter();
  const eligible=useMemo(()=>DETAIL_RE.test(pathname),[pathname]);
  const [info,setInfo]=useState<LifecycleResponse|null>(null); const [open,setOpen]=useState(false);
  const [reason,setReason]=useState(""); const [busy,setBusy]=useState(false); const [error,setError]=useState("");

  useEffect(()=>{
    if(!eligible){setInfo(null);return;}
    const controller=new AbortController(); setInfo(null);
    fetch(`/api/record-lifecycle?path=${encodeURIComponent(pathname)}`,{signal:controller.signal,cache:"no-store"})
      .then(async res=>res.ok?res.json():{record:null}).then(data=>setInfo(data)).catch(()=>{});
    return()=>controller.abort();
  },[eligible,pathname]);

  if(!eligible||!info?.record)return null;
  const record=info.record; const isTerminal=TERMINAL.has(record.lifecycle_status);
  const canCancel=!!info.canManage&&!isTerminal&&record.lifecycle_status!=="CLOSED";
  if(!canCancel)return null;
  const isIncident=record.record_type==="INCIDENT";

  async function submit(){
    if(busy)return;
    if(reason.trim().length<3){setError("Vui lòng nhập lý do trước khi thực hiện.");return;}
    setBusy(true);setError("");
    try{
      const res=await fetch("/api/record-lifecycle",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recordId:record.id,action:"CANCEL",reason:reason.trim()})});
      const json=await res.json(); if(!res.ok)throw new Error(json.error||"Không hủy được hồ sơ.");
      setOpen(false); router.push(parentHref(pathname)); router.refresh();
    }catch(e:any){setError(e?.message||"Không hủy được hồ sơ.");}finally{setBusy(false);}
  }

  return <>
    <style>{`
      .record-danger-zone{margin-top:22px;padding:15px 16px;border:1px solid #f2d1d1;border-radius:14px;background:#fffafa;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
      .record-danger-zone-copy{display:grid;gap:3px}.record-danger-zone-copy strong{font-size:12px;color:#9f2727}.record-danger-zone-copy span{font-size:11px;color:#7b6262;line-height:1.45}
      .record-danger-zone .record-cancel-button{background:#fff;border-color:#efb9b9;color:#b42318}
      .record-danger-zone .record-cancel-button:hover{background:#fff0f0}
      @media(max-width:640px){.record-danger-zone{display:grid}.record-danger-zone .record-cancel-button{width:100%}}
      @media print{.record-danger-zone,.lifecycle-modal-backdrop{display:none!important}}
    `}</style>
    <section className="record-danger-zone" aria-label="Quản trị hồ sơ">
      <div className="record-danger-zone-copy"><strong>{isIncident?"Quản trị báo cáo sự cố":"Quản trị hồ sơ"}</strong><span>Chỉ hủy khi hồ sơ/tác vụ được tạo nhầm hoặc không còn áp dụng. Dữ liệu và lịch sử vẫn được giữ để truy vết.</span></div>
      <button type="button" className="button record-cancel-button" onClick={()=>{setError("");setReason("");setOpen(true);}}>{isIncident?"Hủy báo cáo":"Hủy hồ sơ"}</button>
    </section>

    {open?<div className="modal-backdrop lifecycle-modal-backdrop" role="dialog" aria-modal="true" aria-label="Hủy hồ sơ">
      <div className="modal-card lifecycle-modal-card">
        <div className="modal-head lifecycle-modal-head">
          <div><div className="eyebrow">{record.record_code}</div><h2>{isIncident?"Hủy báo cáo sự cố":"Hủy hồ sơ / tác vụ"}</h2></div>
          <button className="icon-button" type="button" onClick={()=>!busy&&setOpen(false)} aria-label="Đóng">×</button>
        </div>
        <div className="modal-body lifecycle-modal-body">
          <div className="alert error"><strong>Không xóa dữ liệu.</strong> Hồ sơ sẽ được ẩn khỏi các danh sách vận hành. Lịch sử và minh chứng vẫn được giữ để tra cứu.</div>
          <div className="lifecycle-record-title"><strong>{record.title}</strong><span>{record.record_type}</span></div>
          <label className="lifecycle-reason-field"><span>Lý do hủy <b>*</b></span><textarea rows={4} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ví dụ: Tạo nhầm, thay đổi kế hoạch, yêu cầu không còn áp dụng..." /></label>
          {error?<div className="alert error">{error}</div>:null}
        </div>
        <div className="modal-footer lifecycle-modal-footer">
          <button className="button secondary" type="button" disabled={busy} onClick={()=>setOpen(false)}>Không thực hiện</button>
          <button className="button primary" type="button" disabled={busy||reason.trim().length<3} onClick={submit}>{busy?"Đang xử lý...":"Xác nhận hủy"}</button>
        </div>
      </div>
    </div>:null}
  </>;
}
