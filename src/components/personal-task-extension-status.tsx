"use client";
import {useEffect,useState} from "react";
import {createClient} from "@/lib/supabase/client";
type Request={id:string;requested_due_at:string;reason:string;status:string;requested_at:string;review_note:string|null};
export function PersonalTaskExtensionStatus({taskId,source,ownerId}:{taskId:string;source:"reminder"|"legacy";ownerId:string}){
 const [items,setItems]=useState<Request[]>([]);const [error,setError]=useState("");const [loading,setLoading]=useState(true);
 useEffect(()=>{let alive=true;const load=async()=>{const {data,error}=await createClient().from("personal_task_extension_requests").select("id,requested_due_at,reason,status,requested_at,review_note").eq("owner_user_id",ownerId).eq("task_source",source).eq("task_id",taskId).order("requested_at",{ascending:false}).limit(30);if(!alive)return;setItems((data||[]) as Request[]);setError(error?.message||"");setLoading(false)};void load();return()=>{alive=false}},[taskId,source,ownerId]);
 if(loading)return <small>Đang tải đề nghị gia hạn...</small>;
 if(error)return <small role="alert">Không tải được đề nghị gia hạn: {error}</small>;
 if(!items.length)return null;
 return <section style={{display:"grid",gap:8}}><h3 style={{fontSize:16,margin:0}}>Đề nghị gia hạn ({items.length})</h3>{items.map(item=><article key={item.id} style={{padding:12,border:"1px solid #e2e8f0",borderRadius:8,display:"grid",gap:5}}><strong>{item.status==="PENDING"?"Đang chờ duyệt":item.status==="APPROVED"?"Đã duyệt":"Đã từ chối"}</strong><div>Hạn đề xuất: {new Date(item.requested_due_at).toLocaleDateString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}</div><div>Lý do: {item.reason}</div><small>Gửi lúc {new Date(item.requested_at).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}</small>{item.review_note?<div>Ý kiến duyệt: {item.review_note}</div>:null}</article>)}</section>;
}
