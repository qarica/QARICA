"use client";

import { useState } from "react";

type Department = { id: string; name: string };
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
  department_id: string | null;
  deployed_at: string | null;
  due_date: string | null;
  completed_at: string | null;
  completion_note: string | null;
  progress_feedback: string | null;
};

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}
function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(new Date(`${value}T00:00:00`));
}
function statusOf(doc: Doc, now: string): { label: string; tone: string } {
  if (doc.completed_at) {
    if (doc.due_date && doc.completed_at > doc.due_date) return { label: "Hoàn thành trễ hạn", tone: "warning" };
    return { label: "Hoàn thành đúng hạn", tone: "success" };
  }
  if (doc.due_date && doc.due_date < now) return { label: "Trễ hạn", tone: "danger" };
  return { label: "Đang xử lý", tone: "info" };
}

export function IncomingDocumentsClient({
  departments,
  initialDocuments,
  canManage,
}: {
  departments: Department[];
  initialDocuments: Doc[];
  canManage: boolean;
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [receivedAt, setReceivedAt] = useState(today());
  const [issuingAuthority, setIssuingAuthority] = useState("");
  const [summary, setSummary] = useState("");
  const [documentNo, setDocumentNo] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Doc>>({});

  const departmentName = (id: string | null) => departments.find((d) => d.id === id)?.name || "—";
  const now = today();

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
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error || "Không lưu được.");
      return;
    }
    setDocuments((v) => [body.document as Doc, ...v]);
    setIssuingAuthority("");
    setSummary("");
    setDocumentNo("");
    setDocumentType("");
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

  return (
    <div className="incoming-doc-overview">
      {canManage ? (
        <section className="panel">
          <div className="section-head">
            <div>
              <h2>Tiếp nhận công văn mới</h2>
              <p>Ghi nhận công văn đến từ SYT, cơ quan khác, thư tay hoặc email.</p>
            </div>
          </div>
          <div className="doc-form">
            <input className="input" placeholder="Trích yếu nội dung..." value={summary} onChange={(e) => setSummary(e.target.value)} />
            <div className="doc-form-row">
              <input className="input" type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
              <input className="input" placeholder="Cơ quan ban hành..." value={issuingAuthority} onChange={(e) => setIssuingAuthority(e.target.value)} />
              <input className="input" placeholder="Số văn bản (tùy chọn)" value={documentNo} onChange={(e) => setDocumentNo(e.target.value)} />
              <input className="input" placeholder="Loại công văn (tùy chọn)" value={documentType} onChange={(e) => setDocumentType(e.target.value)} />
            </div>
            {error ? <div className="alert error">{error}</div> : null}
            <button className="button primary" disabled={busy || !issuingAuthority.trim() || !summary.trim()} onClick={() => void submit()}>
              Tiếp nhận
            </button>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="section-head">
          <h2>Danh sách công văn</h2>
        </div>
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
                {canManage ? <th>Thao tác</th> : null}
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const status = statusOf(doc, now);
                const editing = editingId === doc.id;
                return (
                  <tr key={doc.id}>
                    <td>{formatDate(doc.received_at)}</td>
                    <td>{doc.summary}</td>
                    <td>{doc.issuing_authority}</td>
                    <td>
                      {editing ? (
                        <input
                          className="input"
                          placeholder="Bút phê..."
                          value={String(editDraft.director_note ?? "")}
                          onChange={(e) => setEditDraft((v) => ({ ...v, director_note: e.target.value }))}
                        />
                      ) : (
                        doc.director_note || "—"
                      )}
                    </td>
                    <td>
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
                    <td>
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
                    <td>
                      <span className={`status-badge ${status.tone}`}>{status.label}</span>
                    </td>
                    {canManage ? (
                      <td>
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
                          <button className="button secondary small" onClick={() => startEdit(doc)}>
                            Cập nhật
                          </button>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {!documents.length ? (
                <tr>
                  <td colSpan={canManage ? 8 : 7} className="empty-state compact">
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
          grid-template-columns: 1fr 1fr 1fr 1fr;
          gap: 8px;
        }
        .doc-edit-actions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          align-items: center;
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
