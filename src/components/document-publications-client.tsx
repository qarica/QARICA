"use client";

import { useState } from "react";
import {
  DISSEMINATION_TYPE_LABEL,
  DISSEMINATION_TYPES,
  DOCUMENT_TYPE_LABEL,
  DOCUMENT_TYPES,
  STAGE_LABEL,
  type DisseminationType,
  type DocumentPublicationStage,
  type DocumentPublicationType,
} from "@/lib/document-publication-types";

type Department = { id: string; name: string };
type Acknowledgment = { document_publication_id: string; user_id: string };
type Staff = { id: string; name: string };
type DocumentPublication = {
  id: string;
  title: string;
  document_type: DocumentPublicationType;
  drafting_department_id: string | null;
  requested_by_name: string | null;
  reason: string | null;
  version_label: string;
  stage: DocumentPublicationStage;
  stage_due_date: string | null;
  current_owner_label: string | null;
  document_code: string | null;
  effective_date: string | null;
  review_date: string | null;
  dissemination_type: DisseminationType | null;
  created_at: string;
};

function hcmToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}
function formatDate(value: string | null) {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function DocumentPublicationsClient({
  departments,
  initialDocuments,
  acknowledgments,
  staffRoster,
  currentUserId,
  canManage,
}: {
  departments: Department[];
  initialDocuments: DocumentPublication[];
  acknowledgments: Acknowledgment[];
  staffRoster: Staff[];
  currentUserId: string;
  canManage: boolean;
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [acks, setAcks] = useState(acknowledgments);
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState<DocumentPublicationType>(DOCUMENT_TYPES[0]);
  const [draftingDepartmentId, setDraftingDepartmentId] = useState(departments[0]?.id || "");
  const [requestedByName, setRequestedByName] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [documentCode, setDocumentCode] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [disseminationType, setDisseminationType] = useState<DisseminationType>(DISSEMINATION_TYPES[0]);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const [unconfirmedOpenId, setUnconfirmedOpenId] = useState<string | null>(null);

  const today = hcmToday();
  const departmentName = (id: string | null) => departments.find((d) => d.id === id)?.name || "—";
  const inProgress = documents.filter((d) => d.stage !== "PUBLISHED").sort((a, b) => (a.stage_due_date || "9999").localeCompare(b.stage_due_date || "9999"));
  const published = documents.filter((d) => d.stage === "PUBLISHED").sort((a, b) => (b.effective_date || "").localeCompare(a.effective_date || ""));
  const ackCount = (documentId: string) => acks.filter((a) => a.document_publication_id === documentId).length;
  const hasAcked = (documentId: string) => acks.some((a) => a.document_publication_id === documentId && a.user_id === currentUserId);
  // Trước đây chỉ hiện "N đã xác nhận" — không biết AI còn chưa đọc để nhắc.
  // Chưa xác nhận = toàn bộ nhân sự đang hoạt động - những ai đã có trong acks.
  const unconfirmedStaff = (documentId: string) => {
    const ackedIds = new Set(acks.filter((a) => a.document_publication_id === documentId).map((a) => a.user_id));
    return staffRoster.filter((s) => !ackedIds.has(s.id));
  };

  async function acknowledge(doc: DocumentPublication) {
    setAcknowledging(doc.id);
    setError("");
    const res = await fetch(`/api/document-publications/${doc.id}/acknowledge`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setAcknowledging(null);
    if (!res.ok) {
      setError(body.error || "Không xác nhận được.");
      return;
    }
    setAcks((v) => [...v, { document_publication_id: doc.id, user_id: currentUserId }]);
  }

  async function submit() {
    if (!title.trim()) {
      setError("Chưa nhập tên văn bản.");
      return;
    }
    if (!draftingDepartmentId) {
      setError("Chưa chọn đơn vị soạn thảo.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/document-publications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        document_type: documentType,
        drafting_department_id: draftingDepartmentId,
        requested_by_name: requestedByName.trim() || null,
        reason: reason.trim() || null,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error || "Không gửi được đề nghị.");
      return;
    }
    setDocuments((v) => [body.document as DocumentPublication, ...v]);
    setTitle("");
    setRequestedByName("");
    setReason("");
  }

  async function advance(doc: DocumentPublication, extra: Record<string, unknown> = {}) {
    setError("");
    const res = await fetch(`/api/document-publications/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ADVANCE", ...extra }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Không chuyển được bước.");
      return;
    }
    setDocuments((v) => v.map((d) => (d.id === doc.id ? { ...d, ...body.document } : d)));
    setPublishingId(null);
    setDocumentCode("");
    setEffectiveDate("");
    setDisseminationType(DISSEMINATION_TYPES[0]);
  }

  async function removeDocument(doc: DocumentPublication) {
    if (!window.confirm(`Xoá đề nghị "${doc.title}"? Không thể hoàn tác.`)) return;
    setError("");
    const res = await fetch(`/api/document-publications/${doc.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Không xoá được.");
      return;
    }
    setDocuments((v) => v.filter((d) => d.id !== doc.id));
  }

  function startPublish(doc: DocumentPublication) {
    setPublishingId(doc.id);
    setDocumentCode("");
    setEffectiveDate(today);
    setDisseminationType(DISSEMINATION_TYPES[0]);
  }

  return (
    <div className="document-publications-overview">
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Đề nghị văn bản mới</h2>
            <p>Đơn vị sử dụng gửi đề nghị soạn thảo/sửa đổi văn bản — không cần quyền quản lý để gửi đề nghị.</p>
          </div>
        </div>
        <div className="dp-form">
          <input className="input" placeholder="Tên văn bản..." value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />
          <div className="dp-form-row">
            <select className="input" value={documentType} onChange={(e) => setDocumentType(e.target.value as DocumentPublicationType)}>
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {DOCUMENT_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            <select className="input" value={draftingDepartmentId} onChange={(e) => setDraftingDepartmentId(e.target.value)} disabled={!departments.length}>
              {departments.length ? null : <option value="">— Chưa có khoa/phòng nào —</option>}
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <input className="input" placeholder="Người đề nghị (tùy chọn)" value={requestedByName} onChange={(e) => setRequestedByName(e.target.value)} />
          <textarea className="input" rows={2} placeholder="Lý do đề nghị (tùy chọn)..." value={reason} onChange={(e) => setReason(e.target.value)} />
          {error ? <div className="alert error">{error}</div> : null}
          <button className="button primary" disabled={busy || !title.trim() || !draftingDepartmentId} onClick={() => void submit()}>
            Gửi đề nghị
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>Đang xử lý</h2>
        </div>
        <div className="work-list">
          {inProgress.map((d) => {
            const overdue = !!d.stage_due_date && d.stage_due_date < today;
            return (
              <div className="work-row" key={d.id}>
                <div className="work-main">
                  <strong>{d.title}</strong>
                  <small>
                    {DOCUMENT_TYPE_LABEL[d.document_type]} · {departmentName(d.drafting_department_id)} · {d.version_label}
                    <br />
                    Bước: {STAGE_LABEL[d.stage]} · Đang xử lý: {d.current_owner_label || "—"} · Hạn:{" "}
                    <span className={overdue ? "text-danger" : ""}>{formatDate(d.stage_due_date)}</span>
                  </small>
                  {publishingId === d.id ? (
                    <div className="dp-publish-form">
                      <input className="input" placeholder="Mã văn bản..." value={documentCode} onChange={(e) => setDocumentCode(e.target.value)} />
                      <input className="input" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
                      <select className="input dp-publish-dissemination" value={disseminationType} onChange={(e) => setDisseminationType(e.target.value as DisseminationType)}>
                        {DISSEMINATION_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {DISSEMINATION_TYPE_LABEL[t]}
                          </option>
                        ))}
                      </select>
                      <div className="dp-publish-actions">
                        <button
                          className="button primary small"
                          disabled={!documentCode.trim() || !effectiveDate}
                          onClick={() => void advance(d, { document_code: documentCode.trim(), effective_date: effectiveDate, dissemination_type: disseminationType })}
                        >
                          Xác nhận phát hành
                        </button>
                        <button className="button tertiary small" onClick={() => setPublishingId(null)}>
                          Hủy
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                {canManage && publishingId !== d.id ? (
                  <div className="dp-actions">
                    {d.stage === "APPROVING" ? (
                      <button className="button primary small" onClick={() => startPublish(d)}>
                        Phát hành
                      </button>
                    ) : (
                      <button className="button secondary small" onClick={() => void advance(d)}>
                        Chuyển bước: {STAGE_LABEL[d.stage]} → tiếp theo
                      </button>
                    )}
                    {d.stage === "REQUESTED" ? (
                      <button className="button tertiary small" onClick={() => void removeDocument(d)}>
                        Xoá
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          {!inProgress.length ? <div className="empty-state compact">Không có văn bản nào đang xử lý.</div> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>Đã phát hành</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mã văn bản</th>
                <th>Tên văn bản</th>
                <th>Loại</th>
                <th>Ngày hiệu lực</th>
                <th>Ngày xem xét lại</th>
                <th>Phổ biến</th>
              </tr>
            </thead>
            <tbody>
              {published.map((d) => (
                <tr key={d.id}>
                  <td>{d.document_code || "—"}</td>
                  <td>{d.title}</td>
                  <td>{DOCUMENT_TYPE_LABEL[d.document_type]}</td>
                  <td>{formatDate(d.effective_date)}</td>
                  <td>{formatDate(d.review_date)}</td>
                  <td>
                    {d.dissemination_type === "TRAINING_REQUIRED" ? (
                      <a href="/procedure-trainings" className="dp-dissemination-link">
                        Cần đào tạo — xem tiến độ →
                      </a>
                    ) : d.dissemination_type === "SELF_READ" ? (
                      <div className="dp-ack">
                        <span className="status-badge success">{ackCount(d.id)} đã xác nhận</span>
                        {canManage ? (
                          <button type="button" className="button tertiary small" onClick={() => setUnconfirmedOpenId(unconfirmedOpenId === d.id ? null : d.id)}>
                            {unconfirmedStaff(d.id).length} chưa xác nhận {unconfirmedOpenId === d.id ? "▾" : "▸"}
                          </button>
                        ) : null}
                        {hasAcked(d.id) ? (
                          <span className="dp-ack-done">✓ Bạn đã xác nhận</span>
                        ) : (
                          <button type="button" className="button secondary small" disabled={acknowledging === d.id} onClick={() => void acknowledge(d)}>
                            {acknowledging === d.id ? "..." : "Tôi đã đọc và hiểu"}
                          </button>
                        )}
                        {unconfirmedOpenId === d.id ? (
                          <div className="dp-unconfirmed-list">
                            {unconfirmedStaff(d.id).length ? (
                              unconfirmedStaff(d.id).slice(0, 30).map((s) => <span key={s.id} className="chip">{s.name}</span>)
                            ) : (
                              <small>Mọi người đã xác nhận.</small>
                            )}
                            {unconfirmedStaff(d.id).length > 30 ? <small>+{unconfirmedStaff(d.id).length - 30} người khác</small> : null}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {!published.length ? (
                <tr>
                  <td colSpan={6} className="empty-state">
                    Chưa có văn bản nào được phát hành.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <style jsx>{`
        .document-publications-overview {
          display: grid;
          gap: 16px;
        }
        .dp-form {
          display: grid;
          gap: 8px;
          padding: 0 12px 12px;
        }
        .dp-form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .dp-publish-form {
          display: grid;
          grid-template-columns: 1fr 160px 180px;
          gap: 6px;
          margin-top: 6px;
        }
        .dp-publish-actions {
          grid-column: 1 / -1;
          display: flex;
          gap: 8px;
        }
        .dp-actions {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          flex-wrap: wrap;
        }
        .dp-unconfirmed-list {
          flex-basis: 100%;
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 4px;
        }
        .dp-ack {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .dp-ack-done {
          font-size: 12px;
          color: var(--muted);
        }
        .dp-dissemination-link {
          font-size: 13px;
          font-weight: 600;
        }
        @media (max-width: 760px) {
          .dp-form-row,
          .dp-publish-form {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
