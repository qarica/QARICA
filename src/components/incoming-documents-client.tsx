"use client";

import { Fragment, useMemo, useState } from "react";
import {
  AssignmentTargetSelect,
  AssignmentTargetsMultiSelect,
  assignmentTargetToken,
  parseAssignmentTargetToken,
  type AssignmentTargetOption,
} from "@/components/assignment-target-select";

type Department = { id: string; name: string };
type Profile = { user_id: string; full_name: string | null; email: string | null; primary_department_id: string | null };
type Task = {
  id: string;
  incoming_document_id: string;
  title: string;
  description: string | null;
  lead_user_id: string;
  collaborating_user_ids: string[];
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
};
type Doc = {
  id: string;
  received_at: string;
  received_no: string | null;
  document_date: string | null;
  document_no: string | null;
  issuing_authority: string;
  summary: string;
  document_type: string | null;
  director_note: string | null;
  director_note_by: string | null;
  director_note_at: string | null;
  department_id: string | null;
  deployed_at: string | null;
  due_date: string | null;
  completed_at: string | null;
  completion_note: string | null;
  progress_feedback: string | null;
  file_path: string | null;
  file_name: string | null;
};

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}
function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(new Date(`${value}T00:00:00`));
}
function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}
function statusOf(doc: Doc, now: string): { label: string; tone: string } {
  if (doc.completed_at) {
    if (doc.due_date && doc.completed_at > doc.due_date) return { label: "Hoàn thành trễ hạn", tone: "warning" };
    return { label: "Hoàn thành đúng hạn", tone: "success" };
  }
  if (doc.due_date && doc.due_date < now) return { label: "Trễ hạn", tone: "danger" };
  return { label: "Đang xử lý", tone: "info" };
}

const emptyTaskForm = { title: "", description: "", leadUserId: "", collaboratorIds: [] as string[], dueDate: "" };

