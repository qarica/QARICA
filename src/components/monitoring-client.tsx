"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { formatDate } from "@/lib/format";

type Department = { id: string; name: string; short_name: string | null };
type TemplateRow = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  owner_department_id: string | null;
  is_active: boolean;
  latest_version_no: number | null;
  latest_version_status: string | null;
  latest_version_id: string | null;
  scoring_method: string | null;
  effective_from: string | null;
  section_count: number;
  item_count: number;
};
type MonitoringPhase = "NEEDS_CHECK" | "IN_PROGRESS" | "WAITING_RECHECK" | "AWAITING_CONFIRMATION" | "DONE" | "CANCELLED" | "OTHER";
type MonitoringRow = {
  id: string;
  record_code: string;
  title: string;
  scheduled_date: string | null;
  created_at: string | null;
  target_department_id: string | null;
  target_area: string | null;
  workflow_status: string;
  checklist_name: string;
  phase: MonitoringPhase;
};
type RoundFilter = "ALL" | MonitoringPhase;
type FormState = { name: string; description: string; ownerDepartmentId: string; scoringMethod: string };

const initialForm: FormState = { name: "", description: "", ownerDepartmentId: "", scoringMethod: "COMPLIANCE_PERCENTAGE" };

function compareRoundNewestFirst(a: MonitoringRow, b: MonitoringRow) {
  const dateA = a.scheduled_date || "";
  const dateB = b.scheduled_date || "";
  if (dateA !== dateB) return dateB.localeCompare(dateA);
  const createdA = a.created_at || "";
  const createdB = b.created_at || "";
  if (createdA !== createdB) return createdB.localeCompare(createdA);
  return b.record_code.localeCompare(a.record_code, "vi", { numeric: true, sensitivity: "base" });
}

