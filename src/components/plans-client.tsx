"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";

type PlanRow = {
  id: string; record_id: string; record_code: string; title: string; program_type: string; objective: string | null;
  start_date: string | null; end_date: string | null; lead_department_id: string | null; owner_user_id: string | null;
  workflow_status: string; required_actions: number; completed_actions: number; progress_pct: number; overdue_actions: number;
};
type Department = { id: string; name: string; short_name: string | null; is_active: boolean };
type Profile = { user_id: string; full_name: string | null; email: string | null; primary_department_id: string | null; is_active: boolean };
type FormState = {
  title: string; programType: string; generalObjective: string; specificObjectives: string[]; requirements: string; description: string;
  startDate: string; endDate: string; leadDepartmentId: string; ownerUserId: string;
};

const TYPE_LABELS: Record<string, string> = { ANNUAL_PLAN: "Kế hoạch năm", THEMATIC_PLAN: "Kế hoạch chuyên đề", DEPARTMENT_PLAN: "Kế hoạch khoa/phòng", PROGRAM: "Chương trình", OTHER: "Khác" };

function initialForm(year: number): FormState {
  return { title: "", programType: "ANNUAL_PLAN", generalObjective: "", specificObjectives: [""], requirements: "", description: "", startDate: `${year}-01-01`, endDate: `${year}-12-31`, leadDepartmentId: "", ownerUserId: "" };
}

