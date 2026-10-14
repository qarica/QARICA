"use client";
import { useState } from "react";
type Props={sourceType:"ACTION"|"EMR"|"RECORD"|"OTHER";sourceId:string;initial?:{id:string;waiting_for_label?:string|null;follow_up_at?:string|null;note?:string|null}|null};
export function WorkFollowupControl({sourceType,sourceId,initial}:Props){
 const[current,setCurrent]=useState(initial??null); const[busy,setBusy]=useState(false);
 async function markWaiting(){
  const waitingForLabel=window.prompt("Đang chờ ai/điều gì?",current?.waiting_for_label||""); if(waitingForLabel===null)return;
  const followUpAt=window.prompt("Ngày/giờ cần nhắc lại (ISO hoặc để trống):",current?.follow_up_at||""); if(followUpAt===null)return;
  setBusy(true); try{
   const res=await fetch("/api/work/followups",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({source_type:sourceType,source_id:sourceId,waiting_for_type:"EXTERNAL_PARTY",waiting_for_label:waitingForLabel||null,follow_up_at:followUpAt||null})});
   const body=await res.json().catch(()=>({})); if(!res.ok||!body.ok)throw new Error(body.error||"Không lưu được follow-up."); setCurrent(body.followup);
  }catch(error){window.alert(error instanceof Error?error.message:"Không lưu được follow-up.");}finally{setBusy(false);}
 }
 async function clearWaiting(){if(!current?.id)return;setBusy(true);try{
  const res=await fetch("/api/work/followups?id="+encodeURIComponent(current.id),{method:"DELETE"});const body=await res.json().catch(()=>({}));
  if(!res.ok||!body.ok)throw new Error(body.error||"Không bỏ trạng thái đang chờ được.");setCurrent(null);
 }catch(error){window.alert(error instanceof Error?error.message:"Không bỏ trạng thái đang chờ được.");}finally{setBusy(false);}}
 if(current)return <span style={{display:"inline-flex",gap:6,alignItems:"center",flexWrap:"wrap"}}><span className="badge warning">{"Đang chờ"+(current.waiting_for_label?": "+current.waiting_for_label:"")}</span><button className="button tertiary small" type="button" disabled={busy} onClick={()=>void clearWaiting()}>Bỏ chờ</button></span>;
 return <button className="button tertiary small" type="button" disabled={busy} onClick={()=>void markWaiting()}>Đang chờ…</button>;
}
