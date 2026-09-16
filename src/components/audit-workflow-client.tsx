"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; label: string };
type Scope = { id: string; department: string; process: string; area: string; description: string };
type Session = { id: string; start: string; end: string; department: string; location: string; status: string };
type RawScope = { id: string; department_id: string | null; process_name: string | null; area_name: string | null; scope_description: string | null };
type RawSession = { id: string; scheduled_start: string; scheduled_end: string | null; department_id: string | null; location: string | null; session_status: string };

const EMPTY_SCOPE = { department_id: "", process_name: "", area_name: "", scope_description: "" };
const EMPTY_SESSION = { department_id: "", scheduled_start: "", scheduled_end: "", location: "" };

function hcmDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return `${map.get("year")}-${map.get("month")}-${map.get("day")}T${map.get("hour")}:${map.get("minute")}`;
}

export function AuditWorkflowClient({ recordId, status, canManage, scopes, sessions, findings, openFindings, evidence, departments, scopeRows, sessionRows }: { recordId: string; status: string; canManage: boolean; scopes: number; sessions: number; findings: number; openFindings: number; evidence: number; departments: Option[]; scopeRows: Scope[]; sessionRows: Session[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [scope, setScope] = useState(EMPTY_SCOPE);
  const [session, setSession] = useState(EMPTY_SESSION);
  const [editingScopeId, setEditingScopeId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);

  async function call(url: string, action: string, payload: Record<string, unknown> = {}) {
    if (busy) return false;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Không xử lý được Audit.");
      setNotice(json.message || "Đã cập nhật Audit.");
      router.refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không xử lý được Audit.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const run = (action: string, payload: Record<string, unknown> = {}) => call(`/api/audits/${recordId}/workflow`, action, payload);
  const setup = (action: string, payload: Record<string, unknown>) => call(`/api/audits/${recordId}/setup`, action, payload);

  async function loadRawSetup() {
    setError("");
    try {
      const response = await fetch(`/api/audits/${recordId}/setup-data`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Không tải được dữ liệu thiết lập Audit.");
      return json as { scopes: RawScope[]; sessions: RawSession[] };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không tải được dữ liệu thiết lập Audit.");
      return null;
    }
  }

  async function editScope(id: string) {
    const data = await loadRawSetup(); if (!data) return;
    const row = data.scopes.find((item) => item.id === id); if (!row) { setError("Không tìm thấy phạm vi cần sửa."); return; }
    setEditingScopeId(id);
    setScope({ department_id: row.department_id || "", process_name: row.process_name || "", area_name: row.area_name || "", scope_description: row.scope_description || "" });
  }

  async function saveScope() {
    const action = editingScopeId ? "UPDATE_SCOPE" : "ADD_SCOPE";
    const ok = await setup(action, editingScopeId ? { ...scope, scope_id: editingScopeId } : scope);
    if (ok) { setEditingScopeId(null); setScope(EMPTY_SCOPE); }
  }

  async function deleteScope(id: string) {
    const reason = window.prompt("Lý do xóa phạm vi Audit nhập nhầm:");
    if (!reason?.trim()) return;
    const ok = await setup("DELETE_SCOPE", { scope_id: id, reason: reason.trim() });
    if (ok && editingScopeId === id) { setEditingScopeId(null); setScope(EMPTY_SCOPE); }
  }

  async function editSession(id: string) {
    const data = await loadRawSetup(); if (!data) return;
    const row = data.sessions.find((item) => item.id === id); if (!row) { setError("Không tìm thấy phiên Audit cần sửa."); return; }
    if (String(row.session_status || "PLANNED").toUpperCase() !== "PLANNED") { setError("Chỉ phiên còn PLANNED mới được sửa."); return; }
    setEditingSessionId(id);
    setSession({ department_id: row.department_id || "", scheduled_start: hcmDateTimeLocal(row.scheduled_start), scheduled_end: hcmDateTimeLocal(row.scheduled_end), location: row.location || "" });
  }

  async function saveSession() {
    const action = editingSessionId ? "UPDATE_SESSION" : "ADD_SESSION";
    const ok = await setup(action, editingSessionId ? { ...session, session_id: editingSessionId } : session);
    if (ok) { setEditingSessionId(null); setSession(EMPTY_SESSION); }
  }

  async function deleteSession(id: string) {
    const reason = window.prompt("Lý do xóa phiên Audit PLANNED nhập nhầm:");
    if (!reason?.trim()) return;
    const ok = await setup("DELETE_SESSION", { session_id: id, reason: reason.trim() });
    if (ok && editingSessionId === id) { setEditingSessionId(null); setSession(EMPTY_SESSION); }
  }

  return <section className="panel audit-workflow-panel">
    <style>{`.audit-setup-actions{display:flex;gap:6px;flex-wrap:wrap}.audit-edit-note{padding:9px 10px;border:1px solid #dbe5e8;border-radius:10px;background:#f8fafc;color:#64748b;font-size:11px}.audit-form-actions{display:flex;gap:8px;flex-wrap:wrap}.audit-workflow-panel table td:last-child{white-space:nowrap}`}</style>
    <div className="panel-title"><div><h2>Audit/Tracer Workflow</h2><p>Phạm vi → thực hiện → báo cáo → Finding → recheck → đóng.</p></div><strong>{status}</strong></div>
    <div style={{ padding: "0 18px 18px", display: "grid", gap: 14 }}>
      {error ? <div className="alert error">{error}</div> : null}{notice ? <div className="alert success">{notice}</div> : null}
      <div className="domain-metrics"><div><strong>{scopes}</strong><span>Phạm vi</span></div><div><strong>{sessions}</strong><span>Phiên Audit</span></div><div><strong>{findings}/{openFindings}</strong><span>Finding/chưa đóng</span></div><div><strong>{evidence}</strong><span>Bằng chứng</span></div></div>

      {status === "DRAFT" && canManage ? <div className="page-stack"><h3>{editingScopeId ? "Sửa phạm vi Audit" : "Thêm phạm vi Audit"}</h3>{editingScopeId ? <div className="audit-edit-note">Đang chỉnh phạm vi đã có. Lịch sử thay đổi sẽ được lưu trong audit trail.</div> : null}<div className="detail-grid"><label><span>Khoa/phòng</span><select value={scope.department_id} onChange={(e) => setScope({ ...scope, department_id: e.target.value })}><option value="">Chọn...</option>{departments.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label><label><span>Quy trình</span><input value={scope.process_name} onChange={(e) => setScope({ ...scope, process_name: e.target.value })} /></label><label><span>Khu vực</span><input value={scope.area_name} onChange={(e) => setScope({ ...scope, area_name: e.target.value })} /></label><label className="wide"><span>Mô tả phạm vi</span><textarea rows={2} value={scope.scope_description} onChange={(e) => setScope({ ...scope, scope_description: e.target.value })} /></label></div><div className="audit-form-actions"><button type="button" className="button secondary" disabled={busy || (!scope.department_id && !scope.process_name && !scope.area_name && !scope.scope_description)} onClick={saveScope}>{editingScopeId ? "Lưu sửa phạm vi" : "Thêm phạm vi"}</button>{editingScopeId ? <button type="button" className="button tertiary" disabled={busy} onClick={() => { setEditingScopeId(null); setScope(EMPTY_SCOPE); }}>Hủy sửa</button> : null}</div></div> : null}

      {scopeRows.length ? <div className="table-wrap"><table><thead><tr><th>Khoa/phòng</th><th>Quy trình</th><th>Khu vực</th><th>Phạm vi</th>{status === "DRAFT" && canManage ? <th>Thao tác</th> : null}</tr></thead><tbody>{scopeRows.map((x) => <tr key={x.id}><td>{x.department || "—"}</td><td>{x.process || "—"}</td><td>{x.area || "—"}</td><td>{x.description || "—"}</td>{status === "DRAFT" && canManage ? <td><div className="audit-setup-actions"><button type="button" className="button tertiary small" disabled={busy} onClick={() => editScope(x.id)}>Sửa</button><button type="button" className="button tertiary small" disabled={busy} onClick={() => deleteScope(x.id)}>Xóa</button></div></td> : null}</tr>)}</tbody></table></div> : null}
      {status === "DRAFT" && canManage ? <button className="button primary" disabled={busy || scopes < 1} onClick={() => run("START")}>Bắt đầu Audit</button> : null}

      {status === "IN_PROGRESS" && canManage ? <div className="page-stack"><h3>{editingSessionId ? "Sửa phiên Audit PLANNED" : "Tạo phiên thực hiện Audit"}</h3>{editingSessionId ? <div className="audit-edit-note">Chỉ lịch phiên còn PLANNED được phép sửa. Phiên đã thực hiện sẽ được khóa để giữ lịch sử.</div> : null}<div className="detail-grid"><label><span>Bắt đầu *</span><input type="datetime-local" value={session.scheduled_start} onChange={(e) => setSession({ ...session, scheduled_start: e.target.value })} /></label><label><span>Kết thúc</span><input type="datetime-local" value={session.scheduled_end} onChange={(e) => setSession({ ...session, scheduled_end: e.target.value })} /></label><label><span>Khoa/phòng</span><select value={session.department_id} onChange={(e) => setSession({ ...session, department_id: e.target.value })}><option value="">Chọn...</option>{departments.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label><label><span>Địa điểm</span><input value={session.location} onChange={(e) => setSession({ ...session, location: e.target.value })} /></label></div><div className="audit-form-actions"><button type="button" className="button secondary" disabled={busy || !session.scheduled_start} onClick={saveSession}>{editingSessionId ? "Lưu sửa phiên" : "Tạo phiên Audit"}</button>{editingSessionId ? <button type="button" className="button tertiary" disabled={busy} onClick={() => { setEditingSessionId(null); setSession(EMPTY_SESSION); }}>Hủy sửa</button> : null}</div></div> : null}

      {sessionRows.length ? <div className="table-wrap"><table><thead><tr><th>Bắt đầu</th><th>Kết thúc</th><th>Khoa/phòng</th><th>Địa điểm</th><th>Trạng thái</th>{status === "IN_PROGRESS" && canManage ? <th>Thao tác</th> : null}</tr></thead><tbody>{sessionRows.map((x) => <tr key={x.id}><td>{x.start}</td><td>{x.end || "—"}</td><td>{x.department || "—"}</td><td>{x.location || "—"}</td><td>{x.status}</td>{status === "IN_PROGRESS" && canManage ? <td>{String(x.status || "PLANNED").toUpperCase() === "PLANNED" ? <div className="audit-setup-actions"><button type="button" className="button tertiary small" disabled={busy} onClick={() => editSession(x.id)}>Sửa</button><button type="button" className="button tertiary small" disabled={busy} onClick={() => deleteSession(x.id)}>Xóa</button></div> : <span>Đã khóa</span>}</td> : null}</tr>)}</tbody></table></div> : null}
      {status === "IN_PROGRESS" && canManage ? <button className="button primary" disabled={busy || sessions < 1 || evidence < 1} onClick={() => run("SUBMIT_REPORT")}>Gửi báo cáo rà soát</button> : null}
      {["DRAFT_REPORT", "REPORT_REVIEW"].includes(status) && canManage ? <button className="button primary" disabled={busy} onClick={() => run("START_FOLLOW_UP")}>Chuyển theo dõi Finding</button> : null}
      {status === "FOLLOW_UP" && canManage ? <button className="button primary" disabled={busy || openFindings > 0} onClick={() => { const conclusion = window.prompt("Kết luận đóng Audit/Tracer:"); if (conclusion?.trim()) run("CLOSE", { comment: conclusion.trim() }); }}>Đóng Audit/Tracer</button> : null}
    </div>
  </section>;
}
