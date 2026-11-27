"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LabDateInput } from "@/components/lab-supplies-date-input";


const CATEGORY_LABEL:Record<string,string>={HOP_NOI_BO:"Họp nội bộ",THEO_DOI_CAPA:"Theo dõi CAPA",KIEM_TRA_HO_SO:"Kiểm tra hồ sơ",NHAC_NHO:"Nhắc nhở",KHAC:"Khác"};
const PRIORITY_LABEL:Record<string,string>={LOW:"Thấp",NORMAL:"Bình thường",HIGH:"Cao",URGENT:"Khẩn"};
const CATEGORIES=Object.keys(CATEGORY_LABEL);

export function PersonalReminders({organizationId,userId}:{organizationId:string;userId:string}){
 const supabase=createClient();
 const [title,setTitle]=useState(""); const [due,setDue]=useState(""); const [priority,setPriority]=useState("NORMAL"); const [category,setCategory]=useState("KHAC");
 const [remindEnabled,setRemindEnabled]=useState(false); const [remindTime,setRemindTime]=useState("08:00");
 // Yêu cầu tường minh: áp dụng khung 5W1H (Why/Where/How — What=title,
 // Who=chính mình, When=due đã có sẵn) + SMART (Measurable — Specific đã là
 // title, Time-bound đã là due) vào việc cá nhân. Thu gọn mặc định (giống
 // doc-intake-toggle) vì đa số note nhanh không cần lập kế hoạch đầy đủ.
 const [planOpen,setPlanOpen]=useState(false);
 const [whyText,setWhyText]=useState(""); const [whereText,setWhereText]=useState(""); const [howText,setHowText]=useState(""); const [smartTarget,setSmartTarget]=useState("");
 const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  
 async function add(){
  const clean=title.trim();
  if(!clean)return;
  if(remindEnabled&&!due){setError("Vui lòng chọn ngày để đặt nhắc nhở.");return;}
  setBusy(true);setError("");
  const dueAt=due?new Date(`${due}T00:00:00`):new Date(Date.now()+7*86400000);
  const remindAt=remindEnabled&&due?new Date(`${due}T${remindTime}:00`):null;
  const {error}=await supabase.from("personal_reminders").insert({organization_id:organizationId,owner_user_id:userId,title:clean,priority,category,due_at:dueAt.toISOString(),remind_at:remindAt?remindAt.toISOString():null,why_text:whyText.trim()||null,where_text:whereText.trim()||null,how_text:howText.trim()||null,smart_target:smartTarget.trim()||null});
  setBusy(false);
  if(error){setError(error.message);return}
  window.location.reload();
  setTitle("");setDue("");setPriority("NORMAL");setCategory("KHAC");setRemindEnabled(false);setRemindTime("08:00");
  setPlanOpen(false);setWhyText("");setWhereText("");setHowText("");setSmartTarget("");
 }

 return <section className="pr-quick" aria-label="Thêm việc cá nhân">
  <div className="pr-quick-row">
   <input className="input pr-title" placeholder="Thêm việc cá nhân… (Enter để thêm)" aria-label="Nội dung việc cá nhân" value={title} maxLength={300} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void add();}}}/>
   <LabDateInput className="pr-date" label="Hạn xử lý" value={due} onChange={setDue}/>
   <select className="input pr-prio" aria-label="Mức ưu tiên" value={priority} onChange={e=>setPriority(e.target.value)}>{Object.entries(PRIORITY_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
   <button className="button primary small" disabled={busy||!title.trim()} onClick={()=>void add()}>+ Thêm</button>
  </div>
  <details className="pr-more" open={planOpen||remindEnabled||category!=="KHAC"}>
   <summary>Chi tiết: nhóm, nhắc nhở, kế hoạch 5W1H + SMART</summary>
   <div className="pr-more-body">
    <div className="pr-chip-row">{CATEGORIES.map(c=><button type="button" key={c} className={`pr-chip ${category===c?"active":""}`} onClick={()=>setCategory(c)}>{CATEGORY_LABEL[c]}</button>)}</div>
    <div className="pr-remind-row">
     <label className="inline-check"><input type="checkbox" checked={remindEnabled} onChange={e=>setRemindEnabled(e.target.checked)}/> Đặt nhắc nhở (cần chọn hạn)</label>
     {remindEnabled?<input className="input pr-time" type="time" aria-label="Giờ nhắc" value={remindTime} onChange={e=>setRemindTime(e.target.value)}/>:null}
    </div>
    <button type="button" className="button tertiary small pr-plan-toggle" aria-expanded={planOpen} onClick={()=>setPlanOpen(v=>!v)}>{planOpen?"Thu gọn lập kế hoạch":"+ Lập kế hoạch đầy đủ (5W1H + SMART)"}</button>
    {planOpen?<div className="pr-plan-fields">
     <label><span>Tại sao (Why) — lý do/mục đích</span><input className="input" placeholder="Vì sao việc này cần làm..." value={whyText} onChange={e=>setWhyText(e.target.value)}/></label>
     <label><span>Ở đâu (Where) — không bắt buộc</span><input className="input" placeholder="Địa điểm thực hiện..." value={whereText} onChange={e=>setWhereText(e.target.value)}/></label>
     <label><span>Như thế nào (How) — cách thực hiện</span><input className="input" placeholder="Các bước / cách làm..." value={howText} onChange={e=>setHowText(e.target.value)}/></label>
     <label><span>Mục tiêu đo lường được (SMART — Measurable)</span><input className="input" placeholder="Ví dụ: hoàn thành 100% nội dung, đạt chỉ tiêu X..." value={smartTarget} onChange={e=>setSmartTarget(e.target.value)}/></label>
     <small className="muted">What = nội dung việc ở trên · Who = chính bạn · When = hạn bên trên.</small>
    </div>:null}
   </div>
  </details>
  {error?<div className="alert error" role="alert">{error}</div>:null}
  <style jsx>{`
   .pr-quick{display:grid;gap:6px;background:#fff;border:1px solid #d3dee3;border-radius:12px;padding:10px 12px}
   .pr-quick-row{display:grid;grid-template-columns:minmax(0,1fr) 150px 130px auto;gap:8px;align-items:center}
   .pr-quick-row>*{min-width:0}
   .pr-more>summary{cursor:pointer;font-size:12px;font-weight:700;color:#52656d;padding:2px 0}
   .pr-more-body{display:grid;gap:8px;padding:8px 0 2px}
   .pr-chip-row{display:flex;gap:6px;flex-wrap:wrap}
   .pr-chip{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 12px;font-size:11px;font-weight:700;color:#475569}
   .pr-chip.active{background:var(--brand);border-color:var(--brand);color:#fff}
   .pr-remind-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
   .pr-time{width:auto;min-width:110px}
   .pr-plan-toggle{justify-self:start}
   .pr-plan-fields{display:grid;gap:8px;padding:10px;border:1px dashed var(--line);border-radius:12px;background:#fafcfd}
   .pr-plan-fields>*{min-width:0}
   @media(max-width:760px){.pr-quick-row{grid-template-columns:1fr 1fr}.pr-quick-row .pr-title{grid-column:1/-1}.pr-quick-row button{grid-column:1/-1}}
  `}</style>
 </section>
}
