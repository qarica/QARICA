"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/status-badge";
import { MultiCheckSelect } from "@/components/multi-check-select";
import { useCreateModalSignal } from "@/components/create-modal-signal";
import { formatDate } from "@/lib/format";

type PlanRow = {
  id: string; record_id: string; record_code: string; title: string; program_type: string; objective: string | null;
  start_date: string | null; end_date: string | null; lead_department_id: string | null; owner_user_id: string | null;
  workflow_status: string; required_actions: number; completed_actions: number; progress_pct: number; overdue_actions: number;
};
type Department = { id: string; name: string; short_name: string | null; is_active: boolean };
type Profile = { user_id: string; full_name: string | null; email: string | null; primary_department_id: string | null; is_active: boolean };
type ReferenceOption = { id: string; label: string; description?: string | null };
type FormState = {
  title: string; programType: string; generalObjective: string; specificObjectives: string[]; requirements: string; description: string;
  startDate: string; endDate: string; referenceIds: string[];
};

const TYPE_LABELS: Record<string, string> = { ANNUAL_PLAN: "Kế hoạch năm", THEMATIC_PLAN: "Kế hoạch chuyên đề", DEPARTMENT_PLAN: "Kế hoạch khoa/phòng", PROGRAM: "Chương trình", OTHER: "Khác" };

function initialForm(year: number): FormState {
  return { title: "", programType: "ANNUAL_PLAN", generalObjective: "", specificObjectives: [], requirements: "", description: "", startDate: `${year}-01-01`, endDate: `${year}-12-31`, referenceIds: [] };
}