export function IncomingDocumentsClient({
  departments,
  initialDocuments,
  profiles,
  initialTasks,
  canManage,
}: {
  departments: Department[];
  initialDocuments: Doc[];
  profiles: Profile[];
  initialTasks: Task[];
  canManage: boolean;
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [showIntake, setShowIntake] = useState(false);
  const [view, setView] = useState<"intake" | "assign" | "tracking">("tracking");
  const [query, setQuery] = useState("");
  const [receivedAt, setReceivedAt] = useState(today());
  const [issuingAuthority, setIssuingAuthority] = useState("");
  const [summary, setSummary] = useState("");
  const [documentNo, setDocumentNo] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Doc>>({});

  // Tải lên PDF/DOCX để AI tự đọc & điền sẵn form — người dùng luôn kiểm
  // tra/sửa trước khi bấm "Tiếp nhận"; file được giữ lại để đính kèm vào
  // công văn ngay sau khi tạo thành công.
  const [extractFile, setExtractFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractWarnings, setExtractWarnings] = useState<string[]>([]);

  // "Tạo công việc từ văn bản" — 1 chủ trì + nhiều phối hợp, mở theo từng dòng công văn.
  const [tasks, setTasks] = useState(initialTasks);
  const [expandedTaskDocId, setExpandedTaskDocId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskError, setTaskError] = useState("");

  const departmentName = (id: string | null) => departments.find((d) => d.id === id)?.name || "—";
  const profileName = (id: string) => { const p = profiles.find((x) => x.user_id === id); return p?.full_name || p?.email || id; };
  const assignmentOptions = useMemo<AssignmentTargetOption[]>(() => {
    const deptNameById = new Map(departments.map((d) => [d.id, d.name]));
    return profiles.map((p) => ({ id: p.user_id, kind: "USER" as const, label: p.full_name || p.email || p.user_id, description: p.primary_department_id ? deptNameById.get(p.primary_department_id) || "—" : null }));
  }, [profiles, departments]);
  const now = today();
  const overdueCount = documents.filter((d) => !d.completed_at && !!d.due_date && d.due_date < now).length;
  const activeCount = documents.filter((d) => !d.completed_at).length;
  const filteredDocuments = documents.filter((d) => {
    if (view === "assign" && (!!d.department_id || !!d.completed_at)) return false;
    if (view === "tracking" && !!d.completed_at) return false;
    const needle = query.trim().toLocaleLowerCase("vi");
    return !needle || [d.summary, d.issuing_authority, d.document_no, d.received_no, departmentName(d.department_id)].some((v) => String(v ?? "").toLocaleLowerCase("vi").includes(needle));
  });

  async function extractFromFile() {
    if (!extractFile) return;
    setExtracting(true);
    setError("");
    setExtractWarnings([]);
    try {
      const formData = new FormData();
      formData.append("file", extractFile);
      const res = await fetch("/api/incoming-documents/extract", { method: "POST", body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Không đọc được file.");
      const fields = body.fields || {};
      if (fields.summary) setSummary(fields.summary);
      if (fields.issuing_authority) setIssuingAuthority(fields.issuing_authority);
      if (fields.document_no) setDocumentNo(fields.document_no);
      if (fields.document_type) setDocumentType(fields.document_type);
      if (fields.due_date) setDueDate(fields.due_date);
      setExtractWarnings(Array.isArray(body.warnings) ? body.warnings : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không đọc được file.");
    } finally {
      setExtracting(false);
    }
  }

  async function submit() {
    if (!issuingAuthority.trim() || !summary.trim()) {
      setError("Chưa nhập đủ cơ quan ban hành và trích yếu nội dung.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/incoming-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        received_at: receivedAt,
        issuing_authority: issuingAuthority.trim(),
        summary: summary.trim(),
        document_no: documentNo.trim() || null,
        document_type: documentType.trim() || null,
        due_date: dueDate || null,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setError(body.error || "Không lưu được.");
      return;
    }
    const created = body.document as Doc;
    if (extractFile) {
      const formData = new FormData();
      formData.append("file", extractFile);
      const fileRes = await fetch(`/api/incoming-documents/${created.id}/file`, { method: "POST", body: formData });
      const fileBody = await fileRes.json().catch(() => ({}));
      if (fileRes.ok) created.file_name = fileBody.file_name || extractFile.name;
    }
    setBusy(false);
    setDocuments((v) => [created, ...v]);
    setIssuingAuthority("");
    setSummary("");
    setDocumentNo("");
    setDocumentType("");
    setDueDate("");
    setExtractFile(null);
    setExtractWarnings([]);
  }

  async function viewFile(doc: Doc) {
    setError("");
    const res = await fetch(`/api/incoming-documents/${doc.id}/file`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Không mở được file.");
      return;
    }
    window.open(body.url, "_blank", "noopener,noreferrer");
  }

  function toggleTaskPanel(docId: string) {
    setExpandedTaskDocId((current) => (current === docId ? null : docId));
    setTaskForm(emptyTaskForm);
    setTaskError("");
  }

  async function createTask(doc: Doc) {
    if (!taskForm.title.trim() || !taskForm.leadUserId) {
      setTaskError("Cần nhập nội dung công việc và chọn người chủ trì.");
      return;
    }
    setTaskBusy(true);
    setTaskError("");
    try {
      const res = await fetch(`/api/incoming-documents/${doc.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskForm.title.trim(),
          description: taskForm.description.trim() || null,
          lead_user_id: taskForm.leadUserId,
          collaborating_user_ids: taskForm.collaboratorIds,
          due_date: taskForm.dueDate || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Không tạo được công việc.");
      setTasks((v) => [body.task as Task, ...v]);
      setTaskForm(emptyTaskForm);
    } catch (err) {
      setTaskError(err instanceof Error ? err.message : "Không tạo được công việc.");
    } finally {
      setTaskBusy(false);
    }
  }

  async function toggleTaskDone(task: Task) {
    setTaskError("");
    const res = await fetch(`/api/incoming-documents/${task.incoming_document_id}/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed_at: task.completed_at ? null : today() }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setTaskError(body.error || "Không cập nhật được.");
      return;
    }
    setTasks((v) => v.map((t) => (t.id === task.id ? (body.task as Task) : t)));
  }

  async function removeTask(task: Task) {
    if (!window.confirm("Xoá công việc này?")) return;
    setTaskError("");
    const res = await fetch(`/api/incoming-documents/${task.incoming_document_id}/tasks/${task.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setTaskError(body.error || "Không xoá được.");
      return;
    }
    setTasks((v) => v.filter((t) => t.id !== task.id));
  }

  function startEdit(doc: Doc) {
    setEditingId(doc.id);
    setEditDraft({
      director_note: doc.director_note || "",
      department_id: doc.department_id || "",
      deployed_at: doc.deployed_at || "",
      due_date: doc.due_date || "",
      completed_at: doc.completed_at || "",
      completion_note: doc.completion_note || "",
      progress_feedback: doc.progress_feedback || "",
    });
  }

  async function saveEdit(doc: Doc) {
    setError("");
    const res = await fetch(`/api/incoming-documents/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editDraft),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Không cập nhật được.");
      return;
    }
    setDocuments((v) => v.map((d) => (d.id === doc.id ? { ...d, ...body.document } : d)));
    setEditingId(null);
  }

  async function removeDocument(doc: Doc) {
    if (!window.confirm(`Xoá công văn "${doc.summary}"? Không thể hoàn tác.`)) return;
    setError("");
    const res = await fetch(`/api/incoming-documents/${doc.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Không xoá được.");
      return;
    }
    setDocuments((v) => v.filter((d) => d.id !== doc.id));
  }

  return (
    <div className="incoming-doc-overview mobile-module-redesign">
      <div className="doc-overview-kpis" aria-label="Tổng quan công văn"><div><small>Tổng công văn</small><strong>{documents.length}</strong></div><div><small>Đang xử lý</small><strong>{activeCount}</strong></div><div><small>Quá hạn</small><strong>{overdueCount}</strong></div></div>
      {canManage ? (
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Tiếp nhận công văn mới</h2>
              <p>Ghi nhận công văn đến từ SYT, cơ quan khác, thư tay hoặc email.</p>
            </div>
          </div>
          <button type="button" className="button secondary doc-intake-toggle" aria-expanded={showIntake} onClick={() => setShowIntake((v) => !v)}>{showIntake ? "Thu gọn biểu mẫu" : "+ Tiếp nhận công văn"}</button>
          <div className={showIntake ? "doc-form mobile-collapsible-form is-open" : "doc-form mobile-collapsible-form"}>
            <div className="doc-ai-upload">
              <input
                className="input"
                type="file"
                accept=".pdf,.docx"
                onChange={(e) => { setExtractFile(e.target.files?.[0] || null); setExtractWarnings([]); }}
              />
              <button type="button" className="button secondary" disabled={!extractFile || extracting} onClick={() => void extractFromFile()}>
                {extracting ? "Đang đọc..." : "Đọc và điền thông tin"}
              </button>
            </div>
            <p className="subline">Tải lên PDF/DOCX (tối đa 10 MB) để AI tự điền các ô bên dưới — bạn vẫn cần kiểm tra/sửa trước khi tiếp nhận.</p>
            {extractWarnings.length ? (
              <div className="alert warning">
                {extractWarnings.map((w, i) => <div key={i}>{w}</div>)}
              </div>
            ) : null}
            <input className="input" placeholder="Trích yếu nội dung..." value={summary} onChange={(e) => setSummary(e.target.value)} />
            <div className="doc-form-row">
              <input className="input" type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
              <input className="input" placeholder="Cơ quan ban hành..." value={issuingAuthority} onChange={(e) => setIssuingAuthority(e.target.value)} />
              <input className="input" placeholder="Số văn bản (tùy chọn)" value={documentNo} onChange={(e) => setDocumentNo(e.target.value)} />
              <input className="input" placeholder="Loại công văn (tùy chọn)" value={documentType} onChange={(e) => setDocumentType(e.target.value)} />
              <input className="input" type="date" title="Hạn xử lý (tùy chọn)" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            {error ? <div className="alert error">{error}</div> : null}
            <button className="button primary" disabled={busy || !issuingAuthority.trim() || !summary.trim()} onClick={() => void submit()}>
              Tiếp nhận
            </button>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-title">
          <h2>Danh sách công văn</h2>
        </div>
        <div className="doc-view-tabs" role="group" aria-label="Bộ lọc công văn">{([["intake","Tiếp nhận"],["assign","Phân công"],["tracking","Theo dõi xử lý"]] as const).map(([key,label]) => <button key={key} type="button" className={view === key ? "active" : ""} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}</div>
        <input className="input doc-search" aria-label="Tìm công văn" placeholder="Tìm trích yếu, số văn bản, cơ quan..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ngày đến</th>
                <th>Trích yếu</th>
                <th>Cơ quan</th>
                <th>Bút phê GĐ</th>
                <th>Đơn vị triển khai</th>
                <th>Hạn xử lý</th>
                <th>Trạng thái</th>
                <th>Công việc</th>
                {canManage ? <th>Thao tác</th> : null}
              </tr>
            </thead>
            <tbody>
              {filteredDocuments.map((doc) => {
                const status = statusOf(doc, now);
                const editing = editingId === doc.id;
                const docTasks = tasks.filter((t) => t.incoming_document_id === doc.id);
                const taskPanelOpen = expandedTaskDocId === doc.id;
                return (
                  <Fragment key={doc.id}>
                  <tr>
                    <td data-label="Ngày đến">{formatDate(doc.received_at)}</td>
                    <td data-label="Trích yếu">
                      {doc.summary}
                      {doc.file_name ? (
                        <div><button type="button" className="doc-file-link" onClick={() => void viewFile(doc)}>📎 {doc.file_name}</button></div>
                      ) : null}
                    </td>
                    <td data-label="Cơ quan">{doc.issuing_authority}</td>
                    <td data-label="Bút phê GĐ">
                      {editing ? (
                        <input
                          className="input"
                          placeholder="Bút phê..."
                          value={String(editDraft.director_note ?? "")}
                          onChange={(e) => setEditDraft((v) => ({ ...v, director_note: e.target.value }))}
                        />
                      ) : (
                        <>
                          {doc.director_note || "—"}
                          {doc.director_note && doc.director_note_by ? (
                            <div><small className="muted">Bởi {doc.director_note_by} · {formatDateTime(doc.director_note_at)}</small></div>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td data-label="Đơn vị triển khai">
                      {editing ? (
                        <select
                          className="input"
                          value={String(editDraft.department_id ?? "")}
                          onChange={(e) => setEditDraft((v) => ({ ...v, department_id: e.target.value }))}
                        >
                          <option value="">— Chưa chọn —</option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        departmentName(doc.department_id)
                      )}
                    </td>
                    <td data-label="Hạn xử lý">
                      {editing ? (
                        <input
                          className="input"
                          type="date"
                          value={String(editDraft.due_date ?? "")}
                          onChange={(e) => setEditDraft((v) => ({ ...v, due_date: e.target.value }))}
                        />
                      ) : (
                        formatDate(doc.due_date)
                      )}
                    </td>
                    <td data-label="Trạng thái">
                      <span className={`status-badge ${status.tone}`}>{status.label}</span>
                    </td>
                    <td data-label="Công việc">
                      <button type="button" className="button tertiary small" onClick={() => toggleTaskPanel(doc.id)}>
                        {docTasks.length ? `${docTasks.filter((t) => t.completed_at).length}/${docTasks.length} xong` : "Chưa có"} {taskPanelOpen ? "▴" : "▾"}
                      </button>
                    </td>
                    {canManage ? (
                      <td data-label="Thao tác">
                        {editing ? (
                          <div className="doc-edit-actions">
                            <input
                              className="input"
                              type="date"
                              placeholder="Ngày hoàn thành"
                              value={String(editDraft.completed_at ?? "")}
                              onChange={(e) => setEditDraft((v) => ({ ...v, completed_at: e.target.value }))}
                            />
                            <button className="button primary small" onClick={() => void saveEdit(doc)}>
                              Lưu
                            </button>
                            <button className="button tertiary small" onClick={() => setEditingId(null)}>
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <div className="doc-edit-actions">
                            <button className="button secondary small" onClick={() => startEdit(doc)}>
                              Cập nhật
                            </button>
                            <button className="button tertiary small" onClick={() => void removeDocument(doc)}>
                              Xoá
                            </button>
                          </div>
                        )}
                      </td>
                    ) : null}
                  </tr>
                  {taskPanelOpen ? (
                    <tr>
                      <td colSpan={canManage ? 9 : 8} className="doc-task-panel-cell">
                        <div className="doc-task-panel">
                          {taskError ? <div className="alert error">{taskError}</div> : null}
                          {docTasks.length ? (
                            <ul className="doc-task-list">
                              {docTasks.map((task) => (
                                <li key={task.id} className={task.completed_at ? "is-done" : ""}>
                                  <div>
                                    <strong>{task.title}</strong>
                                    <div className="subline">
                                      Chủ trì: {profileName(task.lead_user_id)}
                                      {task.collaborating_user_ids.length ? ` · Phối hợp: ${task.collaborating_user_ids.map(profileName).join(", ")}` : ""}
                                      {task.due_date ? ` · Hạn: ${formatDate(task.due_date)}` : ""}
                                    </div>
                                    {task.description ? <div className="subline">{task.description}</div> : null}
                                  </div>
                                  {canManage ? (
                                    <div className="doc-edit-actions">
                                      <button type="button" className="button secondary small" onClick={() => void toggleTaskDone(task)}>
                                        {task.completed_at ? "Mở lại" : "Hoàn thành"}
                                      </button>
                                      <button type="button" className="button tertiary small" onClick={() => void removeTask(task)}>Xoá</button>
                                    </div>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="subline">Công văn này chưa có công việc nào được giao.</p>
                          )}
                          {canManage ? (
                            <div className="doc-task-form">
                              <input className="input" placeholder="Nội dung công việc..." value={taskForm.title} onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))} />
                              <label className="doc-task-field">
                                <span>Chủ trì *</span>
                                <AssignmentTargetSelect
                                  options={assignmentOptions}
                                  value={taskForm.leadUserId ? assignmentTargetToken("USER", taskForm.leadUserId) : ""}
                                  onChange={(token) => { const t = parseAssignmentTargetToken(token); setTaskForm((f) => ({ ...f, leadUserId: t?.id || "" })); }}
                                  placeholder="Chọn người chủ trì..."
                                />
                              </label>
                              <label className="doc-task-field">
                                <span>Phối hợp (không bắt buộc)</span>
                                <AssignmentTargetsMultiSelect
                                  options={assignmentOptions.filter((o) => o.id !== taskForm.leadUserId)}
                                  value={taskForm.collaboratorIds.map((id) => assignmentTargetToken("USER", id))}
                                  onChange={(tokens) => setTaskForm((f) => ({ ...f, collaboratorIds: tokens.map((t) => parseAssignmentTargetToken(t)?.id).filter((id): id is string => !!id) }))}
                                  placeholder="Thêm người phối hợp..."
                                />
                              </label>
                              <input className="input" type="date" title="Hạn hoàn thành" value={taskForm.dueDate} onChange={(e) => setTaskForm((f) => ({ ...f, dueDate: e.target.value }))} />
                              <textarea className="input" placeholder="Mô tả thêm (không bắt buộc)" value={taskForm.description} onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))} />
                              <button type="button" className="button primary small" disabled={taskBusy || !taskForm.title.trim() || !taskForm.leadUserId} onClick={() => void createTask(doc)}>
                                {taskBusy ? "Đang giao..." : "Giao công việc"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                );
              })}
              {!filteredDocuments.length ? (
                <tr>
                  <td colSpan={canManage ? 9 : 8} className="empty-state compact">
                    Chưa có công văn nào.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <style jsx>{`
        .incoming-doc-overview {
          display: grid;
          gap: 16px;
        }
        .doc-form {
          display: grid;
          gap: 8px;
          padding: 0 12px 12px;
        }
        .doc-form-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 8px;
        }
        .doc-edit-actions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          align-items: center;
        }
        .doc-ai-upload {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }
        .doc-ai-upload .input {
          flex: 1 1 220px;
        }
        .doc-file-link {
          border: 0;
          background: transparent;
          color: var(--brand, #1E3A8A);
          font-weight: 700;
          font-size: 11px;
          padding: 0;
          cursor: pointer;
        }
        .doc-task-panel-cell {
          background: #f8fafb;
          padding: 0 !important;
        }
        .doc-task-panel {
          display: grid;
          gap: 12px;
          padding: 14px;
          min-width:0;
        }
        .doc-task-list {
          display: grid;
          gap: 8px;
          list-style: none;
          margin: 0;
          padding: 0;
          min-width:0;
        }
        .doc-task-list > li {
          min-width:0;
        }
        .doc-task-list li {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          align-items: flex-start;
          padding: 9px 10px;
          border: 1px solid var(--line, #e5eaf2);
          border-radius: 10px;
          background: #fff;
        }
        .doc-task-list li.is-done {
          opacity: 0.6;
        }
        .doc-task-form {
          display: grid;
          gap: 8px;
        }
        .doc-task-field {
          display: grid;
          gap: 4px;
          font-size: 11px;
          font-weight: 700;
          color: #46545a;
        }
        @media (max-width: 900px) {
          .doc-form-row {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>
    </div>
  );
}
