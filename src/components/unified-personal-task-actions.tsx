"use client";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";
import {VnDateInput} from "@/components/vn-date-input";

type Source="reminder"|"legacy";
const hcmToday=()=>new Date(Date.now()+7*3600000).toISOString().slice(0,10);
const stamp=()=>new Intl.DateTimeFormat("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date());
export function UnifiedPersonalTaskActions({id,source,ownerId,initialNote,isDone,title,children}:{id:string;source:Source;ownerId:string;initialNote:string|null;isDone:boolean;title:string;children?:React.ReactNode}){
 const router=useRouter();const [isPending,startTransition]=useTransition();const [editing,setEditing]=useState(false);const [entry,setEntry]=useState("");const [progress,setProgress]=useState(()=>{const matches=[...(initialNote||"").matchAll(/Tiến độ (\d+)%/g)];return matches.length?Math.min(100,Number(matches[matches.length-1][1])):0;});const [date,setDate]=useState(hcmToday());const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 const table=source==="legacy"?"personal_workspace_items":"personal_reminders";
 const noteColumn=source==="legacy"?"content":"note";
 // router.refresh() re-runs the whole page's server-component query chain
 // (dozens of Supabase calls), which is slow. Trước đây setBusy(false) chạy
 // NGAY sau khi ghi thành công, rồi mới gọi router.refresh() — nút bấm trông
 // như đã xong trong khi dữ liệu thật vẫn đang âm thầm tải lại phía sau, gây
 // cảm giác "đơ"/giật khi đổi trạng thái. Bọc router.refresh() trong
 // startTransition và gộp isPending vào disabled để nút vẫn ở trạng thái bận
 // cho đến khi dữ liệu mới thật sự sẵn sàng.
 async function update(fields:Record<string,unknown>){setBusy(true);setError("");const {data,error}=await createClient().from(table).update(fields).eq("id",id).eq("owner_user_id",ownerId).select("id");if(error||!data?.length){setBusy(false);setError(error?.message||"Không thể cập nhật công việc.");return false;}setBusy(false);startTransition(()=>{router.refresh();});return true;}
 async function saveEntry(){if(!entry.trim()){setError("Vui lòng nhập nội dung tiến độ.");return;}setBusy(true);setError("");const client=createClient();const {data:latest,error:readError}=await client.from(table).select(noteColumn).eq("id",id).eq("owner_user_id",ownerId).single();if(readError||!latest){setBusy(false);setError(readError?.message||"Không đọc được nhật ký hiện tại.");return;}const rawPrevious=(latest as Record<string,unknown>)[noteColumn];const previous=String(rawPrevious||"");const addition=`[${stamp()} · Tiến độ ${progress}%]\n${entry.trim()}`;const next=previous?previous.trimEnd()+"\n\n"+addition:addition;let write=client.from(table).update({[noteColumn]:next}).eq("id",id).eq("owner_user_id",ownerId);write=rawPrevious===null?write.is(noteColumn,null):write.eq(noteColumn,previous);const {data,error}=await write.select("id");if(error||!data?.length){setBusy(false);setError(error?.message||"Nhật ký đã được cập nhật ở nơi khác. Vui lòng tải lại và thử lại.");return;}setBusy(false);setEntry("");setEditing(false);startTransition(()=>{router.refresh();});}
 async function toggle(){const today=hcmToday();if(!isDone&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+"T00:00:00Z"))||date>today)){setError("Ngày hoàn thành không hợp lệ.");return;}await update({status:isDone?"OPEN":source==="legacy"?"DONE":"COMPLETED",completed_at:isDone?null:new Date(date+"T00:00:00+07:00").toISOString()});}
 // Việc ĐÃ hoàn thành không có "Cập nhật tiến độ" (việc xong rồi, không còn
 // tiến độ để theo dõi). Chỉ còn đúng 1 hành động hợp lý: Mở lại.
 return <div className="upta" style={{display:"flex",gap:6,alignItems:"flex-start",flexWrap:"wrap",minWidth:0,width:"100%"}}>
  <style>{`.upta-more{min-width:0}.upta-more>summary{list-style:none;cursor:pointer;min-width:34px;text-align:center}.upta-more>summary::-webkit-details-marker{display:none}.upta-menu{display:grid;gap:6px;margin-top:6px;padding:8px;border:1px solid #d7e1e5;border-radius:10px;background:#f8fafb;min-width:170px}.upta-menu .button{justify-content:flex-start;text-align:left}`}</style>
  <button type="button" className="button secondary small" disabled={busy||isPending} onClick={()=>void toggle()}>{busy||isPending?"Đang cập nhật...":isDone?"Mở lại":"Hoàn tất"}</button>
  {!isDone?<details className="upta-more"><summary className="button tertiary small" aria-label={"Thao tác khác: "+title} title="Cập nhật tiến độ, chuyển cho người khác">⋯</summary>
   <div className="upta-menu">
    <button type="button" className="button tertiary small" disabled={busy||isPending} onClick={()=>{setError("");setEditing(true)}}>Cập nhật tiến độ</button>
    {children}
    <label style={{fontSize:12,display:"grid",gap:5,minWidth:0}}>Ngày hoàn thành<VnDateInput aria-label={"Ngày hoàn thành "+title} value={date} max={hcmToday()} onChange={(e)=>setDate(e.target.value)}/></label>
   </div></details>:null}
  {editing?<div style={{position:"fixed",inset:0,zIndex:1100,background:"rgba(15,23,42,.55)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}} role="presentation" onClick={()=>setEditing(false)}><section role="dialog" aria-modal="true" aria-label={"Cập nhật tiến độ: "+title} onClick={e=>e.stopPropagation()} style={{width:"min(760px,100%)",maxHeight:"90vh",overflowY:"auto",background:"#fff",color:"#0f172a",borderRadius:14,padding:20,boxShadow:"0 18px 60px rgba(0,0,0,.22)",display:"grid",gap:12}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}><h2 style={{fontSize:18,margin:0}}>Cập nhật tiến độ công việc</h2><button type="button" className="button tertiary small" onClick={()=>setEditing(false)}>✕ Đóng</button></div><strong>{title}</strong><label style={{display:"grid",gap:5}}>Tiến độ thực hiện: <strong>{progress}%</strong><input type="range" min={0} max={100} step={10} value={progress} onChange={e=>setProgress(Number(e.target.value))}/></label><textarea className="input" aria-label={"Nhật ký "+title} rows={9} style={{width:"100%",minHeight:200,resize:"vertical",fontSize:14,lineHeight:1.6}} placeholder="Đã thực hiện gì? Kết quả, vướng mắc, bước tiếp theo..." value={entry} onChange={e=>setEntry(e.target.value)}/><small>Mỗi lần lưu sẽ thêm một mục có thời gian và % tiến độ; không ghi đè nhật ký trước.</small>{error?<small role="alert" style={{color:"#b91c1c"}}>{error}</small>:null}<div style={{display:"flex",justifyContent:"flex-end",gap:8,flexWrap:"wrap"}}><button type="button" className="button tertiary" disabled={busy} onClick={()=>{setEntry("");setEditing(false)}}>Hủy, không lưu</button><button type="button" className="button primary" disabled={busy||!entry.trim()} onClick={()=>void saveEntry()}>{busy?"Đang lưu...":"Lưu cập nhật"}</button></div></section></div>:null}{!editing&&error?<small role="alert" style={{color:"#b91c1c"}}>{error}</small>:null}</div>;
}
