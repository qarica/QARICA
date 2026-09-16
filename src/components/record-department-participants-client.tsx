"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { RECORD_DEPARTMENT_ROLE_LABELS, RECORD_DEPARTMENT_ROLES, type RecordDepartmentRole } from "@/lib/record-department-policy";

type Department = { id: string; name: string; short_name?: string | null };
type Participant = {
  id: string;
  department_id: string;
  participant_role: RecordDepartmentRole;
  participation_scope?: string | null;
  department_name: string;
};

export function RecordDepartmentParticipantsClient({
  recordId,
  recordType,
  lifecycleStatus,
  primaryDepartmentName,
  departments,
  participants,
  canManage,
}: {
  recordId: string;
  recordType: string;
  lifecycleStatus: string;
  primaryDepartmentName: string;
  departments: Department[];
  participants: Participant[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const active = lifecycleStatus === "ACTIVE";

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    setBusyKey("add"); setError("");
    try {
      const response = await fetch(`/api/records/${recordId}/departments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Không thêm được đơn vị tham gia.");
      form.reset(); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Không thêm được đơn vị tham gia."); }
    finally { setBusyKey(""); }
  }

  async function remove(row: Participant) {
    if (!window.confirm(`Gỡ ${row.department_name} khỏi hồ sơ này? Dữ liệu lịch sử trong audit vẫn được giữ.`)) return;
    setBusyKey(row.id); setError("");
    try {
      const response = await fetch(`/api/records/${recordId}/departments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department_id: row.department_id, participant_role: row.participant_role }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Không gỡ được đơn vị tham gia.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Không gỡ được đơn vị tham gia."); }
    finally { setBusyKey(""); }
  }

  return <section className="panel rdp-panel">
    <style>{`.rdp-panel{overflow:hidden}.rdp-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:18px 19px 12px}.rdp-head h2{margin:0;font-size:19px}.rdp-head p{margin:5px 0 0;color:#64757b;font-size:13px;line-height:1.5}.rdp-primary{margin:0 18px 12px;padding:11px 13px;border:1px solid #cfe0e4;border-radius:11px;background:#f6fafb;font-size:13px}.rdp-list{display:grid;gap:8px;padding:0 18px 14px}.rdp-row{display:grid;grid-template-columns:minmax(150px,.8fr) minmax(150px,.8fr) minmax(220px,1.5fr) auto;gap:10px;align-items:center;border:1px solid #dfe8ea;border-radius:11px;padding:10px 12px}.rdp-role{font-size:11px;font-weight:800;color:#25636e}.rdp-scope{font-size:12px;color:#52666c;white-space:pre-wrap}.rdp-form{display:grid;grid-template-columns:minmax(180px,1fr) minmax(170px,.75fr) minmax(240px,1.5fr) auto;gap:10px;align-items:end;padding:14px 18px 18px;border-top:1px solid #e7eef0;background:#fbfdfd}.rdp-form label{margin:0}.rdp-warning{margin:0 18px 14px}.rdp-empty{padding:13px;border:1px dashed #cad8db;border-radius:11px;color:#6d7e84;font-size:13px}@media(max-width:900px){.rdp-row,.rdp-form{grid-template-columns:1fr 1fr}.rdp-scope{grid-column:1/-1}}@media(max-width:580px){.rdp-row,.rdp-form{grid-template-columns:1fr}.rdp-scope{grid-column:auto}}`}</style>
    <div className="rdp-head"><div><h2>Đơn vị tham gia hồ sơ</h2><p>Tách rõ đơn vị phụ trách chính với các khoa/phòng liên quan, phối hợp, tham vấn hoặc chỉ nhận thông tin.</p></div></div>
    <div className="rdp-primary"><strong>Đơn vị phụ trách chính:</strong> {primaryDepartmentName || "Chưa gán"}</div>
    {recordType === "INCIDENT" ? <div className="scope-note rdp-warning"><strong>Lưu ý bảo mật:</strong> thêm khoa/phòng liên quan không tự cấp quyền xem chi tiết sự cố. Quyền truy cập vẫn được kiểm soát riêng.</div> : null}
    {error ? <div className="alert error" style={{ margin: "0 18px 12px" }}>{error}</div> : null}
    <div className="rdp-list">{participants.length ? participants.map((row) => <div className="rdp-row" key={row.id}>
      <strong>{row.department_name}</strong>
      <span className="rdp-role">{RECORD_DEPARTMENT_ROLE_LABELS[row.participant_role] || row.participant_role}</span>
      <span className="rdp-scope">{row.participation_scope || "Chưa ghi phạm vi phối hợp."}</span>
      {canManage && active ? <button type="button" className="button tertiary small" disabled={!!busyKey} onClick={() => remove(row)}>{busyKey === row.id ? "Đang gỡ…" : "Gỡ"}</button> : null}
    </div>) : <div className="rdp-empty">Chưa khai báo đơn vị tham gia thứ cấp.</div>}</div>
    {canManage && active ? <form className="rdp-form" onSubmit={add}>
      <label>Khoa/Phòng tham gia<select name="department_id" required defaultValue=""><option value="">Chọn khoa/phòng</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.short_name || department.name}</option>)}</select></label>
      <label>Vai trò<select name="participant_role" required defaultValue="COORDINATING">{RECORD_DEPARTMENT_ROLES.map((role) => <option value={role} key={role}>{RECORD_DEPARTMENT_ROLE_LABELS[role]}</option>)}</select></label>
      <label>Phạm vi phối hợp<input name="participation_scope" maxLength={1000} placeholder="Ví dụ: rà soát quy trình dùng thuốc và phản hồi trước 20/09" /></label>
      <button className="button" type="submit" disabled={!!busyKey}>{busyKey === "add" ? "Đang lưu…" : "Thêm đơn vị"}</button>
    </form> : null}
  </section>;
}
