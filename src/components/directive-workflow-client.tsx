"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { DictationTextarea } from "@/components/dictation-textarea";

const LABEL:Record<string,string>={
  OPEN:"Mới tiếp nhận",
  ASSIGNED:"Đã phân công",
  IN_PROGRESS:"Đang thực hiện",
  EVIDENCE_SUBMITTED:"Chờ xác nhận",
  COMPLETED:"Hoàn tất",
};

type ReviewAction = "COMPLETE" | "RETURN" | null;

export function DirectiveWorkflowClient({
  recordId,status,canManage,hasOwner,hasRequirements,actions,incomplete,evidence,
}:{
  recordId:string;status:string;canManage:boolean;hasOwner:boolean;hasRequirements:boolean;
  actions:number;incomplete:number;evidence:number;
}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [reviewAction,setReviewAction]=useState<ReviewAction>(null);
  const [reviewNote,setReviewNote]=useState("");

  async function run(action:string,comment?:string){
    if(busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      const response=await fetch(`/api/directives/${recordId}/workflow`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action,comment}),
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||"Không xử lý được yêu cầu.");
      setNotice(result.message);
      setReviewAction(null);
      setReviewNote("");
      router.refresh();
    }catch(value){
      setError(value instanceof Error?value.message:"Không xử lý được yêu cầu.");
    }finally{
      setBusy(false);
    }
  }

  function openReview(action:Exclude<ReviewAction,null>){
    setReviewAction(action);
    setReviewNote("");
    setError("");
    setNotice("");
  }

  function submitReview(event:FormEvent){
    event.preventDefault();
    const note=reviewNote.trim();
    if(!reviewAction||!note)return;
    void run(reviewAction,note);
  }

  return <section className="panel directive-workflow">
    <div className="panel-title">
      <div>
        <h2>Directive Workflow</h2>
        <p>Tiếp nhận → phân công → Action → minh chứng → xác nhận; không hoàn tất chỉ bằng đổi trạng thái.</p>
      </div>
      <strong>{LABEL[status]||status}</strong>
    </div>
    <div className="directive-body">
      {error?<div className="alert error">{error}</div>:null}
      {notice?<div className="alert success">{notice}</div>:null}
      <div className="domain-metrics">
        <div><strong>{hasOwner?"Đủ":"Thiếu"}</strong><span>Owner</span></div>
        <div><strong>{actions}</strong><span>Action</span></div>
        <div><strong>{incomplete}</strong><span>Action chưa xong</span></div>
        <div><strong>{evidence}</strong><span>Minh chứng</span></div>
      </div>

      <div className="directive-actions">
        {status==="OPEN"&&canManage?
          <button className="button primary" disabled={busy||!hasOwner||!hasRequirements} onClick={()=>void run("ASSIGN")}>Xác nhận phân công</button>:null}
        {status==="ASSIGNED"&&canManage?
          <button className="button primary" disabled={busy||actions<1} onClick={()=>void run("START")}>Bắt đầu thực hiện</button>:null}
        {status==="IN_PROGRESS"&&canManage?
          <button className="button primary" disabled={busy||incomplete>0||evidence<1} onClick={()=>void run("SUBMIT_EVIDENCE")}>Gửi kết quả xác nhận</button>:null}
        {status==="EVIDENCE_SUBMITTED"&&canManage?<>
          <button className="button primary" disabled={busy} onClick={()=>openReview("COMPLETE")}>Xác nhận hoàn tất</button>
          <button className="button secondary" disabled={busy} onClick={()=>openReview("RETURN")}>Trả lại bổ sung</button>
        </>:null}
      </div>

      {reviewAction?<form className="directive-review" onSubmit={submitReview}>
        <label>
          {reviewAction==="COMPLETE"?"Kết luận xác nhận hoàn tất":"Lý do trả lại bổ sung"} *
          <DictationTextarea
            rows={4}
            value={reviewNote}
            onValueChange={setReviewNote}
            disabled={busy}
            placeholder={reviewAction==="COMPLETE"
              ?"Ghi kết luận sau khi kiểm tra Action và minh chứng."
              :"Ghi rõ nội dung cần bổ sung hoặc chỉnh sửa."}
          />
        </label>
        <div className="directive-review-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={()=>{setReviewAction(null);setReviewNote("");}}>Hủy</button>
          <button className="button primary" disabled={busy||!reviewNote.trim()}>{busy?"Đang xử lý...":"Xác nhận"}</button>
        </div>
      </form>:null}
    </div>
    <style>{`
      .directive-body{padding:0 18px 18px;display:grid;gap:12px}
      .directive-actions{display:flex;gap:8px;flex-wrap:wrap}
      .directive-review{display:grid;gap:10px;border:1px solid #dfe8ea;border-radius:12px;padding:12px;background:#fbfdfd}
      .directive-review label{display:grid;gap:5px;font-size:11px;font-weight:750;color:#44545a}
      .directive-review-actions{display:flex;justify-content:flex-end;gap:8px}
    `}</style>
  </section>;
}
