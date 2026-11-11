"use client";

import Link from "next/link";
import { useState } from "react";

type Training = {
  id: string;
  procedure_code: string | null;
  procedure_name: string;
  drafting_unit: string | null;
  effective_date: string | null;
  status: "TRAINED" | "PLANNED" | "NOT_PLANNED";
  attendee_total: number;
  attendee_attended: number;
  document_publication_id: string | null;
  source_document: { id: string; title: string; document_code: string | null } | null;
};

// Báo cáo thực tế: "giao diện xấu và ko đẹp, cứng đờ ko kéo được" — bảng
// trước đây nhồi cả thông tin quản lý đào tạo (người đào tạo/thời gian/địa
// điểm/phản hồi QLCL/ghi chú) LẪN sửa-tại-chỗ trong các ô bé xíu, 12 cột.
// Bảng danh sách giờ chỉ còn thông tin tổng quan để lướt nhanh + liên kết
// sang trang chi tiết riêng (/procedure-trainings/[id]) — nơi sửa thông tin
// đào tạo, quản lý nhiều đợt kiểm tra ("kỳ thi nào"), tra điểm + đúng/sai
// từng câu của từng người, và phân tích theo đối tượng/trước-sau.
type SelfReadDocument = { id: string; title: string; document_code: string | null; version_label: string; effective_date: string | null };
type Acknowledgment = { document_publication_id: string; user_id: string };
type Staff = { id: string; name: string };

const STATUS_LABEL: Record<string, string> = {
  TRAINED: "Đã đào tạo",
  PLANNED: "Chưa đào tạo — đã có kế hoạch",
  NOT_PLANNED: "Chưa đào tạo — chưa có kế hoạch",
};
const STATUS_TONE: Record<string, string> = { TRAINED: "success", PLANNED: "warning", NOT_PLANNED: "danger" };

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(new Date(`${value}T00:00:00`));
}