export function PlansClient({ year, canManage, rows, departments, profiles, referenceOptions }: { year: number; canManage: boolean; rows: PlanRow[]; departments: Department[]; profiles: Profile[]; referenceOptions: ReferenceOption[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [programType, setProgramType] = useState("ALL");
  const [department, setDepartment] = useState("ALL");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState<FormState>(() => initialForm(year));

  useEffect(() => { if (!formOpen) return; const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = previous; }; }, [formOpen]);
  const deptMap = useMemo(() => new Map(departments.map((d) => [d.id, d.short_name || d.name])), [departments]);
  const userMap = useMemo(() => new Map(profiles.map((p) => [p.user_id, p.full_name || p.email || "Người dùng"])), [profiles]);
  const filtered = rows.filter((row) => { const text = `${row.record_code} ${row.title} ${deptMap.get(row.lead_department_id || "") || ""}`.toLowerCase(); return text.includes(search.trim().toLowerCase()) && (status === "ALL" || row.workflow_status === status) && (programType === "ALL" || row.program_type === programType) && (department === "ALL" || row.lead_department_id === department); });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  function updateFilter(setter: () => void) { setter(); setPage(1); }

  function exportCsv() {
    const header = ["Mã", "Tên kế hoạch", "Loại", "Khoa/phòng", "Chủ trì", "Bắt đầu", "Kết thúc", "Tiến độ %", "Trạng thái"];
    const lines = [header.join(",")];
    for (const row of filtered) lines.push([row.record_code, `"${row.title.replace(/"/g, '""')}"`, TYPE_LABELS[row.program_type] || row.program_type, deptMap.get(row.lead_department_id || "") || "", row.owner_user_id ? userMap.get(row.owner_user_id) || "" : "", row.start_date || "", row.end_date || "", String(Math.round(row.progress_pct || 0)), row.workflow_status].join(","));
    const blob = new Blob([`﻿${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `ke-hoach-${year}.csv`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  }

  function openCreate() { setMessage(null); setForm(initialForm(year)); setFormOpen(true); }
  const { openSignal } = useCreateModalSignal();
  useEffect(() => { if (openSignal > 0 && canManage) openCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);
  function requestClose() { if (busy) return; const changed = JSON.stringify(form) !== JSON.stringify(initialForm(year)); if (changed && !window.confirm("Bạn có chắc muốn đóng? Dữ liệu chưa lưu sẽ bị mất.")) return; setMessage(null); setFormOpen(false); }
  function setSpecific(index: number, value: string) { setForm((current) => ({ ...current, specificObjectives: current.specificObjectives.map((item, i) => i === index ? value : item) })); }
  function addSpecific() { setForm((current) => ({ ...current, specificObjectives: [...current.specificObjectives, ""] })); }
  function removeSpecific(index: number) { setForm((current) => ({ ...current, specificObjectives: current.specificObjectives.filter((_, i) => i !== index) })); }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const specificObjectives = form.specificObjectives.map((x) => x.trim()).filter(Boolean);
    if (!form.title.trim()) return setMessage({ tone: "error", text: "Vui lòng nhập tên kế hoạch." });
    if (!form.generalObjective.trim()) return setMessage({ tone: "error", text: "Vui lòng nhập mục tiêu." });
    if (form.startDate && form.endDate && form.endDate < form.startDate) return setMessage({ tone: "error", text: "Ngày kết thúc không được trước ngày bắt đầu." });

    setBusy(true); setMessage(null);
    try {
      const res = await fetch("/api/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        work_year: year, title: form.title.trim(), program_type: form.programType, general_objective: form.generalObjective.trim(), specific_objectives: specificObjectives,
        requirements: form.requirements.trim(), description: form.description.trim() || null, start_date: form.startDate || null, end_date: form.endDate || null,
        reference_ids: form.referenceIds, draft_actions: [],
      }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Không thể tạo kế hoạch.");
      setMessage({ tone: "success", text: `Đã tạo bản nháp ${data.record_code}. Mở kế hoạch để bổ sung nhiệm vụ trước khi gửi duyệt.` });
      router.refresh();
      setTimeout(() => { setFormOpen(false); if (data.id) router.push(`/plans/${data.id}`); }, 450);
    } catch (error) { setMessage({ tone: "error", text: error instanceof Error ? error.message : "Có lỗi xảy ra." }); }
    finally { setBusy(false); }
  }

  const modal = formOpen && typeof document !== "undefined" ? createPortal(
    <div className="modal-backdrop" style={{ padding: 16 }}><form className="modal-card" onSubmit={submit} style={{ width: "min(1440px, calc(100vw - 32px))", height: "min(900px, calc(100dvh - 32px))", maxHeight: "calc(100dvh - 32px)", borderRadius: 18 }}>
      <div className="modal-head" style={{ flexShrink: 0, padding: "18px 24px" }}><div><div className="eyebrow">PLAN COMPOSER · {year}</div><h2>Tạo kế hoạch mới</h2><p className="muted" style={{ margin: "5px 0 0", fontSize: 12 }}>Tạo nhanh khung văn bản; căn cứ đứng trước mục tiêu. Phân công thực hiện ở từng nhiệm vụ, không nhập lặp tại đây.</p></div><button type="button" className="icon-button" title="Đóng cửa sổ" aria-label="Đóng cửa sổ" onClick={requestClose}><Icon name="x" size={22} /></button></div>
      <div className="modal-body" style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "24px 28px 30px" }}>
        {message ? <div className={`alert ${message.tone}`} style={{ marginBottom: 18 }}>{message.text}</div> : null}
        <div className="form-stack" style={{ gap: 22 }}>
          <section>
            <div style={{ marginBottom: 13 }}>
              <strong style={{ fontSize: 14 }}>1. Thông tin cơ bản</strong>
              <div className="muted tiny" style={{ marginTop: 4 }}>Chỉ nhập phần khung. Phân công cá nhân/nhóm thực hiện tại từng nhiệm vụ.</div>
            </div>
            <div className="form-grid two" style={{ gap: 16 }}>
              <label className="span-2"><span>Tên kế hoạch *</span><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={`Ví dụ: Kế hoạch hoạt động quản lý chất lượng bệnh viện năm ${year}`} /></label>
              <label><span>Ngày bắt đầu</span><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
              <label><span>Ngày kết thúc</span><input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
            </div>
          </section>

          <section style={{ borderTop: "1px solid var(--line)", paddingTop: 20 }}>
            <div style={{ marginBottom: 13 }}>
              <strong style={{ fontSize: 14 }}>2. Căn cứ lập kế hoạch</strong>
              <div className="muted tiny" style={{ marginTop: 4 }}>Chọn từ thư viện văn bản đã có; không nhập lại nội dung văn bản.</div>
            </div>
            <MultiCheckSelect options={referenceOptions} value={form.referenceIds} onChange={(ids) => setForm({ ...form, referenceIds: ids })} placeholder="Tìm và chọn văn bản BYT / SYT / Bệnh viện..." emptyText="Chưa có văn bản trong Thư viện Văn bản / Chỉ đạo." />
          </section>

          <section style={{ borderTop: "1px solid var(--line)", paddingTop: 20 }}>
            <div style={{ marginBottom: 13 }}>
              <strong style={{ fontSize: 14 }}>3. Mục tiêu</strong>
              <div className="muted tiny" style={{ marginTop: 4 }}>Nhập mục tiêu chung. Chỉ thêm mục tiêu cụ thể khi văn bản thực sự cần tách.</div>
            </div>
            <div className="form-grid two" style={{ gap: 12 }}>
              <label className="span-2"><span>Mục tiêu *</span><textarea rows={3} value={form.generalObjective} onChange={(e) => setForm({ ...form, generalObjective: e.target.value })} placeholder="Mục tiêu cần đạt của kế hoạch" /></label>
              {form.specificObjectives.map((item, index) => <label className="span-2" key={index}><span>Mục tiêu cụ thể {index + 1}</span><div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}><textarea rows={2} value={item} onChange={(e) => setSpecific(index, e.target.value)} /><button type="button" className="button tertiary small" onClick={() => removeSpecific(index)}>Xóa</button></div></label>)}
              <div className="span-2"><button type="button" className="button secondary small" onClick={addSpecific}>+ Thêm mục tiêu cụ thể</button></div>
            </div>
          </section>

          <details style={{ borderTop: "1px solid var(--line)", paddingTop: 18 }}>
            <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 800 }}>Tùy chọn bổ sung</summary>
            <div className="form-grid two" style={{ gap: 16, marginTop: 14 }}>
              <label><span>Loại kế hoạch</span><select value={form.programType} onChange={(e) => setForm({ ...form, programType: e.target.value })}><option value="ANNUAL_PLAN">Kế hoạch năm</option><option value="THEMATIC_PLAN">Kế hoạch chuyên đề</option><option value="DEPARTMENT_PLAN">Kế hoạch khoa/phòng</option><option value="PROGRAM">Chương trình</option><option value="OTHER">Khác</option></select></label>
              <div />
              <label className="span-2"><span>Yêu cầu <small className="muted">(không bắt buộc)</small></span><textarea rows={3} value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} placeholder="Nguyên tắc, điều kiện hoặc yêu cầu phối hợp nếu văn bản có quy định" /></label>
              <label className="span-2"><span>Phạm vi / ghi chú <small className="muted">(không bắt buộc)</small></span><textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Phạm vi áp dụng, đối tượng hoặc ghi chú cần thiết" /></label>
            </div>
          </details>

          <div className="scope-note"><strong>Sau khi tạo:</strong> kế hoạch ở trạng thái Nháp. Thêm nhiệm vụ theo luồng <strong>Nội dung → Giao cho → Hạn → Kết quả</strong>; QARICA tự sinh phần phân công/lộ trình từ dữ liệu nhiệm vụ.</div>
        </div>
      </div>
      <div className="modal-footer" style={{ flexShrink: 0, padding: "14px 24px", boxShadow: "0 -6px 18px rgba(26,42,49,.04)" }}><button type="button" className="button secondary" disabled={busy} onClick={requestClose}>Hủy / Đóng</button><button className="button primary" disabled={busy}><Icon name="save" size={17} /> {busy ? "Đang tạo..." : "Tạo bản nháp"}</button></div>
    </form></div>, document.body) : null;

  return <>
    <section className="panel"><div className="toolbar"><div className="toolbar-left"><div className="search-box"><Icon name="search" size={18} /><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Tìm mã, tên kế hoạch, khoa/phòng..." /></div><select style={{ width: 180 }} value={status} onChange={(e) => updateFilter(() => setStatus(e.target.value))}><option value="ALL">Tất cả trạng thái</option><option value="DRAFT">Nháp</option><option value="PENDING_APPROVAL">Chờ phê duyệt</option><option value="APPROVED">Đã phê duyệt</option><option value="IN_PROGRESS">Đang thực hiện</option><option value="ON_HOLD">Tạm dừng</option><option value="COMPLETED">Hoàn thành</option><option value="CANCELLED">Đã hủy</option></select><select style={{ width: 180 }} value={programType} onChange={(e) => updateFilter(() => setProgramType(e.target.value))}><option value="ALL">Tất cả loại kế hoạch</option>{Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><select style={{ width: 180 }} value={department} onChange={(e) => updateFilter(() => setDepartment(e.target.value))}><option value="ALL">Tất cả khoa/phòng</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.short_name || d.name}</option>)}</select></div><button type="button" className="button secondary" onClick={exportCsv} disabled={!filtered.length}>Xuất Excel</button></div>
      <div className="table-wrap"><table><thead><tr><th>#</th><th>Mã</th><th>Tên kế hoạch</th><th>Loại</th><th>Khoa/phòng</th><th>Chủ trì</th><th>Thời gian</th><th>Tiến độ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{pageRows.map((row, index) => { const pct = Math.max(0, Math.min(100, Math.round(row.progress_pct || 0))); return <tr key={row.id}><td>{(currentPage - 1) * PAGE_SIZE + index + 1}</td><td><Link className="table-link" href={`/plans/${row.id}`}>{row.record_code}</Link></td><td><Link href={`/plans/${row.id}`}><strong>{row.title}</strong></Link></td><td>{TYPE_LABELS[row.program_type] || row.program_type}</td><td>{deptMap.get(row.lead_department_id || "") || "—"}</td><td>{row.owner_user_id ? userMap.get(row.owner_user_id) || "Người phụ trách" : "—"}</td><td>{formatDate(row.start_date)}<span className="subline">đến {formatDate(row.end_date)}</span></td><td><div className="progress-cell"><div className="progress-track"><span style={{ width: `${pct}%` }} /></div><strong>{pct}%</strong></div><span className="subline">{row.completed_actions}/{row.required_actions} việc · {row.overdue_actions} quá hạn</span></td><td><StatusBadge status={row.workflow_status} /></td><td><Link className="icon-button header-icon" title="Xem chi tiết" href={`/plans/${row.id}`}><Icon name="search" size={16} /></Link></td></tr>; })}{!pageRows.length ? <tr><td colSpan={10}><div className="empty-state">Chưa có kế hoạch phù hợp trong năm {year}.</div></td></tr> : null}</tbody></table></div>
      {filtered.length ? <div className="module-pagination"><span>Hiển thị {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filtered.length)} của {filtered.length} bản ghi</span><div className="module-pagination-pages">{Array.from({ length: totalPages }, (_, i) => i + 1).map((pn) => <button type="button" key={pn} className={`button small ${pn === currentPage ? "primary" : "secondary"}`} onClick={() => setPage(pn)}>{pn}</button>)}</div></div> : null}
    </section>{modal}
  </>;
}
