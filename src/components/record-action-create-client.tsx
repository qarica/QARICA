"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Department = { id: string; name: string; short_name?: string | null };
type Profile = { user_id: string; full_name?: string | null; email?: string | null; primary_department_id?: string | null };
type FailureMode = { id: string; label: string; high?: boolean };

export function RecordActionCreateClient({ recordId, recordType, sourceTitle, departments, profiles, failureModes = [] }: { recordId: string; recordType: string; sourceTitle: string; departments: Department[]; profiles: Profile[]; failureModes?: FailureMode[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [departmentId, setDepartmentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const visibleProfiles = useMemo(() => profiles.filter((p) => !departmentId || !p.primary_department_id || p.primary_department_id === departmentId), [profiles, departmentId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const raw = Object.fromEntries(new FormData(form).entries()); setBusy(true); setError("");
    try { const response = await fetch(`/api/records/${recordId}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(raw) }); const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || "Không tạo được công việc."); form.reset(); setDepartmentId(""); setOpen(false); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Không tạo được công việc."); } finally { setBusy(false); }
  }

  return <>
    <button className="button" type="button" onClick={() => { setOpen(true); setError(""); }}>+ Giao công việc</button>
    {open ? <div className="modal-backdrop" role="presentation"><div className="modal-card" role="dialog" aria-modal="true" aria-label="Giao công việc từ hồ sơ">
      <div className="modal-head"><div><strong>Giao công việc</strong><div className="subline">Nguồn: {sourceTitle}</div></div><button className="icon-button" type="button" onClick={() => setOpen(false)}>×</button></div>
      <form onSubmit={submit}><div className="modal-body form-stack">
        {error ? <div className="alert error">{error}</div> : null}
        {recordType === "FMEA" ? <label>Failure mode cần xử lý<select name="failure_mode_id" required><option value="">Chọn failure mode</option>{failureModes.map((m) => <option key={m.id} value={m.id}>{m.high ? "[Ưu tiên cao] " : ""}{m.label}</option>)}</select></label> : null}
        <label>Nội dung công việc<input name="title" required placeholder="Việc cần thực hiện" /></label>
        <div className="form-grid two">
          <label>Khoa/Phòng phụ trách<select name="lead_department_id" required value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}><option value="">Chọn khoa/phòng</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.short_name || d.name}</option>)}</select></label>
          <label>Người phụ trách<select name="assignee_user_id" required><option value="">Chọn người phụ trách</option>{visibleProfiles.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email || "Người dùng"}</option>)}</select></label>
          <label>Ngày bắt đầu<input name="start_date" type="date" /></label><label>Hạn hoàn thành<input name="due_date" type="date" required /></label>
          <label>Mức ưu tiên<select name="priority" defaultValue="NORMAL"><option value="LOW">Thấp</option><option value="NORMAL">Bình thường</option><option value="HIGH">Cao</option><option value="URGENT">Khẩn</option><option value="CRITICAL">Rất khẩn / trọng yếu</option></select></label>
          {recordType === "CAPA" ? <label>Loại hành động CAPA<select name="capa_action_type" defaultValue="CORRECTIVE"><option value="CORRECTION">Khắc phục tức thời</option><option value="CORRECTIVE">Khắc phục nguyên nhân</option><option value="PREVENTIVE">Phòng ngừa tái diễn</option><option value="VERIFICATION">Xác minh</option></select></label> : null}
          {recordType === "RISK" ? <label>Biện pháp xử lý rủi ro<select name="risk_treatment_type" defaultValue="REDUCE"><option value="AVOID">Tránh</option><option value="REDUCE">Giảm thiểu</option><option value="TRANSFER">Chuyển giao</option><option value="ACCEPT">Chấp nhận</option><option value="CONTINGENCY">Dự phòng</option></select></label> : null}
        </div>
        <label>Kết quả mong đợi<textarea name="expected_result" required placeholder="Sản phẩm/kết quả phải có khi hoàn thành" /></label>
        <label>Yêu cầu minh chứng / xác minh<textarea name="verification_requirement" placeholder="File, biên bản, ảnh, số liệu hoặc cách kiểm tra kết quả" /></label>
        <label>Hướng dẫn thực hiện<textarea name="description" placeholder="Mô tả thêm nếu cần" /></label>
      </div><div className="modal-footer"><button className="button secondary" type="button" onClick={() => setOpen(false)}>Hủy</button><button className="button" disabled={busy} type="submit">{busy ? "Đang tạo…" : "Tạo & giao việc"}</button></div></form>
    </div></div> : null}
  </>;
}
