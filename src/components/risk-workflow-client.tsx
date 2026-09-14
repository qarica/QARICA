"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AssessmentInfo = {
  assessmentType?: string | null;
  assessmentDate?: string | null;
  severity?: number | null;
  likelihood?: number | null;
  calculatedScore?: number | null;
  calculatedLevel?: string | null;
  rationale?: string | null;
} | null;

type MatrixInfo = {
  id: string;
  name: string;
  versionNo: number;
  severityMax: number;
  likelihoodMax: number;
} | null;

const STATUS_LABEL: Record<string,string> = {
  IDENTIFIED:"Đã nhận diện",
  ASSESSED:"Đã đánh giá",
  TREATMENT_REQUIRED:"Cần xử lý",
  IN_TREATMENT:"Đang xử lý",
  REASSESSMENT:"Chờ đánh giá lại",
  MONITORING:"Theo dõi",
  RISK_ACCEPTED:"Đã chấp nhận rủi ro",
  RETIRED:"Đã retire",
};

function levelTone(level?: string | null) {
  const value = String(level || "").toUpperCase();
  if (["EXTREME","CRITICAL","VERY_HIGH","HIGH","RED"].includes(value)) return "danger";
  if (["MEDIUM","MODERATE","YELLOW","AMBER"].includes(value)) return "warning";
  if (["LOW","GREEN"].includes(value)) return "success";
  return "info";
}