export function PlansClient({ year, canManage, rows, departments, profiles }: { year: number; canManage: boolean; rows: PlanRow[]; departments: Department[]; profiles: Profile[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState<FormState>(() => initialForm(year));

  useEffect(() => { if (!formOpen) return; const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = previous; }; }, [formOpen]);
  const deptMap = useMemo(() => new Map(departments.map((d) => [d.id, d.short_name || d.name])), [departments]);
  const userMap = useMemo(() => new Map(profiles.map((p) => [p.user_id, p.full_name || p.email || "Người dùng"])), [profiles]);
  const filtered = rows.filter((row) => { const text = `${row.record_code} ${row.title} ${deptMap.get(row.lead_department_id || "") || ""}`.toLowerCase(); return text.includes(search.trim().toLowerCase()) && (status === "ALL" || row.workflow_status === status); });
  const total = rows.length;
  const inProgress = rows.filter((r) => ["APPROVED", "IN_PROGRESS"].includes(r.workflow_status)).length;
  const completed = rows.filter((r) => r.workflow_status === "COMPLETED").length;
  const overdue = rows.reduce((sum, r) => sum + (r.overdue_actions > 0 ? 1 : 0), 0);

  function openCreate() { setMessage(null); setForm(initialForm(year)); setFormOpen(true); }
  function requestClose() { if (busy) return; const changed = JSON.stringify(form) !== JSON.stringify(initialForm(year)); if (changed && !window.confirm("Bạn có chắc muốn đóng? Dữ liệu chưa lưu sẽ bị mất.")) return; setMessage(null); setFormOpen(false); }
  function setSpecific(index: number, value: string) { setForm((current) => ({ ...current, specificObjectives: current.specificObjectives.map((item, i) => i === index ? value : item) })); }
  function addSpecific() { setForm((current) => ({ ...current, specificObjectives: [...current.specificObjectives, ""] })); }
  function removeSpecific(index: number) { setForm((current) => ({ ...current, specificObjectives: current.specificObjectives.length === 1 ? [""] : current.specificObjectives.filter((_, i) => i !== index) })); }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const specificObjectives = form.specificObjectives.map((x) => x.trim()).filter(Boolean);
    if (!form.title.trim()) return setMessage({ tone: "error", text: "Vui lòng nhập tên kế hoạch." });
    if (!form.leadDepartmentId) return setMessage({ tone: "error", text: "Vui lòng chọn khoa/phòng chủ trì." });
    if (!form.generalObjective.trim()) return setMessage({ tone: "error", text: "Vui lòng nhập mục tiêu chung." });
    if (!specificObjectives.length) return setMessage({ tone: "error", text: "Cần ít nhất 01 mục tiêu cụ thể." });
    if (!form.requirements.trim()) return setMessage({ tone: "error", text: "Vui lòng nhập yêu cầu của kế hoạch." });
    if (form.startDate && form.endDate && form.endDate < form.startDate) return setMessage({ tone: "error", text: "Ngày kết thúc không được trước ngày bắt đầu." });

    setBusy(true); setMessage(null);
    try {
      const res = await fetch("/api/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        work_year: year, title: form.title.trim(), program_type: form.programType, general_objective: form.generalObjective.trim(), specific_objectives: specificObjectives,
        requirements: form.requirements.trim(), description: form.description.trim() || null, start_date: form.startDate || null, end_date: form.endDate || null,
        lead_department_id: form.leadDepartmentId, owner_user_id: form.ownerUserId || null, draft_actions: [],
      }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Không thể tạo kế hoạch.");
      setMessage({ tone: "success", text: `Đã tạo bản nháp ${data.record_code}. Mở kế hoạch để bổ sung nhiệm vụ trước khi gửi duyệt.` });
      router.refresh();
      setTimeout(() => { setFormOpen(false); if (data.id) router.push(`/plans/${data.id}`); }, 450);
    } catch (error) { setMessage({ tone: "error", text: error instanceof Error ? error.message : "Có lỗi xảy ra." }); }
    finally { setBusy(false); }
  }

  const eligibleProfiles = profiles.filter((p) => !form.leadDepartmentId || !p.primary_department_id || p.primary_department_id === form.leadDepartmentId);
  const modal = formOpen && typeof document !== "undefined" ? createPortal(
    <div className="modal-backdrop" style={{ padding: 16 }}><form className="modal-card" onSubmit={submit} style={{ width: "min(1440px, calc(100vw - 32px))", height: "min(900px, calc(100dvh - 32px))", maxHeight: "calc(100dvh - 32px)", borderRadius: 18 }}>
      <div className="modal-head" style={{ flexShrink: 0, padding: "18px 24px" }}><div><div className="eyebrow">PLAN COMPOSER V2 · {year}</div><h2>Tạo kế hoạch mới</h2><p className="muted" style={{ margin: "5px 0 0", fontSize: 12 }}>Tạo phần khung kế hoạch. Sau khi lưu Nháp, bổ sung nhiệm vụ dự kiến ngay trên trang chi tiết trước khi gửi phê duyệt.</p></div><button type="button" className="icon-button" title="Đóng cửa sổ" aria-label="Đóng cửa sổ" onClick={requestClose}><Icon name="x" size={22} /></button></div>
      <div className="modal-body" style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "24px 28px 30px" }}>
        {message ? <div className={`alert ${message.tone}`} style={{ marginBottom: 18 }}>{message.text}</div> : null}
        <div className="form-stack" style={{ gap: 24 }}>
          <section><div style={{ marginBottom: 13 }}><strong style={{ fontSize: 14 }}>1. Thông tin kế hoạch</strong><div className="muted tiny" style={{ marginTop: 4 }}>Tên, loại, đơn vị chủ trì và đầu mối.</div></div><div className="form-grid two" style={{ gap: 16 }}>
            <label className="span-2"><span>Tên kế hoạch *</span><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={`Ví dụ: Kế hoạch hoạt động quản lý chất lượng bệnh viện năm ${year}`} /></label>
            <label><span>Loại kế hoạch *</span><select value={form.programType} onChange={(e) => setForm({ ...form, programType: e.target.value })}><option value="ANNUAL_PLAN">Kế hoạch năm</option><option value="THEMATIC_PLAN">Kế hoạch chuyên đề</option><option value="DEPARTMENT_PLAN">Kế hoạch khoa/phòng</option><option value="PROGRAM">Chương trình</option><option value="OTHER">Khác</option></select></label>
            <label><span>Khoa/Phòng chủ trì *</span><select value={form.leadDepartmentId} onChange={(e) => setForm({ ...form, leadDepartmentId: e.target.value, ownerUserId: "" })}><option value="">— Chọn đơn vị —</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
            <label><span>Ngày bắt đầu</span><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
            <label><span>Ngày kết thúc</span><input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
            <label className="span-2"><span>Người phụ trách</span><select value={form.ownerUserId} onChange={(e) => setForm({ ...form, ownerUserId: e.target.value })}><option value="">— Chưa chỉ định —</option>{eligibleProfiles.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email || p.user_id}</option>)}</select></label>
          </div></section>
          <section style={{ borderTop: "1px solid var(--line)", paddingTop: 22 }}><div style={{ marginBottom: 13 }}><strong style={{ fontSize: 14 }}>2. Mục tiêu kế hoạch</strong><div className="muted tiny" style={{ marginTop: 4 }}>Plan Composer V2 yêu cầu mục tiêu chung và ít nhất một mục tiêu cụ thể.</div></div><div className="form-grid two" style={{ gap: 16 }}>
            <label className="span-2"><span>Mục tiêu chung *</span><textarea rows={3} value={form.generalObjective} onChange={(e) => setForm({ ...form, generalObjective: e.target.value })} placeholder="Mục tiêu tổng quát cần đạt trong năm/kỳ kế hoạch" /></label>
            <div className="span-2" style={{ display: "grid", gap: 8 }}><span style={{ fontSize: 12, fontWeight: 700 }}>Mục tiêu cụ thể *</span>{form.specificObjectives.map((item, index) => <div key={index} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}><input value={item} onChange={(e) => setSpecific(index, e.target.value)} placeholder={`Mục tiêu cụ thể ${index + 1}`} /><button type="button" className="button tertiary small" onClick={() => removeSpecific(index)}>Xóa</button></div>)}<div><button type="button" className="button secondary small" onClick={addSpecific}>+ Thêm mục tiêu cụ thể</button></div></div>
          </div></section>
          <section style={{ borderTop: "1px solid var(--line)", paddingTop: 22 }}><div style={{ marginBottom: 13 }}><strong style={{ fontSize: 14 }}>3. Yêu cầu & phạm vi</strong></div><div className="form-grid two" style={{ gap: 16 }}>
            <label className="span-2"><span>Yêu cầu *</span><textarea rows={3} value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} placeholder="Nguyên tắc, nguồn lực, yêu cầu phối hợp hoặc điều kiện triển khai" /></label>
            <label className="span-2"><span>Mô tả / phạm vi</span><textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Phạm vi áp dụng hoặc ghi chú triển khai" /></label>
          </div></section>
          <div className="scope-note"><strong>Sau khi tạo:</strong> kế hoạch ở trạng thái Nháp. Bổ sung ít nhất 01 nhiệm vụ dự kiến trên trang chi tiết; các nhiệm vụ này chỉ được tạo thành Action chính thức khi kế hoạch được phê duyệt.</div>
        </div>
      </div>
      <div className="modal-footer" style={{ flexShrink: 0, padding: "14px 24px", boxShadow: "0 -6px 18px rgba(26,42,49,.04)" }}><button type="button" className="button secondary" disabled={busy} onClick={requestClose}>Hủy / Đóng</button><button className="button primary" disabled={busy}><Icon name="save" size={17} /> {busy ? "Đang tạo..." : "Tạo bản nháp"}</button></div>
    </form></div>, document.body) : null;

  return <>
    <section className="kpi-grid"><article className="kpi-card"><span>Tổng kế hoạch</span><strong>{total}</strong><small>Trong năm {year}</small></article><article className="kpi-card"><span>Đang triển khai</span><strong>{inProgress}</strong><small>Đã duyệt / đang thực hiện</small></article><article className="kpi-card danger"><span>Có việc quá hạn</span><strong>{overdue}</strong><small>Kế hoạch cần chú ý</small></article><article className="kpi-card success"><span>Hoàn thành</span><strong>{completed}</strong><small>Kế hoạch đã hoàn tất</small></article></section>
    <section className="panel"><div className="toolbar"><div className="toolbar-left"><div className="search-box"><Icon name="search" size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm mã, tên kế hoạch, khoa/phòng..." /></div><select style={{ width: 190 }} value={status} onChange={(e) => setStatus(e.target.value)}><option value="ALL">Tất cả trạng thái</option><option value="DRAFT">Nháp</option><option value="PENDING_APPROVAL">Chờ phê duyệt</option><option value="APPROVED">Đã phê duyệt</option><option value="IN_PROGRESS">Đang thực hiện</option><option value="ON_HOLD">Tạm dừng</option><option value="COMPLETED">Hoàn thành</option><option value="CANCELLED">Đã hủy</option></select></div>{canManage ? <button className="button primary" onClick={openCreate}><Icon name="plus" size={18} /> Tạo kế hoạch</button> : null}</div>
      <div className="table-wrap"><table><thead><tr><th>Mã</th><th>Kế hoạch</th><th>Loại</th><th>Chủ trì</th><th>Thời gian</th><th>Tiến độ</th><th>Trạng thái</th></tr></thead><tbody>{filtered.map((row) => { const pct = Math.max(0, Math.min(100, Math.round(row.progress_pct || 0))); return <tr key={row.id}><td><Link className="table-link" href={`/plans/${row.id}`}>{row.record_code}</Link></td><td><Link href={`/plans/${row.id}`}><strong>{row.title}</strong></Link></td><td>{TYPE_LABELS[row.program_type] || row.program_type}</td><td>{deptMap.get(row.lead_department_id || "") || "—"}{row.owner_user_id ? <span className="subline">{userMap.get(row.owner_user_id) || "Người phụ trách"}</span> : null}</td><td>{formatDate(row.start_date)}<span className="subline">đến {formatDate(row.end_date)}</span></td><td><div className="progress-cell"><div className="progress-track"><span style={{ width: `${pct}%` }} /></div><strong>{pct}%</strong></div><span className="subline">{row.completed_actions}/{row.required_actions} việc · {row.overdue_actions} quá hạn</span></td><td><StatusBadge status={row.workflow_status} /></td></tr>; })}{!filtered.length ? <tr><td colSpan={7}><div className="empty-state">Chưa có kế hoạch phù hợp trong năm {year}.</div></td></tr> : null}</tbody></table></div>
    </section>{modal}
  </>;
}