export function MonitoringClient({ year, canManageTemplates, templateRows, monitoringRows, departments }: {
  year: number;
  canManageTemplates: boolean;
  templateRows: TemplateRow[];
  monitoringRows: MonitoringRow[];
  departments: Department[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"rounds" | "templates">("rounds");
  const [roundFilter, setRoundFilter] = useState<RoundFilter>("ALL");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);

  useEffect(() => {
    if (!formOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [formOpen]);

  const deptMap = useMemo(() => new Map(departments.map((d) => [d.id, d.short_name || d.name])), [departments]);
  const q = search.trim().toLowerCase();
  const filteredTemplates = templateRows.filter((row) => `${row.code || ""} ${row.name} ${row.description || ""} ${deptMap.get(row.owner_department_id || "") || ""}`.toLowerCase().includes(q));
  const filteredRounds = monitoringRows.filter((row) => {
    const matchesSearch = `${row.record_code} ${row.title} ${row.checklist_name} ${row.target_area || ""} ${deptMap.get(row.target_department_id || "") || ""}`.toLowerCase().includes(q);
    const matchesPhase = roundFilter === "ALL" || row.phase === roundFilter;
    return matchesSearch && matchesPhase;
  }).sort(compareRoundNewestFirst);

  const phaseCount = (phase: MonitoringPhase) => monitoringRows.filter((x) => x.phase === phase).length;
  const publishedCount = templateRows.filter((x) => x.latest_version_status === "PUBLISHED").length;
  const draftCount = templateRows.filter((x) => x.latest_version_status === "DRAFT").length;

  function openCreate() { setForm(initialForm); setMessage(null); setFormOpen(true); }
  function closeCreate() {
    if (busy) return;
    const changed = JSON.stringify(form) !== JSON.stringify(initialForm);
    if (changed && !window.confirm("Bạn có chắc muốn đóng? Dữ liệu chưa lưu sẽ bị mất.")) return;
    setFormOpen(false); setMessage(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return setMessage({ tone: "error", text: "Vui lòng nhập tên mẫu bảng kiểm." });
    if (!form.ownerDepartmentId) return setMessage({ tone: "error", text: "Vui lòng chọn khoa/phòng quản lý mẫu." });
    setBusy(true); setMessage(null);
    try {
      const res = await fetch("/api/monitoring/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.name.trim(), description: form.description.trim() || null, owner_department_id: form.ownerDepartmentId, scoring_method: form.scoringMethod }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể tạo mẫu bảng kiểm.");
      setMessage({ tone: "success", text: `Đã tạo ${data.code} · Phiên bản 1 ở trạng thái Nháp.` });
      router.refresh();
      setTimeout(() => { setFormOpen(false); if (data.id) router.push(`/monitoring/templates/${data.id}`); }, 450);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Có lỗi xảy ra." });
    } finally { setBusy(false); }
  }

  const modal = formOpen && typeof document !== "undefined" ? createPortal(
    <div className="modal-backdrop" style={{ padding: 16 }}>
      <form className="modal-card" onSubmit={submit} style={{ width: "min(900px, calc(100vw - 32px))", maxHeight: "calc(100dvh - 32px)", borderRadius: 18 }}>
        <div className="modal-head" style={{ padding: "18px 24px" }}><div><div className="eyebrow">MẪU BẢNG KIỂM · VERSION 1</div><h2>Tạo mẫu bảng kiểm mới</h2><p className="muted" style={{ margin: "5px 0 0", fontSize: 12 }}>Tạo mẫu ở đây chỉ để cấu hình nội dung. Sau khi phát hành, tạo <strong>Đợt giám sát</strong> riêng để đi chấm thực tế.</p></div><button type="button" className="icon-button" aria-label="Đóng" onClick={closeCreate}><Icon name="x" size={22} /></button></div>
        <div className="modal-body" style={{ padding: "24px 28px 30px" }}>{message ? <div className={`alert ${message.tone}`} style={{ marginBottom: 18 }}>{message.text}</div> : null}<div className="form-stack"><label><span>Tên mẫu bảng kiểm *</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ví dụ: Bảng kiểm tuân thủ vệ sinh tay" /></label><label><span>Khoa/Phòng quản lý mẫu *</span><select value={form.ownerDepartmentId} onChange={(e) => setForm({ ...form, ownerDepartmentId: e.target.value })}><option value="">— Chọn đơn vị —</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label><span>Phương pháp tổng hợp kết quả</span><select value={form.scoringMethod} onChange={(e) => setForm({ ...form, scoringMethod: e.target.value })}><option value="COMPLIANCE_PERCENTAGE">Tỷ lệ tuân thủ (%)</option><option value="WEIGHTED_SCORE">Điểm có trọng số</option><option value="NO_SCORE">Không tính điểm</option></select><small>Có thể cấu hình điểm/trọng số chi tiết ở từng tiêu chí sau.</small></label><label><span>Mô tả / phạm vi sử dụng</span><textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Mô tả mục đích, phạm vi, đối tượng áp dụng..." /></label></div></div>
        <div className="modal-footer" style={{ padding: "14px 24px" }}><button type="button" className="button secondary" disabled={busy} onClick={closeCreate}>Hủy / Đóng</button><button className="button primary" disabled={busy}><Icon name="plus" size={17} /> {busy ? "Đang tạo..." : "Tạo mẫu bảng kiểm"}</button></div>
      </form>
    </div>, document.body,
  ) : null;

  return <>
    <style>{`
      .monitoring-round-mobile{display:none}
      @media(max-width:700px){
        .monitoring-round-desktop{display:none!important}.monitoring-round-mobile{display:grid;gap:9px;padding:0 12px 12px}
        .monitoring-round-card{display:grid;gap:8px;padding:13px;border:1px solid #dce6e7;border-radius:14px;background:#fff;text-decoration:none;color:inherit}
        .monitoring-round-card:active{background:#f5faf9}.monitoring-round-card-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.monitoring-round-card-code{font-size:13px;font-weight:800;color:#0f766e}.monitoring-round-card-title{font-size:16px;font-weight:800;line-height:1.35;color:#17333a}.monitoring-round-card-meta{display:flex;gap:7px;flex-wrap:wrap;color:#69777d;font-size:11px;line-height:1.35}.monitoring-round-card-area{font-size:12px;color:#58686e;line-height:1.4}
      }
    `}</style>
    {tab === "rounds" ? <section className="kpi-grid"><article className="kpi-card warning"><span>Cần kiểm</span><strong>{phaseCount("NEEDS_CHECK")}</strong><small>Đã tạo đợt, chưa bắt đầu</small></article><article className="kpi-card"><span>Đang kiểm</span><strong>{phaseCount("IN_PROGRESS")}</strong><small>Đã bắt đầu, chưa lưu kết quả ban đầu</small></article><article className="kpi-card warning"><span>Chờ kiểm lại</span><strong>{phaseCount("WAITING_RECHECK")}</strong><small>Có tiêu chí Không đạt cần xử lý</small></article><article className="kpi-card success"><span>Chờ QLCL</span><strong>{phaseCount("AWAITING_CONFIRMATION")}</strong><small>Đã hoàn tất chấm/kiểm lại</small></article></section> : <section className="kpi-grid"><article className="kpi-card"><span>Mẫu bảng kiểm</span><strong>{templateRows.length}</strong><small>Tổng mẫu hiện có</small></article><article className="kpi-card success"><span>Đã phát hành</span><strong>{publishedCount}</strong><small>Có thể tạo đợt giám sát</small></article><article className="kpi-card warning"><span>Phiên bản nháp</span><strong>{draftCount}</strong><small>Cần hoàn thiện trước khi sử dụng</small></article><article className="kpi-card"><span>Đợt năm {year}</span><strong>{monitoringRows.length}</strong><small>Được tạo từ các mẫu đã phát hành</small></article></section>}

    <section className="panel">
      <div className="tabs" style={{ paddingTop: 4 }}><button className={tab === "rounds" ? "active" : ""} onClick={() => { setTab("rounds"); setSearch(""); }}>Đợt giám sát</button><button className={tab === "templates" ? "active" : ""} onClick={() => { setTab("templates"); setSearch(""); }}>Mẫu bảng kiểm</button></div>
      <div className="toolbar"><div className="search-box"><Icon name="search" size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tab === "templates" ? "Tìm theo mã, tên mẫu, khoa/phòng..." : "Tìm theo mã đợt, bảng kiểm, khu vực..."} /></div>{tab === "templates" && canManageTemplates ? <button className="button primary" onClick={openCreate}><Icon name="plus" size={17} /> Tạo mẫu bảng kiểm</button> : null}</div>

      {tab === "rounds" ? <div style={{ padding: "0 16px 12px", display: "flex", gap: 7, flexWrap: "wrap" }}>{([["ALL", "Tất cả"],["NEEDS_CHECK", "Cần kiểm"],["IN_PROGRESS", "Đang kiểm"],["WAITING_RECHECK", "Chờ kiểm lại"],["AWAITING_CONFIRMATION", "Chờ QLCL"],["DONE", "Hoàn tất"]] as [RoundFilter, string][]).map(([value, label]) => <button key={value} className={`button ${roundFilter === value ? "primary" : "secondary"} small`} onClick={() => setRoundFilter(value)}>{label}{value !== "ALL" ? ` (${phaseCount(value as MonitoringPhase)})` : ` (${monitoringRows.length})`}</button>)}</div> : null}

      {tab === "templates" ? <div className="table-wrap"><table><thead><tr><th>Mã</th><th>Tên mẫu bảng kiểm</th><th>Đơn vị quản lý</th><th>Phiên bản mới nhất</th><th>Cấu trúc</th><th>Cách tính</th></tr></thead><tbody>{filteredTemplates.map((row) => <tr key={row.id}><td><Link className="table-link" href={`/monitoring/templates/${row.id}`}>{row.code || "—"}</Link></td><td><Link className="table-link" href={`/monitoring/templates/${row.id}`}>{row.name}</Link>{!row.is_active ? <span className="subline text-danger">Đã ngưng sử dụng</span> : null}</td><td>{deptMap.get(row.owner_department_id || "") || "—"}</td><td><div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}><strong>{row.latest_version_no ? `v${row.latest_version_no}` : "—"}</strong>{row.latest_version_status ? <VersionBadge status={row.latest_version_status} /> : null}</div>{row.effective_from ? <span className="subline">Hiệu lực từ {formatDate(row.effective_from)}</span> : null}</td><td><strong>{row.section_count}</strong> nhóm · <strong>{row.item_count}</strong> tiêu chí</td><td>{scoringLabel(row.scoring_method)}</td></tr>)}{!filteredTemplates.length ? <tr><td colSpan={6}><div className="empty-state">Chưa có mẫu bảng kiểm.</div></td></tr> : null}</tbody></table></div> : <>
        <div className="monitoring-round-desktop table-wrap"><table><thead><tr><th>Mã đợt</th><th>Đợt giám sát</th><th>Bảng kiểm</th><th>Khoa/Phòng</th><th>Ngày</th><th>Trạng thái</th></tr></thead><tbody>{filteredRounds.map((row) => <tr key={row.id}><td><Link className="table-link" href={`/monitoring/${row.id}`}><strong>{row.record_code}</strong></Link></td><td><Link className="table-link" href={`/monitoring/${row.id}`}><strong>{row.title}</strong></Link>{row.target_area ? <span className="subline">Khu vực: {row.target_area}</span> : null}</td><td>{row.checklist_name}</td><td>{deptMap.get(row.target_department_id || "") || "—"}</td><td>{formatDate(row.scheduled_date)}</td><td><MonitoringPhaseBadge phase={row.phase} /></td></tr>)}{!filteredRounds.length ? <tr><td colSpan={6}><div className="empty-state">Không có đợt giám sát phù hợp bộ lọc hiện tại.</div></td></tr> : null}</tbody></table></div>
        <div className="monitoring-round-mobile">{filteredRounds.map((row) => <Link key={row.id} href={`/monitoring/${row.id}`} className="monitoring-round-card"><div className="monitoring-round-card-head"><span className="monitoring-round-card-code">{row.record_code}</span><MonitoringPhaseBadge phase={row.phase} /></div><div className="monitoring-round-card-title">{row.title}</div><div className="monitoring-round-card-meta"><span>{formatDate(row.scheduled_date)}</span><span>•</span><span>{row.checklist_name}</span>{deptMap.get(row.target_department_id || "") ? <><span>•</span><span>{deptMap.get(row.target_department_id || "")}</span></> : null}</div>{row.target_area ? <div className="monitoring-round-card-area">Khu vực: {row.target_area}</div> : null}</Link>)}{!filteredRounds.length ? <div className="empty-state">Không có đợt giám sát phù hợp bộ lọc hiện tại.</div> : null}</div>
      </>}
    </section>
    {modal}
  </>;
}

function VersionBadge({ status }: { status: string }) {
  const tone = status === "PUBLISHED" ? "success" : status === "RETIRED" ? "muted" : "warning";
  const label = status === "PUBLISHED" ? "Đã phát hành" : status === "RETIRED" ? "Ngưng sử dụng" : "Nháp";
  return <span className={`status-badge ${tone}`}>{label}</span>;
}

function MonitoringPhaseBadge({ phase }: { phase: MonitoringPhase }) {
  const labels: Record<MonitoringPhase, string> = { NEEDS_CHECK: "Cần kiểm", IN_PROGRESS: "Đang kiểm", WAITING_RECHECK: "Chờ kiểm lại", AWAITING_CONFIRMATION: "Chờ QLCL xác nhận", DONE: "Hoàn tất", CANCELLED: "Đã hủy", OTHER: "Khác" };
  const tone = phase === "DONE" ? "success" : phase === "IN_PROGRESS" ? "info" : phase === "WAITING_RECHECK" ? "danger" : phase === "CANCELLED" ? "muted" : "warning";
  return <span className={`status-badge ${tone}`}>{labels[phase]}</span>;
}

function scoringLabel(value?: string | null) {
  if (value === "WEIGHTED_SCORE") return "Điểm có trọng số";
  if (value === "NO_SCORE") return "Không tính điểm";
  return "Tỷ lệ tuân thủ (%)";
}
