"use client";
import { FormEvent,useState } from "react";
import { useRouter } from "next/navigation";

export function IndicatorCreateForm(){
 const router=useRouter(); const [open,setOpen]=useState(false); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault(); setBusy(true); setError("");
  const fd=new FormData(e.currentTarget); const body=Object.fromEntries(fd.entries());
  const res=await fetch("/api/indicator-definitions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const json=await res.json().catch(()=>({}));
  setBusy(false); if(!res.ok){setError(json.error||"Không tạo được chỉ số.");return}
  setOpen(false); router.refresh();
 }
 return <div className="card" style={{padding:16}}>
  <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}><div><strong>Danh mục chỉ số</strong><div className="muted">Chỉ tạo master data tại đây; kỳ đo lường được quản lý riêng.</div></div><button className="btn btn-primary" onClick={()=>setOpen(v=>!v)}>{open?"Đóng":"+ Thêm chỉ số"}</button></div>
  {open&&<form onSubmit={submit} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12,marginTop:16}}>
   <label>Mã chỉ số<input name="code" placeholder="Tự sinh nếu để trống"/></label>
   <label>Tên chỉ số *<input name="name" required/></label>
   <label>Lĩnh vực<input name="quality_dimension"/></label>
   <label>Đơn vị đo<input name="unit" placeholder="%, ngày, ca..."/></label>
   <label>Cách tính<select name="calculation_type" defaultValue="RAW"><option value="RAW">Giá trị trực tiếp</option><option value="PERCENTAGE">Tỷ lệ %</option><option value="RATIO">Tỷ số</option><option value="RATE">Tỷ suất</option><option value="AVERAGE">Trung bình</option><option value="COUNT">Số lượng</option></select></label>
   <label>Chiều hướng<select name="desired_direction" defaultValue="NEUTRAL"><option value="HIGHER_IS_BETTER">Càng cao càng tốt</option><option value="LOWER_IS_BETTER">Càng thấp càng tốt</option><option value="TARGET_RANGE">Trong khoảng mục tiêu</option><option value="NEUTRAL">Theo dõi</option></select></label>
   <label>Tần suất<select name="frequency" defaultValue="MONTHLY"><option value="DAILY">Hằng ngày</option><option value="WEEKLY">Hằng tuần</option><option value="MONTHLY">Hằng tháng</option><option value="QUARTERLY">Hằng quý</option><option value="SEMIANNUAL">6 tháng</option><option value="ANNUAL">Hằng năm</option></select></label>
   <label>Ngày hiệu lực<input type="date" name="effective_from"/></label>
   <label style={{gridColumn:"1/-1"}}>Mục đích<textarea name="purpose" rows={2}/></label>
   {error&&<div style={{gridColumn:"1/-1"}} className="alert alert-error">{error}</div>}
   <div style={{gridColumn:"1/-1",display:"flex",justifyContent:"flex-end"}}><button className="btn btn-primary" disabled={busy}>{busy?"Đang tạo...":"Tạo chỉ số"}</button></div>
  </form>}
 </div>
}