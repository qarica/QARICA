"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { MultiCheckSelect } from "@/components/multi-check-select";

type Group={id:string;code:string|null;name:string;group_type:string;description:string|null;lead_department_id:string|null;leader_user_id:string|null;valid_from:string|null;valid_to:string|null;is_active:boolean};
type Member={id:string;group_id:string;user_id:string;member_role:string;is_active:boolean};
type Department={id:string;name:string;short_name:string|null};
type Profile={user_id:string;full_name:string|null;email:string|null;primary_department_id:string|null};

const TYPE_LABELS:Record<string,string>={
 WORKING_GROUP:"Nhóm phân công",AUDIT_TEAM:"Nhóm Audit/Tracer",ASSESSMENT_TEAM:"Nhóm đánh giá",RCA_TEAM:"Nhóm RCA",IMPROVEMENT_TEAM:"Nhóm cải tiến",MONITORING_TEAM:"Nhóm giám sát",OTHER:"Khác"
};
function emptyForm(){return {id:"",code:"",name:"",group_type:"WORKING_GROUP",description:"",lead_department_id:"",leader_user_id:"",valid_from:"",valid_to:"",is_active:true,member_ids:[] as string[],member_roles:{} as Record<string,string>};}

export function WorkGroupsClient({canManage,groups,members,departments,profiles}:{canManage:boolean;groups:Group[];members:Member[];departments:Department[];profiles:Profile[]}){
 const router=useRouter();
 const [search,setSearch]=useState("");
 const [showInactive,setShowInactive]=useState(false);
 const [open,setOpen]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState<{tone:"success"|"error";text:string}|null>(null);
 const [form,setForm]=useState(emptyForm());
 const deptMap=useMemo(()=>new Map(departments.map(x=>[x.id,x.short_name||x.name])),[departments]);
 const profileMap=useMemo(()=>new Map(profiles.map(x=>[x.user_id,x.full_name||x.email||x.user_id])),[profiles]);
 const profileOptions=useMemo(()=>profiles.map(x=>({id:x.user_id,label:x.full_name||x.email||x.user_id,description:x.primary_department_id?deptMap.get(x.primary_department_id)||null:null})),[profiles,deptMap]);

 const filtered=groups.filter(g=>(showInactive||g.is_active)&&`${g.code||""} ${g.name} ${TYPE_LABELS[g.group_type]||g.group_type}`.toLowerCase().includes(search.trim().toLowerCase()));

 function edit(group?:Group){
  setMessage(null);
  if(!group){setForm(emptyForm());setOpen(true);return;}
  const activeMembers=members.filter(m=>m.group_id===group.id&&m.is_active);
  const roles:Record<string,string>={};activeMembers.forEach(m=>roles[m.user_id]=m.member_role);
  setForm({
   id:group.id,code:group.code||"",name:group.name,group_type:group.group_type,description:group.description||"",
   lead_department_id:group.lead_department_id||"",leader_user_id:group.leader_user_id||"",valid_from:group.valid_from||"",valid_to:group.valid_to||"",
   is_active:group.is_active,member_ids:activeMembers.map(m=>m.user_id),member_roles:roles
  });
  setOpen(true);
 }

 async function submit(e:FormEvent){
  e.preventDefault();
  if(!form.name.trim())return setMessage({tone:"error",text:"Tên nhóm là bắt buộc."});
  setBusy(true);setMessage(null);
  try{
   const payload={
    code:form.code.trim()||null,name:form.name.trim(),group_type:form.group_type,description:form.description.trim()||null,
    lead_department_id:form.lead_department_id||null,leader_user_id:form.leader_user_id||null,valid_from:form.valid_from||null,valid_to:form.valid_to||null,is_active:form.is_active,
    members:form.member_ids.map(user_id=>({user_id,member_role:user_id===form.leader_user_id?"LEADER":(form.member_roles[user_id]||"MEMBER")}))
   };
   const res=await fetch(form.id?`/api/work-groups/${form.id}`:"/api/work-groups",{method:form.id?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
   const json=await res.json();if(!res.ok)throw new Error(json.error||"Không lưu được nhóm.");
   setMessage({tone:"success",text:form.id?"Đã cập nhật nhóm phân công.":"Đã tạo nhóm phân công."});
   setOpen(false);router.refresh();
  }catch(err){setMessage({tone:"error",text:err instanceof Error?err.message:"Có lỗi xảy ra."});}
  finally{setBusy(false);}
 }

 async function toggle(group:Group){
  setBusy(true);setMessage(null);
  try{
   const res=await fetch(`/api/work-groups/${group.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({command:"TOGGLE_ACTIVE"})});
   const json=await res.json();if(!res.ok)throw new Error(json.error||"Không cập nhật được trạng thái.");
   setMessage({tone:"success",text:group.is_active?"Đã ngưng nhóm; lịch sử phân công được giữ nguyên.":"Đã kích hoạt lại nhóm."});router.refresh();
  }catch(err){setMessage({tone:"error",text:err instanceof Error?err.message:"Có lỗi xảy ra."});}
  finally{setBusy(false);}
 }

 function setLeader(id:string){
  setForm(current=>{
   const ids=id&&!current.member_ids.includes(id)?[...current.member_ids,id]:current.member_ids;
   const roles={...current.member_roles};
   if(current.leader_user_id&&roles[current.leader_user_id]==="LEADER")roles[current.leader_user_id]="MEMBER";
   if(id)roles[id]="LEADER";
   return {...current,leader_user_id:id,member_ids:ids,member_roles:roles};
  });
 }

 const modal=open&&typeof document!=="undefined"?createPortal(
  <div className="modal-backdrop"><form className="modal-card" onSubmit={submit} style={{width:"min(1100px,calc(100vw - 32px))",maxHeight:"calc(100dvh - 32px)"}}>
   <div className="modal-head"><div><div className="eyebrow">NHÓM PHÂN CÔNG</div><h2>{form.id?"Cập nhật nhóm":"Tạo nhóm mới"}</h2></div><button type="button" className="icon-button" onClick={()=>!busy&&setOpen(false)}>×</button></div>
   <div className="modal-body" style={{overflowY:"auto"}}>
    <div className="form-grid two">
     <label className="span-2">Tên nhóm *<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ví dụ: Phòng ABC, Trưởng khoa/phòng, Mạng lưới QLCL"/></label>
     <label className="span-2">Thành viên
      <MultiCheckSelect options={profileOptions} value={form.member_ids} onChange={ids=>setForm(current=>({...current,member_ids:ids,leader_user_id:ids.includes(current.leader_user_id)?current.leader_user_id:""}))} placeholder="Chọn thành viên nhóm"/>
     </label>
     <label>Trưởng nhóm<select value={form.leader_user_id} onChange={e=>setLeader(e.target.value)}><option value="">— Chưa chỉ định —</option>{form.member_ids.map(id=><option key={id} value={id}>{profileMap.get(id)||id}</option>)}</select></label>
     <label>Khoa/phòng mặc định<select value={form.lead_department_id} onChange={e=>setForm({...form,lead_department_id:e.target.value})}><option value="">— Không cố định —</option>{departments.map(d=><option key={d.id} value={d.id}>{d.short_name||d.name}</option>)}</select></label>
     <div className="span-2 scope-note" style={{margin:0}}>Nhóm được khai báo một lần và dùng lại ở mọi nơi. Vai trò <strong>phụ trách / đầu mối / hỗ trợ</strong> do từng lần giao việc quyết định, không phải tạo nhóm mới.</div>
     <details className="span-2">
      <summary className="tiny muted" style={{cursor:"pointer",fontWeight:800}}>Thông tin nâng cao</summary>
      <div className="form-grid two" style={{marginTop:10}}>
       <label>Mã nhóm<input value={form.code} onChange={e=>setForm({...form,code:e.target.value})} placeholder="Tự chọn nếu cần"/></label>
       <label>Loại nhóm<select value={form.group_type} onChange={e=>setForm({...form,group_type:e.target.value})}>{Object.entries(TYPE_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
       <label>Hiệu lực từ<input type="date" value={form.valid_from} onChange={e=>setForm({...form,valid_from:e.target.value})}/></label>
       <label>Đến<input type="date" value={form.valid_to} onChange={e=>setForm({...form,valid_to:e.target.value})}/></label>
       <label className="span-2">Mô tả<textarea rows={3} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
      </div>
     </details>
    </div>
   </div>
   <div className="modal-footer"><button type="button" className="button secondary" onClick={()=>setOpen(false)} disabled={busy}>Đóng</button><button className="button primary" disabled={busy}>{busy?"Đang lưu...":"Lưu nhóm"}</button></div>
  </form></div>,document.body):null;

 return <>
  {message?<div className={`alert ${message.tone}`}>{message.text}</div>:null}
  <section className="panel">
   <div className="toolbar"><div className="toolbar-left"><div className="search-box"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm mã, tên, loại nhóm..."/></div><label style={{display:"flex",alignItems:"center",gap:6,fontSize:12}}><input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)}/> Hiện nhóm đã ngưng</label></div>{canManage?<button className="button primary" onClick={()=>edit()}>+ Tạo nhóm</button>:null}</div>
   <div className="table-wrap"><table><thead><tr><th>Nhóm</th><th>Loại</th><th>Đầu mối</th><th>Thành viên</th><th>Hiệu lực</th><th>Trạng thái</th><th></th></tr></thead><tbody>{filtered.map(g=>{const ms=members.filter(m=>m.group_id===g.id&&m.is_active);return <tr key={g.id}><td><strong>{g.name}</strong>{g.code?<span className="subline">{g.code}</span>:null}</td><td>{TYPE_LABELS[g.group_type]||g.group_type}</td><td>{g.lead_department_id?deptMap.get(g.lead_department_id)||"—":"—"}{g.leader_user_id?<span className="subline">{profileMap.get(g.leader_user_id)||"—"}</span>:null}</td><td><strong>{ms.length}</strong><span className="subline">{ms.slice(0,3).map(m=>profileMap.get(m.user_id)||m.user_id).join(", ")}{ms.length>3?` +${ms.length-3}`:""}</span></td><td>{g.valid_from||"—"}<span className="subline">đến {g.valid_to||"không giới hạn"}</span></td><td>{g.is_active?"Đang hoạt động":"Đã ngưng"}</td><td>{canManage?<div style={{display:"flex",gap:6}}><button className="button tertiary small" onClick={()=>edit(g)}>Sửa</button><button className="button secondary small" disabled={busy} onClick={()=>toggle(g)}>{g.is_active?"Ngưng":"Kích hoạt"}</button></div>:null}</td></tr>})}{!filtered.length?<tr><td colSpan={7}><div className="empty-state">Chưa có nhóm phân công phù hợp.</div></td></tr>:null}</tbody></table></div>
  </section>
  {modal}
 </>;
}