export function ProcedureTrainingsClient({
  initialTrainings,
  canManage,
  selfReadDocuments,
  acknowledgments,
  staffRoster,
  currentUserId,
  canManageDocuments,
}: {
  initialTrainings: Training[];
  canManage: boolean;
  selfReadDocuments: SelfReadDocument[];
  acknowledgments: Acknowledgment[];
  staffRoster: Staff[];
  currentUserId: string;
  canManageDocuments: boolean;
}) {
  const [view, setView] = useState<"training" | "self_read">("training");
  const [mobileFormOpen, setMobileFormOpen] = useState(false);
  const [trainings, setTrainings] = useState(initialTrainings);
  const [listQuery, setListQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [acks, setAcks] = useState(acknowledgments);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const [unconfirmedOpenId, setUnconfirmedOpenId] = useState<string | null>(null);
  const [procedureCode, setProcedureCode] = useState("");
  const [procedureName, setProcedureName] = useState("");
  const [draftingUnit, setDraftingUnit] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!procedureName.trim()) {
      setError("Chưa nhập tên quy trình.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/procedure-trainings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        procedure_code: procedureCode.trim() || null,
        procedure_name: procedureName.trim(),
        drafting_unit: draftingUnit.trim() || null,
        effective_date: effectiveDate || null,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error || "Không lưu được.");
      return;
    }
    setTrainings((v) => [body.training as Training, ...v]);
    setProcedureCode("");
    setProcedureName("");
    setDraftingUnit("");
    setEffectiveDate("");
  }

  const ackCount = (documentId: string) => acks.filter((a) => a.document_publication_id === documentId).length;
  const hasAcked = (documentId: string) => acks.some((a) => a.document_publication_id === documentId && a.user_id === currentUserId);
  // Chưa xác nhận = toàn bộ nhân sự đang hoạt động - những ai đã có trong acks.
  const unconfirmedStaff = (documentId: string) => {
    const ackedIds = new Set(acks.filter((a) => a.document_publication_id === documentId).map((a) => a.user_id));
    return staffRoster.filter((s) => !ackedIds.has(s.id));
  };

  async function acknowledge(doc: SelfReadDocument) {
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

  return (
    <div className="pt-overview mobile-module-redesign">
      <div className="mobile-workflow-kpis"><div><small>Tổng quy trình</small><strong>{trainings.length}</strong></div><div><small>Đã đào tạo</small><strong>{trainings.filter((t) => t.status === "TRAINED").length}</strong></div><div><small>Chưa có kế hoạch</small><strong>{trainings.filter((t) => t.status === "NOT_PLANNED").length}</strong></div></div>
      {/* Báo cáo thực tế: "Phần theo dõi quy trình đào tạo chưa thấy kết nối
          với kiểm soát tài liệu... nên làm menu theo dõi gồm cả 2 nội dung
          [Tự đọc hiểu + Cần đào tạo] để control" — 1 menu theo dõi, 2 tab,
          thay vì 2 trang/menu tách rời như trước. */}
      <div className="pt-view-tabs" role="group" aria-label="Hình thức phổ biến">
        <button type="button" className={view === "training" ? "active" : ""} aria-pressed={view === "training"} onClick={() => setView("training")}>
          Cần đào tạo
        </button>
        <button type="button" className={view === "self_read" ? "active" : ""} aria-pressed={view === "self_read"} onClick={() => setView("self_read")}>
          Tự đọc hiểu
        </button>
      </div>
      {view === "training" ? (
      <>
      {canManage ? (
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Khai báo quy trình mới cần đào tạo</h2>
              <p>Mỗi quy trình/biểu mẫu mới ban hành là 1 dòng theo dõi đào tạo.</p>
            </div>
          </div>
          <button type="button" className="button secondary mobile-form-toggle" aria-expanded={mobileFormOpen} onClick={() => setMobileFormOpen((v) => !v)}>{mobileFormOpen ? "Thu gọn" : "+ Tạo hồ sơ đào tạo"}</button>
        <div className={mobileFormOpen ? "pt-form mobile-collapsible-form is-open" : "pt-form mobile-collapsible-form"}>
            <input className="input" placeholder="Tên quy trình..." value={procedureName} onChange={(e) => setProcedureName(e.target.value)} />
            <div className="pt-form-row">
              <input className="input" placeholder="Mã số (tùy chọn)" value={procedureCode} onChange={(e) => setProcedureCode(e.target.value)} />
              <input className="input" placeholder="Đơn vị soạn thảo (tùy chọn)" value={draftingUnit} onChange={(e) => setDraftingUnit(e.target.value)} />
              <input className="input" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
            {error ? <div className="alert error">{error}</div> : null}
            <button className="button primary" disabled={busy || !procedureName.trim()} onClick={() => void submit()}>
              Khai báo
            </button>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-title">
          <h2>Danh sách quy trình</h2>
        </div>
        <div className="mobile-workflow-filters"><input className="input" aria-label="Tìm quy trình" placeholder="Tìm tên, mã số, đơn vị soạn thảo..." value={listQuery} onChange={(e) => setListQuery(e.target.value)} /><select className="input" aria-label="Lọc trạng thái đào tạo" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="ALL">Tất cả trạng thái</option><option value="NOT_PLANNED">Chưa có kế hoạch</option><option value="PLANNED">Đã có kế hoạch</option><option value="TRAINED">Đã đào tạo</option></select></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mã số</th>
                <th>Tên quy trình</th>
                <th>Đơn vị soạn thảo</th>
                <th>Hiệu lực</th>
                <th>Trạng thái</th>
                <th>Tỷ lệ hoàn thành</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {trainings.filter((t) => (statusFilter === "ALL" || t.status === statusFilter) && (!listQuery.trim() || [t.procedure_name, t.procedure_code, t.drafting_unit].some((v) => String(v ?? "").toLocaleLowerCase("vi").includes(listQuery.trim().toLocaleLowerCase("vi"))))).map((t) => (
                <tr key={t.id}>
                  <td>{t.procedure_code || "—"}</td>
                  <td>
                    {t.procedure_name}
                    {t.source_document ? (
                      <div><small>Từ văn bản {t.source_document.document_code || ""}{t.source_document.document_code ? " — " : ""}{t.source_document.title} · <Link className="table-link" href="/document-publications">Xem →</Link></small></div>
                    ) : null}
                  </td>
                  <td>{t.drafting_unit || "—"}</td>
                  <td>{formatDate(t.effective_date)}</td>
                  <td>
                    <span className={`status-badge ${STATUS_TONE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                  </td>
                  <td>
                    {t.attendee_attended}/{t.attendee_total} ({t.attendee_total ? Math.round((t.attendee_attended / t.attendee_total) * 100) : 0}%)
                  </td>
                  <td>
                    <Link className="button secondary small" href={`/procedure-trainings/${t.id}`}>
                      Xem chi tiết →
                    </Link>
                  </td>
                </tr>
              ))}
              {!trainings.length ? (
                <tr>
                  <td colSpan={7} className="empty-state compact">
                    Chưa có quy trình nào.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      </>
      ) : (
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Tự đọc hiểu</h2>
              <p>Từng nhân viên tự bấm xác nhận đã đọc & hiểu — theo dõi ai còn chưa xác nhận để nhắc.</p>
            </div>
          </div>
          {error ? <div className="alert error">{error}</div> : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mã văn bản</th>
                  <th>Tên văn bản</th>
                  <th>Phiên bản</th>
                  <th>Ngày hiệu lực</th>
                  <th>Xác nhận</th>
                </tr>
              </thead>
              <tbody>
                {selfReadDocuments.map((d) => (
                  <tr key={d.id}>
                    <td>{d.document_code || "—"}</td>
                    <td>
                      {d.title} <Link className="table-link" href="/document-publications">Xem →</Link>
                    </td>
                    <td>{d.version_label}</td>
                    <td>{formatDate(d.effective_date)}</td>
                    <td>
                      <div className="pt-ack">
                        <span className="status-badge success">{ackCount(d.id)} đã xác nhận</span>
                        {canManageDocuments ? (
                          <button type="button" className="button tertiary small" onClick={() => setUnconfirmedOpenId(unconfirmedOpenId === d.id ? null : d.id)}>
                            {unconfirmedStaff(d.id).length} chưa xác nhận {unconfirmedOpenId === d.id ? "▾" : "▸"}
                          </button>
                        ) : null}
                        {hasAcked(d.id) ? (
                          <span className="pt-ack-done">✓ Bạn đã xác nhận</span>
                        ) : (
                          <button type="button" className="button secondary small" disabled={acknowledging === d.id} onClick={() => void acknowledge(d)}>
                            {acknowledging === d.id ? "..." : "Tôi đã đọc và hiểu"}
                          </button>
                        )}
                        {unconfirmedOpenId === d.id ? (
                          <div className="pt-unconfirmed-list">
                            {unconfirmedStaff(d.id).length ? (
                              unconfirmedStaff(d.id)
                                .slice(0, 30)
                                .map((s) => (
                                  <span key={s.id} className="chip">
                                    {s.name}
                                  </span>
                                ))
                            ) : (
                              <small>Mọi người đã xác nhận.</small>
                            )}
                            {unconfirmedStaff(d.id).length > 30 ? <small>+{unconfirmedStaff(d.id).length - 30} người khác</small> : null}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!selfReadDocuments.length ? (
                  <tr>
                    <td colSpan={5} className="empty-state compact">
                      Chưa có văn bản nào chọn hình thức Tự đọc hiểu.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <style jsx>{`
        .pt-overview {
          display: grid;
          gap: 16px;
        }
        .pt-form {
          display: grid;
          gap: 8px;
          padding: 0 12px 12px;
        }
        .pt-form-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
        }
        .pt-view-tabs {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
        }
        .pt-view-tabs button {
          border: 1px solid var(--line);
          border-radius: 999px;
          background: #fff;
          padding: 9px 13px;
          white-space: nowrap;
          color: var(--muted);
          font-weight: 700;
          font-size: 12px;
          cursor: pointer;
        }
        .pt-view-tabs button.active {
          background: var(--brand);
          color: #fff;
          border-color: var(--brand);
        }
        .pt-ack {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .pt-ack-done {
          font-size: 12px;
          color: var(--muted);
        }
        .pt-unconfirmed-list {
          flex-basis: 100%;
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 4px;
        }
        @media (max-width: 900px) {
          .pt-form-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
