"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Criterion = {
  id:string;
  code:string;
  name:string;
  required:boolean;
  applicability:string;
  notApplicableReason:string;
  leadDepartmentId:string|null;
  leadDepartmentName:string;
  maxScore:number|null;
  score:number|null;
  result:string;
  comment:string;
  status:string;
};

const STATUS:Record<string,string>={
  NOT_STARTED:"Chưa thực hiện",
  DRAFT:"Đang làm",
  SUBMITTED:"Đã gửi",
  REVIEWED:"Đã rà soát",
  FINALIZED:"Đã chốt",
  COMPLETED:"Hoàn tất",
  APPROVED:"Đã duyệt",
};

const SAVED_STATUS=new Set(["SUBMITTED","REVIEWED","FINALIZED","COMPLETED","APPROVED"]);

export function AssessmentCriteriaClient({
  recordId,
  editable,
  criteria,
}:{
  recordId:string;
  editable:boolean;
  criteria:Criterion[];
}) {
  const router=useRouter();
  const [rows,setRows]=useState(criteria);
  const [busyId,setBusyId]=useState("");
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [statusFilter,setStatusFilter]=useState("ALL");
  const [dirtyIds,setDirtyIds]=useState<Set<string>>(new Set());

  useEffect(()=>setRows(criteria),[criteria]);

  useEffect(()=>{
    if(!dirtyIds.size) return;
    const beforeUnload=(event:BeforeUnloadEvent)=>{
      event.preventDefault();
      event.returnValue="";
    };
    window.addEventListener("beforeunload",beforeUnload);
    return()=>window.removeEventListener("beforeunload",beforeUnload);
  },[dirtyIds]);

  const change=(id:string,patch:Partial<Criterion>)=>{
    setRows(xs=>xs.map(x=>x.id===id?{...x,...patch}:x));
    setDirtyIds(current=>new Set(current).add(id));
  };

  const visibleRows=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase("vi");
    return rows.filter(row=>{
      if(statusFilter==="PENDING" && SAVED_STATUS.has(row.status)) return false;
      if(statusFilter==="SUBMITTED" && !SAVED_STATUS.has(row.status)) return false;
      if(statusFilter==="NOT_APPLICABLE" && row.applicability!=="NOT_APPLICABLE") return false;
      if(!["ALL","PENDING","SUBMITTED","NOT_APPLICABLE"].includes(statusFilter) && row.status!==statusFilter) return false;
      if(!needle) return true;
      return [row.code,row.name,row.leadDepartmentName,row.result,row.comment]
        .some(value=>String(value||"").toLocaleLowerCase("vi").includes(needle));
    });
  },[rows,query,statusFilter]);

  async function save(row:Criterion,action:"SAVE_DRAFT"|"SUBMIT"){
    if(row.applicability==="NOT_APPLICABLE"){
      setError("Tiêu chí Không áp dụng không cần chấm.");
      return;
    }
    if(row.score==null&&!row.result.trim()){
      setError("Vui lòng nhập điểm hoặc kết quả đánh giá.");
      return;
    }
    if(row.score!=null && row.score<0){
      setError("Điểm không được nhỏ hơn 0.");
      return;
    }
    if(row.score!=null && row.maxScore!=null && row.score>row.maxScore){
      setError("Điểm của "+(row.code||"tiêu chí")+" không được vượt quá "+row.maxScore+".");
      return;
    }

    setBusyId(row.id);
    setError("");
    setMessage("");
    try{
      const response=await fetch("/api/assessments/"+recordId+"/criteria",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          action,
          criterion_id:row.id,
          score:row.score,
          result:row.result,
          summary_comment:row.comment,
        }),
      });
      const json=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(json.error||"Không lưu được tiêu chí.");
      setRows(current=>current.map(item=>item.id===row.id?{...item,status:json.status}:item));
      setDirtyIds(current=>{
        const next=new Set(current);
        next.delete(row.id);
        return next;
      });
      setMessage(json.message);
      router.refresh();
    }catch(cause){
      setError(cause instanceof Error?cause.message:"Không lưu được tiêu chí.");
    }finally{
      setBusyId("");
    }
  }

  const submitted=rows.filter(x=>x.applicability!=="NOT_APPLICABLE"&&SAVED_STATUS.has(x.status)).length;
  const applicable=rows.filter(x=>x.applicability!=="NOT_APPLICABLE").length;

  return <section className="panel">
    <div className="panel-title">
      <div>
        <h2>Bảng tự đánh giá</h2>
        <p>Nhập kết quả theo từng tiêu chí. Tiêu chí Không áp dụng không tính vào tiến độ chấm.</p>
      </div>
      <strong>{submitted}/{applicable} đã gửi</strong>
    </div>
    <div style={{padding:"0 18px 18px",display:"grid",gap:12}}>
      <div style={{display:"grid",gridTemplateColumns:"minmax(220px,1fr) 190px auto",gap:8,alignItems:"center"}}>
        <input
          value={query}
          onChange={e=>setQuery(e.target.value)}
          placeholder="Tìm mã, tên tiêu chí, khoa/phòng..."
          aria-label="Tìm tiêu chí"
        />
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} aria-label="Lọc trạng thái tiêu chí">
          <option value="ALL">Tất cả trạng thái</option>
          <option value="PENDING">Chưa gửi</option>
          <option value="SUBMITTED">Đã gửi / đã rà soát</option>
          <option value="NOT_APPLICABLE">Không áp dụng</option>
          <option value="DRAFT">Đang làm</option>
        </select>
        <span className="tiny muted">{visibleRows.length}/{rows.length} tiêu chí hiển thị{dirtyIds.size ? " · "+dirtyIds.size+" chưa lưu" : ""}</span>
      </div>
      {dirtyIds.size?<div className="alert warning">Có {dirtyIds.size} tiêu chí đang thay đổi nhưng chưa lưu. Hệ thống sẽ cảnh báo nếu rời trang.</div>:null}
      {error?<div className="alert error">{error}</div>:null}
      {message?<div className="alert success">{message}</div>:null}
      {rows.length===0?<div className="empty-state">Đợt này chưa có tiêu chí trong phạm vi.</div>
        :visibleRows.length===0?<div className="empty-state">Không có tiêu chí phù hợp bộ lọc.</div>
        :visibleRows.map(row=><article key={row.id} className="operating-spec-card" style={{display:"grid",gap:10}}>
          <div>
            <strong>{row.code} · {row.name}</strong>
            <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center",marginTop:4}}>
              {row.required?<span className="code-pill">Bắt buộc</span>:null}
              <span className="code-pill">{row.leadDepartmentName||"Chưa gán khoa/phòng"}</span>
              {row.maxScore!=null?<span className="code-pill">Tối đa {row.maxScore} điểm</span>:null}
              {dirtyIds.has(row.id)?<span className="tiny" style={{color:"#b45309",fontWeight:800}}>● Chưa lưu</span>:null}
            </div>
          </div>
          <div className="detail-grid">
            {row.applicability==="NOT_APPLICABLE"
              ?<div className="wide"><strong>Không áp dụng</strong><div>{row.notApplicableReason||"Chưa có lý do"}</div></div>
              :<>
                <label><span>Điểm</span><input
                  type="number"
                  min={0}
                  max={row.maxScore??undefined}
                  step="0.01"
                  disabled={!editable||busyId===row.id}
                  value={row.score??""}
                  onChange={e=>change(row.id,{score:e.target.value===""?null:Number(e.target.value)})}
                /></label>
                <label><span>Kết quả</span><input disabled={!editable||busyId===row.id} value={row.result} onChange={e=>change(row.id,{result:e.target.value})} placeholder="Đạt / Không đạt / ghi nhận..."/></label>
              </>}
            <label className="wide"><span>Nhận xét / giải trình</span><textarea disabled={!editable||busyId===row.id||row.applicability==="NOT_APPLICABLE"} rows={2} value={row.comment} onChange={e=>change(row.id,{comment:e.target.value})}/></label>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <span>Trạng thái: <strong>{STATUS[row.status]||row.status||"Chưa thực hiện"}</strong></span>
            {editable&&row.applicability!=="NOT_APPLICABLE"?<>
              <button className="button secondary small" disabled={busyId===row.id||(row.score==null&&!row.result.trim())} onClick={()=>save(row,"SAVE_DRAFT")}>Lưu để làm tiếp</button>
              <button className="button primary small" disabled={busyId===row.id||(row.score==null&&!row.result.trim())} onClick={()=>save(row,"SUBMIT")}>Hoàn tất & gửi</button>
            </>:null}
          </div>
        </article>)}
    </div>
  </section>;
}
