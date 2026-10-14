"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Reminder={id:string;title:string;note:string|null;due_at:string|null;priority:string;status:string;category?:string;remind_at?:string|null};

const CATEGORY_LABEL:Record<string,string>={HOP_NOI_BO:"Họp nội bộ",THEO_DOI_CAPA:"Theo dõi CAPA",KIEM_TRA_HO_SO:"Kiểm tra hồ sơ",NHAC_NHO:"Nhắc nhở",KHAC:"Khác"};
const PRIORITY_LABEL:Record<string,string>={LOW:"Thấp",NORMAL:"Bình thường",HIGH:"Cao",URGENT:"Khẩn"};
const CATEGORIES=Object.keys(CATEGORY_LABEL);

export function PersonalReminders({initialRows,organizationId,userId}:{initialRows:Reminder[];organizationId:string;userId:string}){
 const supabase=createClient();
 const [rows,setRows]=useState(initialRows);
 const [title,setTitle]=useState(""); const [due,setDue]=useState(""); const [priority,setPriority]=useState("NORMAL"); const [category,setCategory]=useState("KHAC");
 const [remindEnabled,setRemindEnabled]=useState(false); const [remindTime,setRemindTime]=useState("08:00");
 const [busy,setBusy]=useState(false); const [error,setError]=useState("");
 const [editingId,setEditingId]=useState<string|null>(null);const [editNote,setEditNote]=useState("");
 const [completionDates,setCompletionDates]=useState<Record<string,string>>({});
 const [statusFilter,setStatusFilter]=useState<"OPEN"|"COMPLETED"|"ALL">("OPEN");

 async function add(){
  const clean=title.trim();
  if(!clean)return;
  if(!remindEnabled&&window.confirm("Bạn có muốn đặt nhắc nhở cho việc này không?\\nOK: chọn ngày/giờ nhắc. Hủy: lưu không nhắc.")){setRemindEnabled(true);return;}
  if(remindEnabled&&!due){setError("Vui lòng chọn ngày để đặt nhắc nhở.");return;}
  setBusy(true);setError("");
  const dueAt=due?new Date(`${due}T00:00:00`):new Date(Date.now()+7*86400000);
  const remindAt=remindEnabled&&due?new Date(`${due}T${remindTime}:00`):null;
  const {data,error}=await supabase.from("personal_reminders").insert({organization_id:organizationId,owner_user_id:userId,title:clean,priority,category,due_at:dueAt.toISOString(),remind_at:remindAt?remindAt.toISOString():null}).select("id,title,note,due_at,priority,status,category,remind_at").single();
  setBusy(false);
  if(error){setError(error.message);return}
  setRows(v=>[...v,data as Reminder].sort((a,b)=>(a.due_at||"9999").localeCompare(b.due_at||"9999")));window.location.reload();
  setTitle("");setDue("");setPriority("NORMAL");setCategory("KHAC");setRemindEnabled(false);setRemindTime("08:00");
 }
 async function complete(row:Reminder){const next=row.status==="COMPLETED"?"OPEN":"COMPLETED";const selected=completionDates[row.id]||new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());const completedAt=next==="COMPLETED"?new Date(`${selected}T00:00:00+07:00`).toISOString():null;if(next==="COMPLETED"&&(!/^\\d{4}-\\d{2}-\\d{2}$/.test(selected)||selected>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()))){setError("Ngày hoàn thành không hợp lệ.");return;}const {error}=await supabase.from("personal_reminders").update({status:next,completed_at:completedAt,updated_at:new Date().toISOString()}).eq("id",row.id);if(error){setError(error.message);return}setRows(v=>v.map(x=>x.id===row.id?{...x,status:next}:x))}
 async function saveNote(id:string){const {data,error}=await supabase.from("personal_reminders").update({note:editNote.trim()||null,updated_at:new Date().toISOString()}).eq("id",id).eq("owner_user_id",userId).select("id");if(error||!data?.some(row=>row.id===id)){setError(error?.message||"Không thể lưu ghi chú.");return;}setRows(v=>v.map(x=>x.id===id?{...x,note:editNote.trim()||null}:x));setEditingId(null);}
 async function remove(id:string){if(!window.confirm("Xóa note này? Không thể hoàn tác."))return;const {error}=await supabase.from("personal_reminders").delete().eq("id",id);if(error){setError(error.message);return}setRows(v=>v.filter(x=>x.id!==id))}

 return <section className="panel pr-section">
  <div className="panel-title"><div><h2>Tạo việc cá nhân</h2><p>Tạo việc tại đây; chỉnh sửa, hoàn thành và theo dõi trong bảng công việc thống nhất bên dưới.</p></div></div>
  <div className="pr-form">
   <input className="input pr-title" placeholder="Nhập nội dung note... (Ví dụ: Họp, kiểm tra hồ sơ, theo dõi CAPA,...)" value={title} maxLength={300} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void add()}}/>
   <div className="pr-form-row">
    <input className="input" type="date" value={due} onChange={e=>setDue(e.target.value)}/>
    <select className="input" value={priority} onChange={e=>setPriority(e.target.value)}>{Object.entries(PRIORITY_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
   </div>
   <div className="pr-chip-row">{CATEGORIES.map(c=><button type="button" key={c} className={`pr-chip ${category===c?"active":""}`} onClick={()=>setCategory(c)}>{CATEGORY_LABEL[c]}</button>)}</div>
   <div className="pr-remind-row">
    <label className="inline-check"><input type="checkbox" checked={remindEnabled} onChange={e=>setRemindEnabled(e.target.checked)}/> Đặt nhắc nhở</label>
    {remindEnabled?<input className="input pr-time" type="time" value={remindTime} onChange={e=>setRemindTime(e.target.value)}/>:null}
    <button className="button primary small" disabled={busy||!title.trim()} onClick={()=>void add()}>+ Thêm việc</button>
   </div>
  </div>
  {error?<div className="alert error" style={{margin:"0 12px 12px"}}>{error}</div>:null}
  <p style={{padding:"0 12px 12px",fontSize:12}}>Các công việc được quản lý trong bảng tổng hợp bên dưới, không hiển thị danh sách trùng lặp.</p>
  <style jsx>{`
   .pr-form{display:grid;gap:8px;padding:12px}
   .pr-title{width:100%}
   .pr-form-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
   .pr-chip-row{display:flex;gap:6px;flex-wrap:wrap}
   .pr-chip{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 12px;font-size:11px;font-weight:700;color:#475569}
   .pr-chip.active{background:var(--brand);border-color:var(--brand);color:#fff}
   .pr-remind-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:space-between}
   .pr-time{width:auto;min-width:110px}
   @media(max-width:620px){.pr-form-row{grid-template-columns:1fr}}
  `}</style>
 </section>
}
