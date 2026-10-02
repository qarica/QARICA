"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { TqmGantt } from "@/components/tqm-charts";
import { EMR_STATUS_LABELS } from "@/lib/emr-categories";

type Milestone = { id: string; parent_id: string | null; title: string; start_date: string | null; end_date: string | null; status: string; sort_order: number; created_at: string };
type FormState = { title: string; start_date: string; end_date: string; status: string };
const EMPTY_FORM: FormState = { title: "", start_date: "", end_date: "", status: "TODO" };

function statusTone(status: string): "red" | "green" | "blue" | "slate" {
  return status === "BLOCKED" ? "red" : status === "DONE" ? "green" : status === "IN_PROGRESS" ? "blue" : "slate";
}
function statusProgress(status: string): number {
  return status === "DONE" ? 100 : status === "IN_PROGRESS" ? 50 : 0;
}

export function EmrTimelineMilestonesClient({ canManage, year }: { canManage: boolean; year: number }) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<{ mode: "create-parent" | "create-child" | "edit"; parentId?: string; target?: Milestone } | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/emr/timeline-milestones");
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không tải được dữ liệu.");
      setMilestones(json.milestones);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const parents = useMemo(() => milestones.filter((m) => !m.parent_id).sort((a, b) => a.sort_order - b.sort_order), [milestones]);
  const childrenOf = useMemo(() => {
    const map: Record<string, Milestone[]> = {};
    for (const m of milestones) { if (m.parent_id) { (map[m.parent_id] ||= []).push(m); } }
    for (const key of Object.keys(map)) map[key].sort((a, b) => a.sort_order - b.sort_order);
    return map;
  }, [milestones]);

  function toggleExpanded(id: string) { setExpanded((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }

  function openCreateParent() { setForm(EMPTY_FORM); setModal({ mode: "create-parent" }); }
  function openCreateChild(parentId: string) { setForm(EMPTY_FORM); setModal({ mode: "create-child", parentId }); }
  function openEdit(target: Milestone) { setForm({ title: target.title, start_date: target.start_date || "", end_date: target.end_date || "", status: target.status }); setModal({ mode: "edit", target }); }
  function closeModal() { setModal(null); }

  async function save() {
    if (!modal) return;
    if (!form.title.trim()) { window.alert("Cần nhập tên đầu việc."); return; }
    setSaving(true);
    try {
      const isEdit = modal.mode === "edit";
      const res = await fetch(isEdit ? `/api/emr/timeline-milestones/${modal.target!.id}` : "/api/emr/timeline-milestones", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? form : { ...form, parent_id: modal.mode === "create-child" ? modal.parentId : null }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không lưu được.");
      closeModal();
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(target: Milestone) {
    const hasChildren = !target.parent_id && (childrenOf[target.id] || []).length > 0;
    const confirmMsg = hasChildren ? `Xoá "${target.title}" và toàn bộ đầu việc con bên trong? Không thể hoàn tác.` : `Xoá "${target.title}"? Không thể hoàn tác.`;
    if (!window.confirm(confirmMsg)) return;
    try {
      const res = await fetch(`/api/emr/timeline-milestones/${target.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không xoá được.");
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    }
  }

  const ganttRows = useMemo(() => parents.map((p) => {
    const kids = childrenOf[p.id] || [];
    if (!kids.length) {
      return { label: p.title, start: p.start_date, end: p.end_date, progress: statusProgress(p.status), tone: statusTone(p.status) };
    }
    const starts = kids.map((k) => k.start_date).filter(Boolean).sort() as string[];
    const ends = kids.map((k) => k.end_date).filter(Boolean).sort() as string[];
    const done = kids.filter((k) => k.status === "DONE").length;
    const blocked = kids.some((k) => k.status === "BLOCKED");
    const progress = Math.round((done / kids.length) * 100);
    const tone = blocked ? "red" as const : progress === 100 ? "green" as const : progress > 0 ? "blue" as const : "slate" as const;
    return { label: `${p.title} (${kids.length})`, start: p.start_date || starts[0] || null, end: p.end_date || ends[ends.length - 1] || null, progress, tone };
  }), [parents, childrenOf]);

  return (
    <section className="panel">
      <div className="toolbar" style={{ padding: "14px 16px 4px" }}>
        <div className="toolbar-left"><strong>Đầu việc dự án (khai báo thủ công)</strong></div>
        {canManage ? <button type="button" className="button primary small" onClick={openCreateParent}>+ Thêm đầu việc lớn</button> : null}
      </div>
      {error ? <div className="alert error">{error}</div> : null}
      {loading ? (
        <div className="empty-state">Đang tải...</div>
      ) : !parents.length ? (
        <div className="empty-state">Chưa khai báo đầu việc nào.{canManage ? <> Bấm &quot;+ Thêm đầu việc lớn&quot; để bắt đầu.</> : null}</div>
      ) : (
        <>
          {ganttRows.length ? <TqmGantt year={year} rows={ganttRows} /> : null}
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th style={{ width: 30 }}></th><th>Đầu việc</th><th>Bắt đầu</th><th>Kết thúc</th><th>Trạng thái</th><th></th></tr></thead>
              <tbody>
                {parents.map((p) => {
                  const kids = childrenOf[p.id] || [];
                  const isOpen = expanded.has(p.id);
                  return (
                    <Fragment key={p.id}>
                      <tr>
                        <td>{kids.length ? <button type="button" className="icon-button" onClick={() => toggleExpanded(p.id)} aria-expanded={isOpen} aria-label={isOpen ? "Thu gọn" : "Mở rộng"}>{isOpen ? "▾" : "▸"}</button> : null}</td>
                        <td><strong>{p.title}</strong>{kids.length ? <small> ({kids.length} đầu việc con)</small> : null}</td>
                        <td>{p.start_date || "—"}</td>
                        <td>{p.end_date || "—"}</td>
                        <td><span className={`status-badge ${p.status === "DONE" ? "success" : p.status === "BLOCKED" ? "danger" : p.status === "IN_PROGRESS" ? "warning" : "muted"}`}>{EMR_STATUS_LABELS[p.status] || p.status}</span></td>
                        <td style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          {canManage ? <>
                            <button type="button" className="button tertiary small" onClick={() => openCreateChild(p.id)}>+ Đầu việc con</button>
                            <button type="button" className="button tertiary small" onClick={() => openEdit(p)}>Sửa</button>
                            <button type="button" className="button tertiary small" onClick={() => remove(p)}>Xoá</button>
                          </> : null}
                        </td>
                      </tr>
                      {isOpen ? kids.map((k) => (
                        <tr key={k.id} className="emr-timeline-child-row">
                          <td></td>
                          <td style={{ paddingLeft: 28 }}>↳ {k.title}</td>
                          <td>{k.start_date || "—"}</td>
                          <td>{k.end_date || "—"}</td>
                          <td><span className={`status-badge ${k.status === "DONE" ? "success" : k.status === "BLOCKED" ? "danger" : k.status === "IN_PROGRESS" ? "warning" : "muted"}`}>{EMR_STATUS_LABELS[k.status] || k.status}</span></td>
                          <td style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            {canManage ? <>
                              <button type="button" className="button tertiary small" onClick={() => openEdit(k)}>Sửa</button>
                              <button type="button" className="button tertiary small" onClick={() => remove(k)}>Xoá</button>
                            </> : null}
                          </td>
                        </tr>
                      )) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {canManage && modal ? (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>{modal.mode === "edit" ? "Sửa đầu việc" : modal.mode === "create-child" ? "Thêm đầu việc con" : "Thêm đầu việc lớn"}</h3></div>
            <div className="modal-body">
              <label>Tên đầu việc *<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
              <label>Bắt đầu<input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></label>
              <label>Kết thúc<input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></label>
              <label>Trạng thái
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(EMR_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>
            <div className="modal-footer">
              <button type="button" className="button tertiary" onClick={closeModal} disabled={saving}>Huỷ</button>
              <button type="button" className="button primary" onClick={save} disabled={saving}>{saving ? "Đang lưu..." : "Lưu"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
