"use client";

/* eslint-disable @next/next/no-img-element -- Mã QR là data URL tạo client-side (qrcode), không phải ảnh tĩnh/remote để Next tối ưu (cùng quy ước đã dùng ở medical-equipment-detail-client.tsx và procedure-training-detail-client.tsx). */
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Icon } from "@/components/icon";
import { KpiCard } from "@/components/kpi-card";
import { baseClassCode } from "@/lib/procedure-training-class-code";
import { groupRowsByTopic } from "@/lib/procedure-training-topic-rollup";

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
  is_attendance_only?: boolean;
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
type Acknowledgment = { document_publication_id: string; user_id: string | null; department_id: string | null };
type DepartmentStaffCount = { id: string; name: string; staff_count: number | null };
type TopicRollupRow = {
  key: string;
  employeeCode: string | null;
  employeeName: string;
  department: string | null;
  jobTitle: string | null;
  status: "pass" | "fail" | "none";
  passedTraining: { trainingId: string; procedureName: string; effectiveDate: string | null } | null;
  attemptCount: number;
};
type TopicGroup = {
  key: string;
  trainings: { id: string; procedure_name: string; effective_date: string | null }[];
  rollup: TopicRollupRow[];
};

const STATUS_LABEL: Record<string, string> = {
  TRAINED: "Đã đào tạo",
  PLANNED: "Chưa đào tạo — đã có kế hoạch",
  NOT_PLANNED: "Chưa đào tạo — chưa có kế hoạch",
};
const STATUS_TONE: Record<string, string> = { TRAINED: "success", PLANNED: "warning", NOT_PLANNED: "danger" };
// "Các danh sách dài thì thu gọn mặc định, cần thì bấm nút mở rộng" — ngưỡng
// chung cho mọi danh sách dài trong module đào tạo (bảng theo chủ đề, bảng
// xếp hạng, danh sách tuyên dương, danh sách nhân sự).
const LIST_COLLAPSE_LIMIT = 8;

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(new Date(`${value}T00:00:00`));
}

