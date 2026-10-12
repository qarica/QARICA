"use client";
import { FormEvent,useMemo,useState } from "react";
type Note={id:string;note_type:"NOTE"|"JOURNAL"|"DECISION"|"LESSON"|"REFERENCE";visibility:"PRIVATE"|"TEAM"|"LINKED_RECORD";title:string;content:string|null;journal_date:string|null;status:"ACTIVE"|"ARCHIVED";source_kind:string;created_at:string};
const TYPE_LABEL:Record<Note["note_type"],string>={NOTE:"Ghi chú",JOURNAL:"Nhật ký",DECISION:"Quyết định",LESSON:"Bài học",REFERENCE:"Tham khảo"};
export function KnowledgeJournalClient({initialNotes,hasOrganization}:{initialNotes:Note[];hasOrganization:boolean}){
 const[notes,setNotes]=useState(initialNotes);const[type,setType]=useState<Note["note_type"]>("NOTE");const[visibility,setVisibility]=useState<Note["visibility"]>("PRIVATE");const[title,setTitle]=useState("");const[content,setContent]=useState("");const[recordId,setRecordId]=useState("");const[query,setQuery]=useState("");const[busy,setBusy]=useState(false);const[showComposer,setShowComposer]=useState(false);const[errorMessage,setErrorMessage]=useState<string|null>(null);
 const filtered=useMemo(()=>{const q=query.trim().toLowerCase();return q?notes.filter(n=>n.title.toLowerCase().includes(q)||String(n.content||"").toLowerCase().includes(q)):notes;},[notes,query]);
 async function createNote(event:FormEvent){event.preventDefault();if(!title.trim())return;setBusy(true);setErrorMessage(null);try{
  const res=await fetch("/api/knowledge",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({note_type:type,visibility,title:title.trim(),content:content.trim()||null,journal_date:type==="JOURNAL"?new Date().toISOString().slice(0,10):null})});
  const body=await res.json().catch(()=>({}));if(!res.ok||!body.ok)throw new Error(body.error||"Không tạo được ghi chú.");const note=body.note as Note;
  if(visibility==="LINKED_RECORD"&&recordId.trim()){const lr=await fetch("/api/knowledge/"+note.id+"/links",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({relation_type:"RELATED_TO",target_type:"RECORD",target_id:recordId.trim()})});const lb=await lr.json().catch(()=>({}));if(!lr.ok||!lb.ok)throw new Error(lb.error||"Đã tạo ghi chú nhưng không liên kết được hồ sơ.");}
  setNotes(prev=>[note,...prev]);setTitle("");setContent("");setRecordId("");setShowComposer(false);
 }catch(error){setErrorMessage(error instanceof Error?error.message:"Không tạo được ghi chú.");}finally{setBusy(false);}}
 async function archive(id:string){const res=await fetch("/api/knowledge/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"ARCHIVED"})});const body=await res.json().catch(()=>({}));if(!res.ok||!body.ok){setErrorMessage(body.error||"Không lưu trữ được ghi chú.");return;}setNotes(prev=>prev.filter(n=>n.id!==id));}
 return <section id="knowledge-journal" className="work-section" style={{display:"grid",gap:12}}>
  <div className="section-head"><div><h2>Sổ tay cá nhân</h2><p>Ghi chú, nhật ký và tài liệu tham khảo cá nhân. Sự cố, CAPA, quyết định quản trị và cải tiến chính thức được quản lý trong module nghiệp vụ hoặc QLCL.</p></div></div>
  <div><button type="button" className="button secondary small" aria-expanded={showComposer} onClick={()=>setShowComposer(v=>!v)}>{showComposer?"Ẩn biểu mẫu":"+ Thêm vào Brain"}</button></div>
  {errorMessage?<p role="alert" className="alert error">{errorMessage}</p>:null}
  {showComposer?<form onSubmit={createNote} style={{display:"grid",gap:8}}>
   <div className="toolbar" style={{padding:0,flexWrap:"wrap"}}>
    <select value={type} onChange={e=>setType(e.target.value as Note["note_type"])}>{Object.entries(TYPE_LABEL).filter(([value])=>value==="NOTE"||value==="JOURNAL"||value==="REFERENCE").map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
    <select value={visibility} onChange={e=>setVisibility(e.target.value as Note["visibility"])}><option value="PRIVATE">Riêng tư</option>{hasOrganization?<option value="TEAM">Cùng tổ chức</option>:null}{hasOrganization?<option value="LINKED_RECORD">Theo quyền hồ sơ liên kết</option>:null}</select>
    <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Tiêu đề..." maxLength={300} required/>
   </div>
   <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="Nội dung..." rows={4}/>
   {visibility==="LINKED_RECORD"?<input value={recordId} onChange={e=>setRecordId(e.target.value)} placeholder="Record ID cần liên kết..." required/>:null}
   <div><button className="button primary small" disabled={busy||!title.trim()} type="submit">Lưu vào sổ tay</button></div>
  </form>:null}
  <div className="search-box" style={{maxWidth:420}}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm trong ghi chú..."/></div>
  <div style={{display:"grid",gap:8}}>{filtered.map(note=><article key={note.id} className="card" style={{padding:14}}><div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",minWidth:0}}><div style={{minWidth:0,overflowWrap:"anywhere"}}><small>{TYPE_LABEL[note.note_type]} · {note.visibility==="PRIVATE"?"Riêng tư":note.visibility==="TEAM"?"Cùng tổ chức":"Theo hồ sơ"}</small><h3 style={{margin:"4px 0 6px"}}>{note.title}</h3>{note.content?<p style={{margin:0,whiteSpace:"pre-wrap"}}>{note.content}</p>:null}</div><button type="button" className="button tertiary small" onClick={()=>void archive(note.id)}>Lưu trữ</button></div></article>)}{!filtered.length?<div className="empty-state compact">Chưa có ghi chú phù hợp.</div>:null}</div>
 </section>;
}