export function RiskWorkflowClient({
  recordId,
  status,
  canManage,
  actionCount,
  incompleteActionCount,
  evidenceCount,
  latestAssessment,
  matrix,
}: {
  recordId: string;
  status: string;
  canManage: boolean;
  actionCount: number;
  incompleteActionCount: number;
  evidenceCount: number;
  latestAssessment: AssessmentInfo;
  matrix: MatrixInfo;
}) {
  const router = useRouter();
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [severity,setSeverity] = useState(String(latestAssessment?.severity || 1));
  const [likelihood,setLikelihood] = useState(String(latestAssessment?.likelihood || 1));
  const [rationale,setRationale] = useState(latestAssessment?.rationale || "");
  const [evidenceSummary,setEvidenceSummary] = useState("");
  const [acceptDecision,setAcceptDecision] = useState("ACCEPT_WITH_MONITORING");
  const [acceptReason,setAcceptReason] = useState("");
  const [nextReviewDate,setNextReviewDate] = useState("");

  const canAssess = !!matrix && canManage && ["IDENTIFIED","ASSESSED","REASSESSMENT","MONITORING"].includes(status);
  const progress = useMemo(() => {
    const order=["IDENTIFIED","ASSESSED","TREATMENT_REQUIRED","IN_TREATMENT","REASSESSMENT","MONITORING","RISK_ACCEPTED","RETIRED"];
    return Math.max(0, order.indexOf(status));
  },[status]);

  async function command(action:string,payload:Record<string,unknown>={}) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch(`/api/risks/${recordId}/workflow`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action,...payload}),
      });
      const json = await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(json.error || "Không xử lý được rủi ro.");
      setNotice(json.message || "Đã cập nhật rủi ro.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xử lý được rủi ro.");
    } finally { setBusy(false); }
  }

  function submitAssessment(e:FormEvent) {
    e.preventDefault();
    if(!matrix) { setError("Chưa có Risk Matrix đã phát hành."); return; }
    const s=Number(severity), l=Number(likelihood);
    if(!Number.isInteger(s)||s<1||s>matrix.severityMax){setError(`Severity phải từ 1 đến ${matrix.severityMax}.`);return;}
    if(!Number.isInteger(l)||l<1||l>matrix.likelihoodMax){setError(`Likelihood phải từ 1 đến ${matrix.likelihoodMax}.`);return;}
    command("ASSESS",{severity:s,likelihood:l,rationale:rationale.trim(),evidence_summary:evidenceSummary.trim()});
  }

  function submitAcceptance(e:FormEvent) {
    e.preventDefault();
    if(!acceptReason.trim()){setError("Cần nhập lý do quyết định chấp nhận/theo dõi rủi ro.");return;}
    if(acceptDecision==="ACCEPT_WITH_MONITORING"&&!nextReviewDate){setError("Cần chọn ngày rà soát tiếp theo.");return;}
    command("ACCEPT",{decision:acceptDecision,acceptance_reason:acceptReason.trim(),next_review_date:nextReviewDate||null});
  }

  const steps=["Nhận diện","Đánh giá","Xử lý","Đánh giá lại","Theo dõi / chấp nhận"];

  return <section className="panel risk-workflow-panel">
    <style>{`
      .risk-workflow-panel{overflow:hidden}.risk-wf-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:18px 19px;border-bottom:1px solid #edf2f3}.risk-wf-head h2{margin:0;font-size:18px}.risk-wf-head p{margin:5px 0 0;color:#64748b;font-size:12px;line-height:1.5}.risk-wf-status{font-size:11px;font-weight:850;padding:6px 10px;border-radius:999px;background:#eff6ff;color:#1d4ed8;white-space:nowrap}.risk-stepper{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;padding:14px 18px;background:#fbfdff;border-bottom:1px solid #eef2f3}.risk-step{display:grid;gap:5px;justify-items:center;text-align:center;color:#94a3b8;font-size:9.5px;font-weight:800}.risk-step span{display:grid;place-items:center;width:26px;height:26px;border-radius:999px;background:#e8edef;color:#65747a}.risk-step.active{color:#1d4ed8}.risk-step.active span{background:#dbeafe;color:#1d4ed8}.risk-gates{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;padding:14px 18px}.risk-gate{border:1px solid #e2e8f0;border-radius:12px;padding:11px 12px;background:#fff;display:grid;gap:3px}.risk-gate strong{font-size:18px}.risk-gate span{font-size:10px;color:#64748b}.risk-body{display:grid;gap:12px;padding:0 18px 18px}.risk-box{padding:14px;border:1px solid #dfe8ea;border-radius:13px;background:#fff}.risk-box h3{font-size:14px;margin:0 0 5px}.risk-box p{font-size:11px;color:#64748b;margin:0 0 12px;line-height:1.5}.risk-form{display:grid;grid-template-columns:1fr 1fr;gap:11px}.risk-form .wide{grid-column:1/-1}.risk-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.risk-alert{margin:0 18px 14px}.risk-current{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px;border-radius:11px;background:#f8fafc;margin-bottom:12px}.risk-current div{display:grid;gap:2px}.risk-current span{font-size:9px;color:#64748b;text-transform:uppercase}.risk-current strong{font-size:13px}.risk-matrix-note{font-size:10px;color:#64748b;margin-top:6px}.risk-level{display:inline-flex;width:max-content;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:850}.risk-level.danger{background:#fff0f0;color:#b91c1c}.risk-level.warning{background:#fff7e6;color:#a16207}.risk-level.success{background:#eaf7ef;color:#166534}.risk-level.info{background:#edf5ff;color:#1d4ed8}@media(max-width:760px){.risk-stepper{grid-template-columns:repeat(2,1fr)}.risk-gates,.risk-current{grid-template-columns:1fr 1fr}.risk-form{grid-template-columns:1fr}.risk-form .wide{grid-column:auto}.risk-wf-head{display:grid}.risk-wf-status{width:max-content}.risk-actions .button{width:100%}}
    `}</style>
    <div className="risk-wf-head"><div><h2>Risk Register · Vòng xử lý rủi ro</h2><p>Điểm rủi ro lấy từ Risk Matrix đã phát hành; sau xử lý phải đánh giá residual risk trước khi chấp nhận hoặc tiếp tục theo dõi.</p></div><span className="risk-wf-status">{STATUS_LABEL[status]||status}</span></div>
    <div className="risk-stepper">{steps.map((s,i)=><div className={`risk-step ${progress>=Math.min(i+1,4)||status==="RETIRED"?"active":""}`} key={s}><span>{i+1}</span>{s}</div>)}</div>
    <div className="risk-gates"><div className="risk-gate"><strong>{latestAssessment?.calculatedScore ?? "—"}</strong><span>Risk score gần nhất</span></div><div className="risk-gate"><strong>{actionCount}</strong><span>Action xử lý · còn {incompleteActionCount}</span></div><div className="risk-gate"><strong>{evidenceCount}</strong><span>Minh chứng</span></div><div className="risk-gate"><strong>{matrix?`v${matrix.versionNo}`:"—"}</strong><span>Risk Matrix đang dùng</span></div></div>
    {error?<div className="alert error risk-alert">{error}</div>:null}{notice?<div className="alert success risk-alert">{notice}</div>:null}
    <div className="risk-body">
      {latestAssessment?<div className="risk-box"><h3>Đánh giá gần nhất</h3><div className="risk-current"><div><span>Loại</span><strong>{latestAssessment.assessmentType||"—"}</strong></div><div><span>Severity</span><strong>{latestAssessment.severity??"—"}</strong></div><div><span>Likelihood</span><strong>{latestAssessment.likelihood??"—"}</strong></div><div><span>Mức</span><strong className={`risk-level ${levelTone(latestAssessment.calculatedLevel)}`}>{latestAssessment.calculatedLevel||"—"}</strong></div></div></div>:null}

      {canAssess?<form className="risk-box" onSubmit={submitAssessment}><h3>{status==="REASSESSMENT"?"Bước 4 · Đánh giá residual risk":"Bước 2 · Đánh giá rủi ro"}</h3><p>{matrix?`Ma trận: ${matrix.name} · v${matrix.versionNo}. Hệ thống tự tìm score/mức từ đúng ô Severity × Likelihood.`:"Chưa có Risk Matrix ở trạng thái PUBLISHED; không được tự nhập điểm rủi ro."}</p><div className="risk-form"><label>Severity *<input type="number" min="1" max={matrix?.severityMax||9} value={severity} onChange={e=>setSeverity(e.target.value)} /></label><label>Likelihood *<input type="number" min="1" max={matrix?.likelihoodMax||9} value={likelihood} onChange={e=>setLikelihood(e.target.value)} /></label><label className="wide">Căn cứ / lý do đánh giá<textarea rows={3} value={rationale} onChange={e=>setRationale(e.target.value)} placeholder="Tóm tắt cơ sở chấm mức độ và khả năng xảy ra..." /></label><label className="wide">Tóm tắt minh chứng<textarea rows={3} value={evidenceSummary} onChange={e=>setEvidenceSummary(e.target.value)} placeholder="Dữ liệu, sự cố, audit, chỉ số hoặc bằng chứng liên quan..." /></label></div><div className="risk-matrix-note">Không cho nhập score bằng tay. Score và risk level được lấy từ ma trận đã phát hành.</div><div className="risk-actions"><button className="button primary" disabled={busy||!matrix}>{busy?"Đang lưu...":status==="REASSESSMENT"?"Lưu residual risk":"Lưu đánh giá"}</button></div></form>:null}

      {status==="ASSESSED"&&canManage?<div className="risk-box"><h3>Bước 3 · Quyết định xử lý</h3><p>Nếu cần giảm/né/chuyển giao/dự phòng, chuyển sang lập Action. Nếu mức rủi ro phù hợp để chấp nhận, có thể ghi quyết định chấp nhận kèm lý do và lịch review.</p><div className="risk-actions"><button className="button primary" disabled={busy} onClick={()=>command("REQUIRE_TREATMENT")}>Yêu cầu lập Action xử lý</button></div></div>:null}

      {status==="TREATMENT_REQUIRED"&&canManage?<div className="risk-box"><h3>Bước 3 · Lập Action xử lý</h3><p>Dùng khối “Hành động / nhiệm vụ liên kết” bên dưới để tạo Action và chọn loại xử lý Avoid / Reduce / Transfer / Accept / Contingency.</p><div className="risk-actions"><button className="button primary" disabled={busy||actionCount<1} onClick={()=>command("START_TREATMENT")}>Bắt đầu triển khai xử lý</button></div></div>:null}

      {status==="IN_TREATMENT"&&canManage?<div className="risk-box"><h3>Bước 3–4 · Hoàn tất xử lý</h3><p>Chỉ chuyển sang residual risk khi toàn bộ Action đang áp dụng đã hoàn tất và có minh chứng.</p><div className="risk-current"><div><span>Action</span><strong>{actionCount}</strong></div><div><span>Chưa xong</span><strong>{incompleteActionCount}</strong></div><div><span>Minh chứng</span><strong>{evidenceCount}</strong></div><div><span>Gate</span><strong>{actionCount>0&&incompleteActionCount===0&&evidenceCount>0?"Đủ":"Chưa đủ"}</strong></div></div><div className="risk-actions"><button className="button primary" disabled={busy||actionCount<1||incompleteActionCount>0||evidenceCount<1} onClick={()=>command("REQUEST_REASSESSMENT")}>Chuyển đánh giá residual risk</button></div></div>:null}

      {["ASSESSED","MONITORING"].includes(status)&&canManage&&latestAssessment?<form className="risk-box" onSubmit={submitAcceptance}><h3>Bước 5 · Chấp nhận / tiếp tục theo dõi</h3><p>Quyết định phải bám đánh giá gần nhất và được lưu thành một bản ghi acceptance riêng để truy vết.</p><div className="risk-form"><label>Quyết định<select value={acceptDecision} onChange={e=>setAcceptDecision(e.target.value)}><option value="ACCEPT">Chấp nhận</option><option value="ACCEPT_WITH_MONITORING">Chấp nhận có theo dõi</option><option value="NOT_ACCEPTED">Không chấp nhận</option><option value="ESCALATE">Escalate</option></select></label><label>Ngày rà soát tiếp<input type="date" value={nextReviewDate} onChange={e=>setNextReviewDate(e.target.value)} /></label><label className="wide">Lý do quyết định *<textarea rows={3} value={acceptReason} onChange={e=>setAcceptReason(e.target.value)} /></label></div><div className="risk-actions"><button className="button primary" disabled={busy}>Lưu quyết định</button></div></form>:null}

      {["RISK_ACCEPTED","MONITORING"].includes(status)&&canManage?<div className="risk-box"><h3>Kết thúc vòng rủi ro</h3><p>Chỉ retire khi rủi ro không còn cần quản lý trong register hiện hành. Không xóa hồ sơ; lịch sử đánh giá, Action và acceptance vẫn được giữ.</p><div className="risk-actions"><button className="button secondary" disabled={busy} onClick={()=>{const reason=window.prompt("Lý do retire rủi ro:");if(reason?.trim())command("RETIRE",{comment:reason.trim()})}}>Retire rủi ro</button>{status==="RISK_ACCEPTED"?<button className="button primary" disabled={busy} onClick={()=>command("REQUIRE_TREATMENT")}>Mở lại xử lý</button>:null}</div></div>:null}
    </div>
  </section>;
}