export function ProcedureTrainingsClient({
  mode = "training",
  initialTrainings,
  canManage,
  selfReadDocuments,
  acknowledgments,
  departments,
  canManageDocuments,
  topicGroups,
}: {
  /** "training" = menu Đào tạo (Cần đào tạo + Theo chủ đề); "self_read" = menu Tự đọc hiểu. */
  mode?: "training" | "self_read";
  initialTrainings: Training[];
  canManage: boolean;
  selfReadDocuments: SelfReadDocument[];
  acknowledgments: Acknowledgment[];
  departments: DepartmentStaffCount[];
  canManageDocuments: boolean;
  topicGroups: TopicGroup[];
}) {
  const [view, setView] = useState<"training" | "self_read" | "topic">(mode);
  const [mobileFormOpen, setMobileFormOpen] = useState(false);
  const [trainings, setTrainings] = useState(initialTrainings);
  const [listQuery, setListQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [deptBreakdownOpen, setDeptBreakdownOpen] = useState(false);

  // Báo cáo thực tế: "Lớp tạo nhầm cũng không xóa được" — chưa có cách xoá cả
  // 1 lớp trước đây (chỉ xoá được đợt kiểm tra/nhân sự/đăng ký riêng lẻ).
  // Xoá cascade hết bảng con ở server (xem DELETE /api/procedure-trainings/[id]);
  // cảnh báo rõ số nhân sự đã có nếu lớp không còn trống, tránh xoá nhầm lớp
  // đã có dữ liệu thật.
  async function removeTraining(t: Training) {
    const warning = t.attendee_total > 0 ? `Lớp này đã có ${t.attendee_total} nhân sự! Xoá sẽ mất hết điểm/kết quả, KHÔNG thể hoàn tác.` : "Xoá lớp này, không thể hoàn tác.";
    if (!window.confirm(`${warning}\n\nXoá "${t.procedure_name}"?`)) return;
    setRemovingId(t.id);
    setError("");
    const res = await fetch(`/api/procedure-trainings/${t.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setRemovingId(null);
    if (!res.ok) {
      setError(body.error || "Không xoá được lớp này.");
      return;
    }
    setTrainings((v) => v.filter((x) => x.id !== t.id));
  }
  const acks = acknowledgments;
  const [qrDocId, setQrDocId] = useState<string | null>(null);
  const [procedureCode, setProcedureCode] = useState("");
  const [procedureName, setProcedureName] = useState("");
  const [draftingUnit, setDraftingUnit] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

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

  // Báo cáo thực tế: "Tài liệu tự đọc hiểu không nên xác nhận bên trong
  // QARICA mà chỉ xác nhận bằng QR hoặc link" — đã bỏ hẳn nút "Tôi đã đọc và
  // hiểu" + route xác nhận trong app, CHỈ còn xác nhận qua /xac-nhan-doc-hieu/
  // [id] (ẩn danh, không đăng nhập). acks giờ không có tài khoản QARICA để so
  // khớp từng người -> "chưa xác nhận theo từng người" không còn tính được
  // chính xác; thay bằng tính tuân thủ theo khoa/phòng (departments.staff_count
  // làm mẫu số, cùng quy ước module đào tạo đã dùng cho "còn thiếu người đăng
  // ký" — xem RegistrationTab trong procedure-training-detail-client.tsx).
  const ackCount = (documentId: string) => acks.filter((a) => a.document_publication_id === documentId).length;
  const totalStaffFromDepartments = departments.reduce((sum, d) => sum + (d.staff_count ?? 0), 0);
  const totalDocs = selfReadDocuments.length;
  const docCompliancePct = (documentId: string) => (totalStaffFromDepartments > 0 ? Math.min(100, Math.round((ackCount(documentId) / totalStaffFromDepartments) * 100)) : null);
  const avgCompliancePct = (() => {
    if (!totalDocs || totalStaffFromDepartments <= 0) return null;
    const pcts = selfReadDocuments.map((d) => docCompliancePct(d.id) ?? 0);
    return Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length);
  })();
  const lowComplianceDocCount = totalStaffFromDepartments > 0 ? selfReadDocuments.filter((d) => (docCompliancePct(d.id) ?? 0) < 50).length : 0;
  const deptCompliance = departments
    .filter((d): d is DepartmentStaffCount & { staff_count: number } => d.staff_count != null && d.staff_count > 0)
    .map((d) => {
      const expected = d.staff_count * totalDocs;
      const actual = acks.filter((a) => a.department_id === d.id).length;
      return { department: d, actual, expected, pct: expected > 0 ? Math.min(100, Math.round((actual / expected) * 100)) : null };
    })
    .sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));
  const visibleDeptCompliance = deptBreakdownOpen ? deptCompliance : deptCompliance.slice(0, LIST_COLLAPSE_LIMIT);

  return (
    <div className="pt-overview mobile-module-redesign">
      {mode === "training" ? <div className="mobile-workflow-kpis"><div><small>Tổng quy trình</small><strong>{trainings.length}</strong></div><div><small>Đã đào tạo</small><strong>{trainings.filter((t) => t.status === "TRAINED").length}</strong></div><div><small>Chưa có kế hoạch</small><strong>{trainings.filter((t) => t.status === "NOT_PLANNED").length}</strong></div></div> : null}
      {/* Báo cáo thực tế: "Phần theo dõi quy trình đào tạo chưa thấy kết nối
          với kiểm soát tài liệu... nên làm menu theo dõi gồm cả 2 nội dung
          [Tự đọc hiểu + Cần đào tạo] để control" — 1 menu theo dõi, 2 tab,
          thay vì 2 trang/menu tách rời như trước. */}
      {mode === "training" ? (
        <div className="pt-view-tabs" role="group" aria-label="Chế độ xem đào tạo">
          <button type="button" className={view === "training" ? "active" : ""} aria-pressed={view === "training"} onClick={() => setView("training")}>
            Danh sách lớp
          </button>
          <button type="button" className={view === "topic" ? "active" : ""} aria-pressed={view === "topic"} onClick={() => setView("topic")}>
            Theo chủ đề
          </button>
        </div>
      ) : null}
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
        {error ? <div className="alert error">{error}</div> : null}
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
              {groupRowsByTopic(trainings.filter((t) => (statusFilter === "ALL" || t.status === statusFilter) && (!listQuery.trim() || [t.procedure_name, t.procedure_code, t.drafting_unit].some((v) => String(v ?? "").toLocaleLowerCase("vi").includes(listQuery.trim().toLocaleLowerCase("vi")))))).map(({ key, items }) => {
                const t = items[0];
                const multi = items.length > 1;
                const open = expandedRows.has(key);
                const attended = items.reduce((n, x) => n + x.attendee_attended, 0);
                const total = items.reduce((n, x) => n + x.attendee_total, 0);
                return (
                <Fragment key={key}>
                <tr>
                  <td>{multi ? (t.procedure_code ? baseClassCode(t.procedure_code) : "—") : t.procedure_code || "—"}</td>
                  <td>
                    {t.procedure_name}
                    {t.is_attendance_only && !multi ? <> <span className="status-badge info" title="Lớp tập huấn chỉ điểm danh (quét QR), không có bài test">Chỉ điểm danh</span></> : null}
                    {multi ? (
                      <div>
                        <button type="button" className="button tertiary small" aria-expanded={open} onClick={() => setExpandedRows((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; })}>
                          {items.length} lớp {open ? "▴" : "▾"}
                        </button>
                      </div>
                    ) : null}
                    {t.source_document ? (
                      <div><small>Từ văn bản {t.source_document.document_code || ""}{t.source_document.document_code ? " — " : ""}{t.source_document.title} · <Link className="table-link" href="/document-publications">Xem văn bản →</Link></small></div>
                    ) : null}
                  </td>
                  <td>{t.drafting_unit || "—"}</td>
                  <td>{formatDate(t.effective_date)}</td>
                  <td>
                    {multi ? <span className="muted tiny">{items.filter((x) => x.status === "TRAINED").length}/{items.length} lớp đã đào tạo</span> : <span className={`status-badge ${STATUS_TONE[t.status]}`}>{STATUS_LABEL[t.status]}</span>}
                  </td>
                  <td>
                    {attended}/{total} ({total ? Math.round((attended / total) * 100) : 0}%)
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Link className="button secondary small" href={`/procedure-trainings/${t.id}`}>
                        Xem chi tiết →
                      </Link>
                      {canManage && !multi ? (
                        <button
                          type="button"
                          className="button tertiary small"
                          disabled={removingId === t.id || t.status === "TRAINED"}
                          title={t.status === "TRAINED" ? "Lớp đã hoàn thành đào tạo, không thể xoá." : undefined}
                          onClick={() => void removeTraining(t)}
                        >
                          {removingId === t.id ? "Đang xoá..." : "Xóa"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
                {multi && open ? items.map((c) => (
                  <tr key={c.id} className="pt-class-subrow">
                    <td>{c.procedure_code || "—"}</td>
                    <td colSpan={3}>
                      Lớp {c.procedure_code || ""}
                      {c.is_attendance_only ? <> <span className="status-badge info">Chỉ điểm danh</span></> : null}
                    </td>
                    <td><span className={`status-badge ${STATUS_TONE[c.status]}`}>{STATUS_LABEL[c.status]}</span></td>
                    <td>{c.attendee_attended}/{c.attendee_total}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <Link className="button secondary small" href={`/procedure-trainings/${c.id}`}>Xem →</Link>
                        {canManage ? (
                          <button type="button" className="button tertiary small" disabled={removingId === c.id || c.status === "TRAINED"} title={c.status === "TRAINED" ? "Lớp đã hoàn thành đào tạo, không thể xoá." : undefined} onClick={() => void removeTraining(c)}>
                            {removingId === c.id ? "Đang xoá..." : "Xóa"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )) : null}
                </Fragment>
                );
              })}
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
      ) : view === "self_read" ? (
        <>
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Tự đọc hiểu</h2>
              <p>Xác nhận đã đọc &amp; hiểu CHỈ qua quét QR hoặc bấm link công khai (không xác nhận trong QARICA) — xem thống kê giám sát bên dưới.</p>
            </div>
          </div>
          {error ? <div className="alert error">{error}</div> : null}
          {totalDocs ? (
            <div className="kpi-grid" style={{ padding: "0 19px 19px" }}>
              <KpiCard icon="folder-check" tone="blue" label="Văn bản tự đọc hiểu" value={totalDocs} />
              <KpiCard icon="users" tone="purple" label="Tổng lượt xác nhận" value={acks.length} />
              <KpiCard
                icon="percent"
                tone={avgCompliancePct == null ? "blue" : avgCompliancePct < 50 ? "red" : avgCompliancePct < 80 ? "amber" : "green"}
                label="Tỷ lệ tuân thủ TB (ước tính theo khoa/phòng)"
                value={avgCompliancePct == null ? "—" : `${avgCompliancePct}%`}
              />
              <KpiCard icon="triangle-alert" tone={lowComplianceDocCount > 0 ? "red" : "green"} label="Văn bản có tỷ lệ xác nhận <50%" value={lowComplianceDocCount} />
            </div>
          ) : null}
          {!totalStaffFromDepartments ? (
            <p className="muted tiny" style={{ padding: "0 19px 12px" }}>
              Chưa khai báo số nhân viên (staff_count) ở danh mục khoa/phòng nên chưa ước tính được tỷ lệ tuân thủ — chỉ đếm được số lượt xác nhận thô.
            </p>
          ) : null}
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
                {selfReadDocuments.map((d) => {
                  const pct = docCompliancePct(d.id);
                  return (
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
                          {pct != null ? <span className={`status-badge ${pct < 50 ? "danger" : pct < 80 ? "warning" : "success"}`}>{pct}% tuân thủ</span> : null}
                          {canManageDocuments ? (
                            <button type="button" className="button tertiary small" onClick={() => setQrDocId(d.id)}>
                              <Icon name="qr-code" size={13} /> Link/QR gửi email
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
        {deptCompliance.length ? (
          <section className="panel">
            <div className="panel-title">
              <div>
                <h2>Tuân thủ tự đọc hiểu theo khoa/phòng</h2>
                <p>% = tổng lượt xác nhận của khoa / (số nhân viên khoa × số văn bản tự đọc hiểu) — khoa có tỷ lệ thấp nhất hiện trước để ưu tiên nhắc.</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Khoa/phòng</th>
                    <th>Số nhân viên</th>
                    <th>Lượt xác nhận</th>
                    <th>Kỳ vọng</th>
                    <th>% tuân thủ</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleDeptCompliance.map((row) => (
                    <tr key={row.department.id}>
                      <td>{row.department.name}</td>
                      <td>{row.department.staff_count}</td>
                      <td>{row.actual}</td>
                      <td>{row.expected}</td>
                      <td>
                        <span className={`status-badge ${(row.pct ?? 0) < 50 ? "danger" : (row.pct ?? 0) < 80 ? "warning" : "success"}`}>{row.pct ?? 0}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {deptCompliance.length > LIST_COLLAPSE_LIMIT ? (
              <div style={{ padding: "0 19px 19px" }}>
                <button type="button" className="button secondary small" onClick={() => setDeptBreakdownOpen((v) => !v)}>
                  {deptBreakdownOpen ? "Thu gọn" : `Xem tất cả (${deptCompliance.length})`}
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
        </>
      ) : (
        <>
          {!topicGroups.length ? (
            <section className="panel">
              <p className="empty-state compact">Chưa có chủ đề nào gộp được từ 2 đợt đào tạo trở lên. Khi cùng 1 văn bản/quy trình được mở nhiều lớp/đợt khác ngày, kết quả sẽ tự gộp lại ở đây.</p>
            </section>
          ) : null}
          {topicGroups.map((group) => {
            const expanded = expandedTopics.has(group.key);
            const visibleRollup = expanded ? group.rollup : group.rollup.slice(0, LIST_COLLAPSE_LIMIT);
            return (
              <section className="panel" key={group.key}>
                <div className="panel-title">
                  <div>
                    <h2>{group.trainings[0]?.procedure_name || "Chủ đề đào tạo"}</h2>
                    <p>
                      Gộp {group.trainings.length} đợt: {group.trainings.map((t) => `${t.procedure_name}${t.effective_date ? ` (${formatDate(t.effective_date)})` : ""}`).join(" · ")}
                    </p>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>STT</th>
                        <th>Họ tên</th>
                        <th>Mã NV</th>
                        <th>Đơn vị</th>
                        <th>Chức danh</th>
                        <th>Trạng thái</th>
                        <th>Đạt ở đợt</th>
                        <th>Số lần tham gia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRollup.map((row, idx) => (
                        <tr key={row.key}>
                          <td>{idx + 1}</td>
                          <td>{row.employeeName}</td>
                          <td>{row.employeeCode || "—"}</td>
                          <td>{row.department || "—"}</td>
                          <td>{row.jobTitle || "—"}</td>
                          <td>
                            <span className={`status-badge ${row.status === "pass" ? "success" : row.status === "fail" ? "danger" : "muted"}`}>
                              {row.status === "pass" ? "Đạt" : row.status === "fail" ? "Không đạt — cần học lại" : "Chưa có kết quả"}
                            </span>
                          </td>
                          <td>{row.passedTraining ? `${row.passedTraining.procedureName}${row.passedTraining.effectiveDate ? ` (${formatDate(row.passedTraining.effectiveDate)})` : ""}` : "—"}</td>
                          <td>{row.attemptCount}</td>
                        </tr>
                      ))}
                      {!group.rollup.length ? (
                        <tr>
                          <td colSpan={8} className="empty-state compact">
                            Chưa có nhân sự nào tham gia các đợt của chủ đề này.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                {group.rollup.length > LIST_COLLAPSE_LIMIT ? (
                  <div style={{ padding: "0 19px 19px" }}>
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() =>
                        setExpandedTopics((prev) => {
                          const next = new Set(prev);
                          if (next.has(group.key)) next.delete(group.key);
                          else next.add(group.key);
                          return next;
                        })
                      }
                    >
                      {expanded ? "Thu gọn" : `Xem tất cả (${group.rollup.length})`}
                    </button>
                  </div>
                ) : null}
              </section>
            );
          })}
        </>
      )}
      {qrDocId ? <DocumentAckQrModal doc={selfReadDocuments.find((d) => d.id === qrDocId) || null} onClose={() => setQrDocId(null)} /> : null}
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
        @media (max-width: 900px) {
          .pt-form-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

// Mã QR + link dẫn tới /xac-nhan-doc-hieu/[id] — dán vào email ban hành
// toàn viện, nhân viên không có tài khoản QARICA vẫn xác nhận được, không
// cần đăng nhập (xem /api/public/document-ack/**).
function DocumentAckQrModal({ doc, onClose }: { doc: SelfReadDocument | null; onClose: () => void }) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const link = doc && typeof window !== "undefined" ? `${window.location.origin}/xac-nhan-doc-hieu/${doc.id}` : "";

  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, { width: 240, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [link]);

  if (!doc) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <h2>Link/QR xác nhận: {doc.title}</h2>
            <p>Dán link này vào email ban hành toàn viện, hoặc in mã QR — nhân viên bấm/quét vào xác nhận, không cần đăng nhập QARICA.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Đóng" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body" style={{ display: "grid", gap: 14, justifyItems: "center", textAlign: "center" }}>
          {qrDataUrl ? <img src={qrDataUrl} alt={`Mã QR xác nhận ${doc.title}`} width={220} height={220} /> : <div className="loading-state compact">Đang tạo mã QR...</div>}
          <code style={{ fontSize: 11, wordBreak: "break-all" }}>{link}</code>
          {qrDataUrl ? (
            <a className="button secondary small" download={`qr-xac-nhan-${doc.document_code || doc.id}.png`} href={qrDataUrl}>
              <Icon name="download" size={15} /> Tải mã QR
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
