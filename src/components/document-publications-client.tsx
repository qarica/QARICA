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
  file_name: string | null;
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
  const [mobileFormOpen, setMobileFormOpen] = useState(false);
  const [documents, setDocuments] = useState(initialDocuments);
  const [listQuery, setListQuery] = useState("");
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

  // Thư viện văn bản: nhóm "Đã phát hành" theo khoa/phòng soạn thảo thành
  // các thư mục đóng/mở, mỗi văn bản có thể đính kèm 1 file lưu trữ.
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [fileBusyId, setFileBusyId] = useState<string | null>(null);

  // Nhập trực tiếp văn bản ĐÃ PHÁT HÀNH từ trước (QT/quy định/thông báo đã có
  // sẵn ngoài thực tế) — bỏ qua toàn bộ vòng Đề nghị -> ... -> Phê duyệt, vì
  // bắt khai lại từ đầu rồi bấm "Chuyển bước" 5 lần cho một văn bản đã xong là
  // vô nghĩa. Dùng state riêng (tiền tố direct*) để không đụng vào state của
  // luồng "Phát hành" tại chỗ (documentCode/effectiveDate/disseminationType ở
  // trên) đang gắn với 1 dòng cụ thể trong danh sách "Đang xử lý".
  const [directPublishOpen, setDirectPublishOpen] = useState(false);
  const [directTitle, setDirectTitle] = useState("");
  const [directDocumentType, setDirectDocumentType] = useState<DocumentPublicationType>(DOCUMENT_TYPES[0]);
  const [directDraftingDepartmentId, setDirectDraftingDepartmentId] = useState(departments[0]?.id || "");
  const [directDocumentCode, setDirectDocumentCode] = useState("");
  const [directEffectiveDate, setDirectEffectiveDate] = useState("");
  const [directDisseminationType, setDirectDisseminationType] = useState<DisseminationType>(DISSEMINATION_TYPES[0]);
  const [directBusy, setDirectBusy] = useState(false);
  const [directError, setDirectError] = useState("");

  const today = hcmToday();
  const departmentName = (id: string | null) => departments.find((d) => d.id === id)?.name || "—";
  const inProgress = documents.filter((d) => d.stage !== "PUBLISHED").sort((a, b) => (a.stage_due_date || "9999").localeCompare(b.stage_due_date || "9999"));
  const published = documents.filter((d) => d.stage === "PUBLISHED").sort((a, b) => (b.effective_date || "").localeCompare(a.effective_date || ""));
  // Thư viện văn bản: thư mục theo khoa/phòng soạn thảo, giữ thứ tự xuất
  // hiện đầu tiên (khoa có văn bản phát hành gần nhất lên trước).
  const publishedGroups: { key: string; name: string; docs: DocumentPublication[] }[] = [];
  for (const d of published) {
    const key = d.drafting_department_id || "none";
    const group = publishedGroups.find((g) => g.key === key);
    if (group) group.docs.push(d);
    else publishedGroups.push({ key, name: departmentName(d.drafting_department_id), docs: [d] });
  }
  // Thống kê toàn viện: tổng số văn bản (mọi bước, không chỉ Đã phát hành)
  // theo khoa/phòng soạn thảo và theo loại văn bản — liệt kê đủ mọi khoa/
  // phòng đang hoạt động (kể cả khoa chưa có văn bản nào) để thấy rõ khoa
  // nào chưa tham gia, không chỉ khoa đã có dữ liệu.
  const statsByDepartment = departments
    .map((d) => ({ key: d.id, name: d.name, count: documents.filter((doc) => doc.drafting_department_id === d.id).length }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi"));
  const statsByType = DOCUMENT_TYPES.map((t) => ({ key: t, name: DOCUMENT_TYPE_LABEL[t], count: documents.filter((doc) => doc.document_type === t).length }));

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

  async function submitDirectPublish() {
    if (!directTitle.trim()) {
      setDirectError("Chưa nhập tên văn bản.");
      return;
    }
    if (!directDraftingDepartmentId) {
      setDirectError("Chưa chọn đơn vị soạn thảo.");
      return;
    }
    if (!directDocumentCode.trim()) {
      setDirectError("Chưa nhập mã văn bản.");
      return;
    }
    if (!directEffectiveDate) {
      setDirectError("Chưa nhập ngày hiệu lực.");
      return;
    }
    setDirectBusy(true);
    setDirectError("");
    const res = await fetch("/api/document-publications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        direct_publish: true,
        title: directTitle.trim(),
        document_type: directDocumentType,
        drafting_department_id: directDraftingDepartmentId,
        document_code: directDocumentCode.trim(),
        effective_date: directEffectiveDate,
        dissemination_type: directDisseminationType,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setDirectBusy(false);
    if (!res.ok) {
      setDirectError(body.error || "Không lưu được văn bản.");
      return;
    }
    setDocuments((v) => [body.document as DocumentPublication, ...v]);
    setDirectTitle("");
    setDirectDocumentCode("");
    setDirectEffectiveDate("");
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

  function toggleFolder(key: string) {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function viewFile(doc: DocumentPublication) {
    setFileBusyId(doc.id);
    setError("");
    const res = await fetch(`/api/document-publications/${doc.id}/file`);
    const body = await res.json().catch(() => ({}));
    setFileBusyId(null);
    if (!res.ok) {
      setError(body.error || "Không mở được file.");
      return;
    }
    window.open(body.url, "_blank", "noopener,noreferrer");
  }

  async function uploadFile(doc: DocumentPublication, file: File) {
    setFileBusyId(doc.id);
    setError("");
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/document-publications/${doc.id}/file`, { method: "POST", body: formData });
    const body = await res.json().catch(() => ({}));
    setFileBusyId(null);
    if (!res.ok) {
      setError(body.error || "Không tải lên được file.");
      return;
    }
    setDocuments((v) => v.map((d) => (d.id === doc.id ? { ...d, file_name: body.file_name as string } : d)));
  }

  async function removeFile(doc: DocumentPublication) {
    if (!window.confirm(`Xoá file đính kèm của "${doc.title}"?`)) return;
    setFileBusyId(doc.id);
    setError("");
    const res = await fetch(`/api/document-publications/${doc.id}/file`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setFileBusyId(null);
    if (!res.ok) {
      setError(body.error || "Không xoá được file.");
      return;
    }
    setDocuments((v) => v.map((d) => (d.id === doc.id ? { ...d, file_name: null } : d)));
  }

  return (
    <div className="document-publications-overview mobile-module-redesign">
      <div className="mobile-workflow-kpis"><div><small>Tổng văn bản</small><strong>{documents.length}</strong></div><div><small>Đang xử lý</small><strong>{inProgress.length}</strong></div><div><small>Đã ban hành</small><strong>{published.length}</strong></div></div>

      <section className="panel">
        <div className="panel-title">
          <h2>Thống kê toàn viện</h2>
        </div>
        <div className="dp-stats-grid">
          <div>
            <h3>Theo khoa/phòng soạn thảo</h3>
            <ul className="dp-stats-list">
              {statsByDepartment.map((row) => (
                <li key={row.key}>
                  <span>{row.name}</span>
                  <strong>{row.count}</strong>
                </li>
              ))}
              {!statsByDepartment.length ? <li className="dp-stats-empty">Chưa có khoa/phòng nào.</li> : null}
            </ul>
          </div>
          <div>
            <h3>Theo loại văn bản</h3>
            <ul className="dp-stats-list">
              {statsByType.map((row) => (
                <li key={row.key}>
                  <span>{row.name}</span>
                  <strong>{row.count}</strong>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Đề nghị văn bản mới</h2>
            <p>Đơn vị sử dụng gửi đề nghị soạn thảo/sửa đổi văn bản — không cần quyền quản lý để gửi đề nghị.</p>
          </div>
        </div>
        <button type="button" className="button secondary mobile-form-toggle" aria-expanded={mobileFormOpen} onClick={() => setMobileFormOpen((v) => !v)}>{mobileFormOpen ? "Thu gọn" : "+ Gửi đề nghị văn bản"}</button>
        <div className={mobileFormOpen ? "dp-form mobile-collapsible-form is-open" : "dp-form mobile-collapsible-form"}>
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

      {canManage ? (
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Nhập văn bản đã phát hành</h2>
              <p>Dành cho QT/quy định/thông báo đã ban hành từ trước (ngoài thực tế) — lưu thẳng vào &ldquo;Đã phát hành&rdquo;, không cần đi qua các bước kiểm soát.</p>
            </div>
          </div>
          <button type="button" className="button secondary mobile-form-toggle" aria-expanded={directPublishOpen} onClick={() => setDirectPublishOpen((v) => !v)}>{directPublishOpen ? "Thu gọn" : "+ Nhập văn bản đã có"}</button>
          <div className={directPublishOpen ? "dp-form mobile-collapsible-form is-open" : "dp-form mobile-collapsible-form"}>
            <input className="input" placeholder="Tên văn bản..." value={directTitle} maxLength={300} onChange={(e) => setDirectTitle(e.target.value)} />
            <div className="dp-form-row">
              <select className="input" value={directDocumentType} onChange={(e) => setDirectDocumentType(e.target.value as DocumentPublicationType)}>
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {DOCUMENT_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              <select className="input" value={directDraftingDepartmentId} onChange={(e) => setDirectDraftingDepartmentId(e.target.value)} disabled={!departments.length}>
                {departments.length ? null : <option value="">— Chưa có khoa/phòng nào —</option>}
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="dp-form-row">
              <input className="input" placeholder="Mã văn bản..." value={directDocumentCode} onChange={(e) => setDirectDocumentCode(e.target.value)} />
              <input className="input" type="date" value={directEffectiveDate} onChange={(e) => setDirectEffectiveDate(e.target.value)} />
            </div>
            <select className="input" value={directDisseminationType} onChange={(e) => setDirectDisseminationType(e.target.value as DisseminationType)}>
              {DISSEMINATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {DISSEMINATION_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            {directError ? <div className="alert error">{directError}</div> : null}
            <button className="button primary" disabled={directBusy || !directTitle.trim() || !directDraftingDepartmentId || !directDocumentCode.trim() || !directEffectiveDate} onClick={() => void submitDirectPublish()}>
              Lưu văn bản đã phát hành
            </button>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-title">
          <h2>Đang xử lý</h2>
        </div>
        <div className="mobile-workflow-filters"><input className="input" aria-label="Tìm văn bản" placeholder="Tìm tên văn bản đang xử lý..." value={listQuery} onChange={(e) => setListQuery(e.target.value)} /></div>
        <div className="work-list">
          {inProgress.filter((d) => !listQuery.trim() || d.title.toLocaleLowerCase("vi").includes(listQuery.trim().toLocaleLowerCase("vi"))).map((d) => {
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
          <div>
            <h2>Thư viện văn bản</h2>
            <p>Văn bản đã phát hành, chia theo thư mục khoa/phòng soạn thảo — bấm vào thư mục để xem, có thể đính kèm file lưu trữ cho từng văn bản.</p>
          </div>
        </div>
        {publishedGroups.map((group) => (
          <div className="dp-folder" key={group.key}>
            <button type="button" className="dp-folder-head" onClick={() => toggleFolder(group.key)}>
              <span>{openFolders.has(group.key) ? "📂" : "📁"} {group.name}</span>
              <span className="dp-folder-count">{group.docs.length} văn bản {openFolders.has(group.key) ? "▾" : "▸"}</span>
            </button>
            {openFolders.has(group.key) ? (
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
                      <th>Tệp đính kèm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.docs.map((d) => (
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
                        <td>
                          {d.file_name ? (
                            <div className="dp-file-cell">
                              <button type="button" className="button tertiary small" disabled={fileBusyId === d.id} onClick={() => void viewFile(d)}>
                                {fileBusyId === d.id ? "..." : `📄 ${d.file_name}`}
                              </button>
                              {canManage ? (
                                <button type="button" className="button tertiary small" disabled={fileBusyId === d.id} onClick={() => void removeFile(d)}>
                                  Xoá file
                                </button>
                              ) : null}
                            </div>
                          ) : canManage ? (
                            <label className="dp-file-input button secondary small">
                              {fileBusyId === d.id ? "..." : "+ Đính kèm"}
                              <input
                                type="file"
                                disabled={fileBusyId === d.id}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = "";
                                  if (file) void uploadFile(d, file);
                                }}
                              />
                            </label>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ))}
        {!published.length ? <div className="empty-state compact">Chưa có văn bản nào được phát hành.</div> : null}
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
        .dp-stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          padding: 0 12px 12px;
        }
        .dp-stats-grid h3 {
          font-size: 13px;
          font-weight: 600;
          color: var(--muted);
          margin: 0 0 6px;
        }
        .dp-stats-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 2px;
        }
        .dp-stats-list li {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 4px 0;
          border-bottom: 1px solid var(--border);
          font-size: 13px;
        }
        .dp-stats-list li:last-child {
          border-bottom: none;
        }
        .dp-stats-empty {
          color: var(--muted);
          font-size: 13px;
        }
        .dp-folder {
          border-top: 1px solid var(--border);
        }
        .dp-folder:first-of-type {
          border-top: none;
        }
        .dp-folder-head {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          background: none;
          border: none;
          padding: 10px 12px;
          font-weight: 600;
          cursor: pointer;
          color: inherit;
        }
        .dp-folder-count {
          font-size: 12px;
          font-weight: 500;
          color: var(--muted);
        }
        .dp-file-cell {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .dp-file-input {
          position: relative;
          overflow: hidden;
          display: inline-flex;
          align-items: center;
        }
        .dp-file-input input[type="file"] {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          min-height: 0;
          opacity: 0;
          cursor: pointer;
        }
        @media (max-width: 760px) {
          .dp-form-row,
          .dp-publish-form,
          .dp-stats-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
