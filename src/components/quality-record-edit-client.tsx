"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type EditValues = Record<string, string | boolean | null | undefined>;

type Props = {
  recordId: string;
  recordType: "FINDING" | "CAPA" | "RISK";
  workflowStatus: string;
  initialValues: EditValues;
};

export function QualityRecordEditClient({ recordId, recordType, workflowStatus, initialValues }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<EditValues>(initialValues);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const title = useMemo(() => recordType === "FINDING" ? "Chỉnh sửa Finding" : recordType === "CAPA" ? "Chỉnh sửa CAPA nháp" : "Chỉnh sửa Risk Register", [recordType]);
  const set = (key: string, value: string | boolean) => setValues((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/quality-records/${recordId}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, reason: reason.trim() || undefined }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Không lưu được thay đổi.");
      setNotice(json.message || "Đã lưu thay đổi.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được thay đổi.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel qre-panel">
    <style>{`
      .qre-panel{overflow:hidden}.qre-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 18px}.qre-head h3{margin:0;font-size:15px}.qre-head p{margin:5px 0 0;color:#64748b;font-size:11px;line-height:1.45}.qre-status{font-size:10px;font-weight:800;color:#0f766e;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:999px;padding:5px 8px;white-space:nowrap}.qre-body{border-top:1px solid #e2e8f0;padding:16px 18px;display:grid;gap:12px}.qre-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.qre-grid .wide{grid-column:1/-1}.qre-grid label{display:grid;gap:5px;font-size:11px;font-weight:750;color:#334155}.qre-grid input,.qre-grid textarea,.qre-grid select{width:100%}.qre-check{display:flex!important;grid-template-columns:auto 1fr!important;align-items:center;gap:7px!important}.qre-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}.qre-help{font-size:10px;color:#64748b;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:9px 10px}@media(max-width:720px){.qre-grid{grid-template-columns:1fr}.qre-grid .wide{grid-column:auto}}
    `}</style>
    <div className="qre-head"><div><h3>{title}</h3><p>Chỉ sửa dữ liệu nền khi hồ sơ còn ở giai đoạn cho phép. Mỗi lần lưu đều được ghi audit trail.</p></div><span className="qre-status">{workflowStatus}</span></div>
    {notice ? <div className="alert success" style={{margin:"0 18px 14px"}}>{notice}</div> : null}
    {!open ? <div className="qre-body"><div className="qre-help">Nếu nhập sai nội dung nhưng hồ sơ chưa qua gate nghiệp vụ, có thể sửa tại đây thay vì hủy và tạo lại.</div><div className="qre-actions"><button className="button secondary" type="button" onClick={() => { setError(""); setNotice(""); setOpen(true); }}>Sửa nội dung</button></div></div> :
    <form className="qre-body" onSubmit={submit}>
      <div className="qre-grid">
        <label className="wide">Tên hồ sơ *<input value={String(values.title || "")} onChange={e => set("title", e.target.value)} required /></label>
        {recordType === "FINDING" ? <>
          <label>Nguồn / loại phát hiện<input value={String(values.finding_type || "")} onChange={e => set("finding_type", e.target.value)} /></label>
          <label>Mức độ<input value={String(values.severity || "")} onChange={e => set("severity", e.target.value)} /></label>
          <label>Thời điểm phát hiện<input type="datetime-local" value={String(values.identified_at || "")} onChange={e => set("identified_at", e.target.value)} /></label>
          <label>Hạn khắc phục<input type="date" value={String(values.due_date || "")} onChange={e => set("due_date", e.target.value)} /></label>
          <label className="wide">Mô tả phát hiện *<textarea rows={4} value={String(values.description || "")} onChange={e => set("description", e.target.value)} required /></label>
          <label className="wide">Khắc phục tức thời<textarea rows={3} value={String(values.immediate_action || "")} onChange={e => set("immediate_action", e.target.value)} /></label>
        </> : null}
        {recordType === "CAPA" ? <>
          <label>Ưu tiên<select value={String(values.priority || "NORMAL")} onChange={e => set("priority", e.target.value)}><option value="LOW">Thấp</option><option value="NORMAL">Bình thường</option><option value="HIGH">Cao</option><option value="URGENT">Khẩn</option><option value="CRITICAL">Rất khẩn</option></select></label>
          <label>Hạn đánh giá hiệu lực<input type="date" value={String(values.effectiveness_due_date || "")} onChange={e => set("effectiveness_due_date", e.target.value)} /></label>
          <label className="wide qre-check"><input type="checkbox" checked={Boolean(values.approval_required)} onChange={e => set("approval_required", e.target.checked)} /> Yêu cầu phê duyệt trước triển khai</label>
          <label className="wide">Vấn đề cần CAPA *<textarea rows={4} value={String(values.problem_statement || "")} onChange={e => set("problem_statement", e.target.value)} required /></label>
          <label className="wide">Khắc phục tức thời<textarea rows={3} value={String(values.immediate_correction || "")} onChange={e => set("immediate_correction", e.target.value)} /></label>
        </> : null}
        {recordType === "RISK" ? <>
          <label className="wide">Sự kiện rủi ro *<textarea rows={4} value={String(values.risk_event || "")} onChange={e => set("risk_event", e.target.value)} required /></label>
          <label className="wide">Nguyên nhân<textarea rows={3} value={String(values.cause_summary || "")} onChange={e => set("cause_summary", e.target.value)} /></label>
          <label className="wide">Hậu quả tiềm tàng<textarea rows={3} value={String(values.potential_consequence || "")} onChange={e => set("potential_consequence", e.target.value)} /></label>
          <label>Quy trình liên quan<input value={String(values.process_name || "")} onChange={e => set("process_name", e.target.value)} /></label>
          <label>Ngày rà soát tiếp<input type="date" value={String(values.next_review_date || "")} onChange={e => set("next_review_date", e.target.value)} /></label>
          <label>Tần suất rà soát<input value={String(values.review_frequency || "")} onChange={e => set("review_frequency", e.target.value)} /></label>
        </> : null}
        <label className="wide">Lý do chỉnh sửa<textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Khuyến nghị ghi ngắn gọn lý do thay đổi để dễ truy vết." /></label>
      </div>
      {error ? <div className="alert error">{error}</div> : null}
      <div className="qre-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setOpen(false)}>Hủy thao tác</button><button className="button primary" disabled={busy}>{busy ? "Đang lưu..." : "Lưu thay đổi"}</button></div>
    </form>}
  </section>;
}
