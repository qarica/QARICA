"use client";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useEmrCreateSignal } from "@/components/emr-create-context";
import { Icon } from "@/components/icon";
import { categoriesReferencing, EMR_CATEGORIES, EMR_CATEGORY_FIELDS, EMR_CATEGORY_KPIS, EMR_STATUS_LABELS, formatBooleanValue, formatSequenceValue, sequenceSteps, SEQUENCE_SEPARATOR, type EmrCategoryCode, type EmrKpiBucket } from "@/lib/emr-categories";

type Item = { id: string; category: string; title: string; description: string | null; status: string; department_ids:string[]; owner_department_id:string|null; due_date: string | null; priority: string; is_go_live_gate: boolean; evidence_url: string | null; verified_at: string | null; verified_by: string | null; details: Record<string, unknown>; created_at: string; updated_at: string };

function toggleId(ids: string[], id: string) { return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]; }

const KPI_TONE: Record<EmrKpiBucket, string> = { TOTAL: "blue", DONE: "green", IN_PROGRESS: "amber", TODO: "slate", BLOCKED: "red", OVERDUE: "red", CERT_VALID: "green", CERT_EXPIRING: "amber", CERT_EXPIRED: "red" };
const KPI_ICON: Record<EmrKpiBucket, string> = { TOTAL: "list-checks", DONE: "badge-check", IN_PROGRESS: "refresh-cw", TODO: "calendar-days", BLOCKED: "circle-alert", OVERDUE: "triangle-alert", CERT_VALID: "shield-check", CERT_EXPIRING: "triangle-alert", CERT_EXPIRED: "circle-alert" };

function todayHcm() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()); }
function addDays(date: string, days: number) { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }

function bucketCount(bucket: EmrKpiBucket, items: Item[], hasBlockedBucket: boolean): number {
  const today = todayHcm();
  switch (bucket) {
    case "TOTAL": return items.length;
    case "DONE": return items.filter((i) => i.status === "DONE").length;
    case "IN_PROGRESS": return items.filter((i) => i.status === "IN_PROGRESS").length;
    case "TODO": return items.filter((i) => i.status === "TODO" || (!hasBlockedBucket && i.status === "BLOCKED")).length;
    case "BLOCKED": return items.filter((i) => i.status === "BLOCKED").length;
    case "OVERDUE": return items.filter((i) => i.status !== "DONE" && i.due_date && i.due_date < today).length;
    case "CERT_VALID": return items.filter((i) => { const exp = i.details?.certificate_expiry; return exp && String(exp) >= today; }).length;
    case "CERT_EXPIRING": return items.filter((i) => { const exp = i.details?.certificate_expiry; if (!exp) return false; const value = String(exp); return value >= today && value <= addDays(today, 30); }).length;
    case "CERT_EXPIRED": return items.filter((i) => { const exp = i.details?.certificate_expiry; return exp && String(exp) < today; }).length;
    default: return 0;
  }
}

export function EmrCategoryClient({ categoryCode, categoryLabel, canManage, descriptionLabel }: { categoryCode: string; categoryLabel: string; canManage: boolean; descriptionLabel?: string }) {
  const descLabel = descriptionLabel || "Mô tả";
  const extraFields = EMR_CATEGORY_FIELDS[categoryCode as keyof typeof EMR_CATEGORY_FIELDS] || [];
  const beforeTitleFields = extraFields.filter((f) => f.showBeforeTitle);
  const afterTitleFields = extraFields.filter((f) => !f.showBeforeTitle);
  // A category with many fields turns into an unreadable wall of table
  // columns — compact fields stay fully editable in the modal but only show
  // in a per-row expandable "Chi tiết" panel instead of their own column.
  const columnFields = afterTitleFields.filter((f) => !f.compact && !f.hideFromGrid);
  const detailFields = afterTitleFields.filter((f) => f.compact && !f.hideFromGrid);
  // A category whose fields mix static reference info (e.g. Biểu mẫu's mã
  // biểu mẫu/nguồn tham chiếu/tình trạng số hóa) with rollout-tracking fields
  // (giai đoạn triển khai, yêu cầu đào tạo) gets a "Thông tin" / "Tiến độ
  // triển khai" tab switcher so the grid doesn't force both concerns onto one
  // screen — generic: a category with no progressField fields (the default)
  // renders exactly as before, no switcher, nothing hidden.
  const infoColumns = columnFields.filter((f) => !f.progressField);
  const progressColumns = columnFields.filter((f) => f.progressField);
  const hasProgressSplit = progressColumns.length > 0;
  const [view, setView] = useState<"info" | "progress">("info");
  const showDescription = !(hasProgressSplit && view === "progress");
  const showPriorityDueStatus = !(hasProgressSplit && view === "info");
  const visibleInfoColumns = hasProgressSplit && view === "progress" ? [] : infoColumns;
  const visibleProgressColumns = hasProgressSplit && view === "info" ? [] : progressColumns;
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  function toggleExpanded(id: string) { setExpandedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  // Forward: this category's own fields that point at another category's
  // items (e.g. Lỗi's "Biểu mẫu liên quan"). Reverse: other categories whose
  // fields point back AT this one (e.g. Biểu mẫu learning that Lỗi links to
  // it), so a form's row can surface "N lỗi liên quan" without Biểu mẫu's
  // config knowing Lỗi exists beyond that one declared reference.
  const referenceFields = extraFields.filter((f) => f.type === "reference" && f.referenceCategory);
  const incomingReferences = categoriesReferencing(categoryCode as EmrCategoryCode);
  // DAO_TAO's reverse reference is rendered as the "Tạo/Duyệt đào tạo" link
  // right in the training_required cell instead of a generic "N liên quan"
  // column, so it isn't shown twice.
  const genericIncomingReferences = incomingReferences.filter((r) => r.category !== "DAO_TAO");
  const [refItems, setRefItems] = useState<Record<string, { id: string; title: string; details: Record<string, unknown> }[]>>({});
  const slugForCode = (code: string) => EMR_CATEGORIES.find((c) => c.code === code)?.slug || "";
  const categoryLabelFor = (code: string) => EMR_CATEGORIES.find((c) => c.code === code)?.label || code;
  const kpis = EMR_CATEGORY_KPIS[categoryCode as EmrCategoryCode] || [];
  const hasBlockedBucket = kpis.some((k) => k.bucket === "BLOCKED");
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  // "default" keeps the API's own order (newest first, i.e. STT/creation
  // order as loaded) — clicking the Tiêu đề header cycles STT -> A-Z -> Z-A.
  const [titleSort, setTitleSort] = useState<"default" | "asc" | "desc">("default");
  function cycleTitleSort() { setTitleSort((s) => (s === "default" ? "asc" : s === "asc" ? "desc" : "default")); }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);
  const emptyDetails = () => Object.fromEntries(extraFields.map((f) => [f.key, ""])) as Record<string, string>;
  const [form, setForm] = useState({ title: "", description: "", status: "TODO", priority: "MEDIUM", due_date: "", department_ids:[] as string[], owner_department_id:"", is_go_live_gate: false, evidence_url: "", verify_completed:false, details: emptyDetails() });
  const [saving, setSaving] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [departments,setDepartments]=useState<{id:string;name:string;short_name:string|null}[]>([]);

  // Every post-save refresh (create/edit/delete/upload) used to flip `loading`
  // back to true each time, unmounting the whole table for a moment — on
  // mobile that reset the page's scroll to the top after every single tick.
  // `silent` keeps the current table on screen while the refetch resolves.
  async function load(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/emr/items?category=${encodeURIComponent(categoryCode)}`);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không tải được dữ liệu.");
      setItems(json.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    fetch("/api/emr/options").then(r=>r.json()).then(j=>{if(j.ok){setDepartments(j.departments||[])}}).catch(()=>{});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryCode]);

  useEffect(() => {
    const relatedCodes = Array.from(new Set([
      ...referenceFields.map((f) => f.referenceCategory as string),
      ...incomingReferences.map((r) => r.category as string),
    ]));
    if (!relatedCodes.length) { setRefItems({}); return; }
    let cancelled = false;
    Promise.all(relatedCodes.map((code) =>
      fetch(`/api/emr/items?category=${encodeURIComponent(code)}`).then((r) => r.json()).then((j) => [code, j.ok ? j.items : []] as const).catch(() => [code, []] as const)
    )).then((results) => { if (!cancelled) setRefItems(Object.fromEntries(results)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryCode]);

  function openCreate() {
    setForm({ title: "", description: "", status: "TODO", priority: "MEDIUM", due_date: "", department_ids:[], owner_department_id:"", is_go_live_gate: false, evidence_url: "", verify_completed:false, details: emptyDetails() });
    setPendingFile(null);
    setCreating(true);
    setEditing(null);
  }

  const { openSignal } = useEmrCreateSignal();
  useEffect(() => {
    if (openSignal > 0) openCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);

  // Lets another category's row (e.g. Biểu mẫu's "Cần đào tạo") deep-link
  // into THIS category's create modal with a reference field already set —
  // generic for any category/reference field, not hardcoded to Đào tạo:
  // ?ref_field=<a declared field key>&ref_id=<source item id>&ref_title=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refField = params.get("ref_field");
    const refId = params.get("ref_id");
    if (refField && refId && extraFields.some((f) => f.key === refField)) {
      setForm({ title: params.get("ref_title") || "", description: "", status: "TODO", priority: "MEDIUM", due_date: "", department_ids: [], owner_department_id: "", is_go_live_gate: false, evidence_url: "", verify_completed: false, details: { ...emptyDetails(), [refField]: refId } });
      setPendingFile(null);
      setCreating(true);
      setEditing(null);
      window.history.replaceState(null, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openEdit(item: Item) {
    const details: Record<string, string> = {};
    for (const f of extraFields) details[f.key] = item.details?.[f.key] != null ? String(item.details[f.key]) : "";
    setForm({ title: item.title, description: item.description || "", status: item.status, priority: item.priority || "MEDIUM", due_date: item.due_date || "", department_ids: item.department_ids || [], owner_department_id:item.owner_department_id||"", is_go_live_gate: !!item.is_go_live_gate, evidence_url: item.evidence_url || "", verify_completed:!!item.verified_at, details });
    setEditing(item);
    setCreating(false);
  }

  function closeModal() {
    setCreating(false);
    setEditing(null);
  }

  async function save() {
    if (!form.title.trim()) {
      window.alert("Cần nhập tiêu đề.");
      return;
    }
    setSaving(true);
    try {
      const isEdit = !!editing;
      const res = await fetch(isEdit ? `/api/emr/items/${editing!.id}` : "/api/emr/items", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? form : { ...form, category: categoryCode }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không lưu được.");
      if (!isEdit && pendingFile && json.item?.id) {
        await uploadFile(json.item.id, pendingFile);
      }
      closeModal();
      await load({ silent: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: Item) {
    if (!window.confirm(`Xoá "${item.title}"? Không thể hoàn tác.`)) return;
    try {
      const res = await fetch(`/api/emr/items/${item.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không xoá được.");
      await load({ silent: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    }
  }

  async function viewFile(item: Item) {
    try {
      const res = await fetch(`/api/emr/items/${item.id}/file`);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không mở được file.");
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    }
  }

  const [uploading, setUploading] = useState(false);
  async function uploadFile(itemId: string, file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/emr/items/${itemId}/file`, { method: "POST", body });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không tải lên được.");
      await load({ silent: true });
      setEditing((prev) => (prev && prev.id === itemId ? { ...prev, details: { ...prev.details, file_name: json.file_name } } : prev));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setUploading(false);
    }
  }

  async function removeFile(itemId: string) {
    if (!window.confirm("Xoá file đính kèm này?")) return;
    try {
      const res = await fetch(`/api/emr/items/${itemId}/file`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không xoá được file.");
      await load({ silent: true });
      setEditing((prev) => { if (!prev || prev.id !== itemId) return prev; const d = { ...prev.details }; delete d.file_name; delete d.file_path; return { ...prev, details: d }; });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    }
  }

  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase();
    const rows = text ? items.filter((i) => `${i.title} ${i.description || ""}`.toLowerCase().includes(text)) : items;
    if (titleSort === "default") return rows;
    return [...rows].sort((a, b) => titleSort === "asc" ? a.title.localeCompare(b.title, "vi") : b.title.localeCompare(a.title, "vi"));
  }, [items, search, titleSort]);

  // Shared by both the regular table columns and the compact-fields detail
  // panel, so the two never render a field differently.
  function fieldDisplayContent(f: (typeof extraFields)[number], item: Item) {
    const value = item.details?.[f.key];
    const hasValue = value != null && value !== "";
    if (f.type === "reference" && f.referenceCategory) {
      const target = hasValue ? (refItems[f.referenceCategory] || []).find((r) => r.id === value) : null;
      return target ? <Link className="table-link" href={`/emr/${slugForCode(f.referenceCategory)}`}>{target.title}</Link> : "—";
    }
    if (f.type === "sequence") {
      const steps = sequenceSteps(value);
      return steps.length ? <>{formatSequenceValue(value)}<div><small>{steps.length} chữ ký</small></div></> : "—";
    }
    if (f.type === "boolean") {
      const isTrue = value === "true";
      return <>{formatBooleanValue(value)}{f.key === "patient_portal_visible" && isTrue ? <div><Link className="table-link" href="/emr/patient-portal">Xem Patient Portal →</Link></div> : null}</>;
    }
    // A form marked "Cần đào tạo" can spawn a pre-filled nhiệm vụ đào tạo in
    // Đào tạo (no re-typing the form name) — or, once one already exists,
    // link straight to it so the trainer just needs to approve/update it.
    if (f.key === "training_required" && value === "Cần đào tạo") {
      const trainingRef = incomingReferences.find((r) => r.category === "DAO_TAO");
      const existing = trainingRef ? (refItems.DAO_TAO || []).find((r) => r.details?.[trainingRef.field.key] === item.id) : null;
      const href = existing ? "/emr/dao-tao" : trainingRef ? `/emr/dao-tao?ref_field=${trainingRef.field.key}&ref_id=${item.id}&ref_title=${encodeURIComponent(item.title)}` : "/emr/dao-tao";
      return <>{String(value)}<div><Link className="table-link" href={href}>{existing ? "Duyệt đào tạo →" : "Tạo nhiệm vụ đào tạo →"}</Link></div></>;
    }
    return hasValue ? String(value) : "—";
  }

  return (
    <div className="page-stack">
      {kpis.length ? <section className="kpis" style={{ display: "grid", gridTemplateColumns: `repeat(${kpis.length},minmax(0,1fr))`, gap: 12 }}>
        {kpis.map((k) => <article className="kpi-card" key={k.bucket} style={{ background: "#fff", border: "1px solid #e5eaf2", borderRadius: 14, padding: 16, boxShadow: "0 1px 2px rgba(15,23,42,.03)", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span className={`emr-cat-kpi-icon ${KPI_TONE[k.bucket]}`}><Icon name={KPI_ICON[k.bucket]} size={19} /></span>
          <div><div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a" }}>{bucketCount(k.bucket, items, hasBlockedBucket)}</div>
          <div style={{ fontSize: 12.5, color: "#475569", fontWeight: 600, marginTop: 2 }}>{k.label}</div></div>
        </article>)}
        <style>{`.emr-cat-kpi-icon{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex:0 0 auto}.emr-cat-kpi-icon.blue{background:#dbeafe;color:#2563eb}.emr-cat-kpi-icon.green{background:#dcfce7;color:#16a34a}.emr-cat-kpi-icon.amber{background:#fef3c7;color:#b45309}.emr-cat-kpi-icon.red{background:#fee2e2;color:#dc2626}.emr-cat-kpi-icon.slate{background:#e2e8f0;color:#475569}`}</style>
      </section> : null}
      <div className="toolbar" style={{ padding: "0 0 4px" }}>
        <div className="toolbar-left"><div className="search-box"><Icon name="search" size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Tìm trong ${categoryLabel.toLowerCase()}...`} /></div></div>
        {hasProgressSplit ? (
          <div className="toolbar-right" style={{ display: "flex", gap: 6 }}>
            <button type="button" className={`button ${view === "info" ? "primary" : "tertiary"} small`} onClick={() => setView("info")}>Thông tin {categoryLabel.toLowerCase()}</button>
            <button type="button" className={`button ${view === "progress" ? "primary" : "tertiary"} small`} onClick={() => setView("progress")}>Tiến độ triển khai</button>
          </div>
        ) : null}
      </div>
      {error ? <div className="alert error">{error}</div> : null}
      {loading ? (
        <div className="empty-state">Đang tải...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">Chưa có mục nào trong &quot;{categoryLabel}&quot;.{canManage ? <> Bấm &quot;+ Thêm mục&quot; để tạo mới.</> : null}</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">Không tìm thấy mục phù hợp với &quot;{search}&quot;.</div>
      ) : (
        <div className="panel">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th style={{ width: 30 }}></th><th>#</th>{beforeTitleFields.map((f)=><th key={f.key}>{f.label}</th>)}<th><button type="button" onClick={cycleTitleSort} title="Sắp xếp theo STT hoặc A-Z" style={{display:"flex",alignItems:"center",gap:4,background:"none",border:0,padding:0,margin:0,font:"inherit",color:"inherit",cursor:"pointer"}}>Tiêu đề <span aria-hidden="true">{titleSort==="asc"?"▲":titleSort==="desc"?"▼":"⇅"}</span></button></th>{showDescription?<th>{descLabel}</th>:null}{visibleInfoColumns.map((f)=><th key={f.key}>{f.label}</th>)}{visibleProgressColumns.map((f)=><th key={f.key}>{f.label}</th>)}{showPriorityDueStatus?<><th>Ưu tiên</th><th>Hạn</th><th>Trạng thái triển khai</th></>:null}<th></th></tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => (
                  <Fragment key={item.id}>
                  <tr>
                    <td><button type="button" className="icon-button" onClick={() => toggleExpanded(item.id)} aria-label={expandedIds.has(item.id) ? "Thu gọn chi tiết" : "Xem chi tiết"} aria-expanded={expandedIds.has(item.id)}>{expandedIds.has(item.id) ? "▾" : "▸"}</button></td>
                    <td>{idx + 1}</td>
                    {beforeTitleFields.map((f)=><td key={f.key}>{item.details?.[f.key]!=null&&item.details[f.key]!==""?String(item.details[f.key]):"—"}</td>)}
                    <td><strong>{item.title}</strong></td>
                    {showDescription?<td>{item.description || "—"}{item.is_go_live_gate ? <div><small>Go-live gate</small></div> : null}</td>:null}
                    {visibleInfoColumns.map((f)=><td key={f.key}>{fieldDisplayContent(f, item)}</td>)}
                    {visibleProgressColumns.map((f)=><td key={f.key}>{fieldDisplayContent(f, item)}</td>)}
                    {showPriorityDueStatus?<>
                    <td><span className={`status-badge ${item.priority==="CRITICAL"?"danger":item.priority==="HIGH"?"warning":"muted"}`}>{{LOW:"Thấp",MEDIUM:"Trung bình",HIGH:"Cao",CRITICAL:"Nghiêm trọng"}[item.priority]||item.priority}</span></td><td>{item.due_date || "—"}</td>
                    <td>{EMR_STATUS_LABELS[item.status] || item.status}{item.verified_at ? <div><small>Đã xác minh</small></div> : null}</td>
                    </>:null}
                    <td style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>{canManage ? <>
                      <button type="button" className="button tertiary small" onClick={() => openEdit(item)}>Sửa</button>
                      <button type="button" className="button tertiary small" onClick={() => remove(item)}>Xoá</button>
                    </> : <small>Chỉ xem</small>}</td>
                  </tr>
                  {expandedIds.has(item.id) ? (
                    <tr>
                      <td colSpan={20}>
                        <div className="emr-detail-grid">
                          {detailFields.map((f) => <div key={f.key}><label>{f.label}</label><div>{fieldDisplayContent(f, item)}</div></div>)}
                          {genericIncomingReferences.map((ref) => {
                            const count = (refItems[ref.category]||[]).filter((r)=>r.details?.[ref.field.key]===item.id).length;
                            return <div key={ref.category}><label>{categoryLabelFor(ref.category)} liên quan</label><div>{count ? <Link className="table-link" href={`/emr/${slugForCode(ref.category)}`}>{count} {categoryLabelFor(ref.category).toLowerCase()} →</Link> : <Link className="table-link" href={`/emr/${slugForCode(ref.category)}`}>Ghi nhận →</Link>}</div></div>;
                          })}
                          <div><label>Tệp đính kèm</label><div>{item.details?.file_name ? <button type="button" className="button tertiary small" onClick={() => viewFile(item)}>📎 {String(item.details.file_name)}</button> : "—"}</div></div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canManage && (creating || editing) ? (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>{editing ? "Sửa mục" : `Thêm mục ${categoryLabel.toLowerCase()}`}</h3></div>
            <div className="modal-body">
              <label>Tiêu đề *
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </label>
              <label>{descLabel}
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
              </label>
              {extraFields.filter((f) => !f.pairWithStatus).map((f) => (
                f.type === "boolean" ? (
                  <div key={f.key}>
                    <label className="inline-check">
                      <input
                        type="checkbox"
                        checked={form.details[f.key] === "true"}
                        onChange={(e) => setForm({ ...form, details: { ...form.details, [f.key]: e.target.checked ? "true" : "false" } })}
                      /> {f.label}
                    </label>
                    {f.key === "patient_portal_visible" && form.details[f.key] === "true" ? <Link className="table-link" href="/emr/patient-portal">Xem Patient Portal →</Link> : null}
                  </div>
                ) : f.type === "sequence" ? (
                  <fieldset key={f.key}>
                    <legend>{f.label} {(() => { const n = sequenceSteps(form.details[f.key]).length; return n ? <span className="status-badge muted">{n} chữ ký</span> : null; })()}</legend>
                    <div className="sequence-steps">
                      {sequenceSteps(form.details[f.key]).map((step, i, steps) => (
                        <div className="sequence-step-row" key={i}>
                          <span className="sequence-step-no">{i + 1}</span>
                          <select
                            value={step}
                            onChange={(e) => {
                              const next = [...steps];
                              next[i] = e.target.value;
                              setForm({ ...form, details: { ...form.details, [f.key]: next.join(SEQUENCE_SEPARATOR) } });
                            }}
                          >
                            <option value="">— Chọn —</option>
                            {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                          <button type="button" className="button tertiary small" disabled={i === 0} onClick={() => {
                            const next = [...steps];
                            [next[i - 1], next[i]] = [next[i], next[i - 1]];
                            setForm({ ...form, details: { ...form.details, [f.key]: next.join(SEQUENCE_SEPARATOR) } });
                          }}>↑</button>
                          <button type="button" className="button tertiary small" disabled={i === steps.length - 1} onClick={() => {
                            const next = [...steps];
                            [next[i + 1], next[i]] = [next[i], next[i + 1]];
                            setForm({ ...form, details: { ...form.details, [f.key]: next.join(SEQUENCE_SEPARATOR) } });
                          }}>↓</button>
                          <button type="button" className="button tertiary small" onClick={() => {
                            const next = steps.filter((_, idx) => idx !== i);
                            setForm({ ...form, details: { ...form.details, [f.key]: next.join(SEQUENCE_SEPARATOR) } });
                          }}>Xoá bước</button>
                        </div>
                      ))}
                    </div>
                    <button type="button" className="button secondary small" onClick={() => {
                      const next = [...sequenceSteps(form.details[f.key]), (f.options || [])[0] || ""];
                      setForm({ ...form, details: { ...form.details, [f.key]: next.join(SEQUENCE_SEPARATOR) } });
                    }}>+ Thêm bước ký</button>
                  </fieldset>
                ) : f.type === "multiselect" ? (
                  <fieldset key={f.key}>
                    <legend>{f.label}</legend>
                    <div className="check-grid emr-role-check-grid">
                      {(f.options || []).map((o) => {
                        const selected = (form.details[f.key] || "").split(",").map((s) => s.trim()).filter(Boolean);
                        return (
                          <label className="check-card emr-role-check-card" key={o}>
                            <input
                              type="checkbox"
                              checked={selected.includes(o)}
                              onChange={(e) => {
                                const next = e.target.checked ? [...selected, o] : selected.filter((v) => v !== o);
                                setForm({ ...form, details: { ...form.details, [f.key]: next.join(", ") } });
                              }}
                            />
                            <span><strong>{o}</strong></span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ) : (
                  <label key={f.key}>{f.label}
                    {f.type === "select" ? (
                      <>
                        <select value={form.details[f.key] || ""} onChange={(e) => setForm({ ...form, details: { ...form.details, [f.key]: e.target.value } })}>
                          <option value="">— Chưa chọn —</option>
                          {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                        {f.key==="training_required" && form.details[f.key]==="Cần đào tạo" ? <Link className="table-link" href="/emr/dao-tao">Xem danh mục Đào tạo →</Link> : null}
                      </>
                    ) : f.type === "reference" && f.referenceCategory ? (
                      <select value={form.details[f.key] || ""} onChange={(e) => setForm({ ...form, details: { ...form.details, [f.key]: e.target.value } })}>
                        <option value="">— Chưa chọn —</option>
                        {(refItems[f.referenceCategory] || []).map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                      </select>
                    ) : f.type === "textarea" ? (
                      <textarea
                        value={form.details[f.key] || ""}
                        onChange={(e) => setForm({ ...form, details: { ...form.details, [f.key]: e.target.value } })}
                        rows={3}
                      />
                    ) : (
                      <input
                        type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                        value={form.details[f.key] || ""}
                        onChange={(e) => setForm({ ...form, details: { ...form.details, [f.key]: e.target.value } })}
                      />
                    )}
                  </label>
                )
              ))}

              <label>Tệp đính kèm (biểu mẫu, chứng thư, minh chứng...)
                {editing ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    {editing.details?.file_name ? (
                      <>
                        <button type="button" className="button tertiary small" onClick={() => viewFile(editing)}>📎 Xem: {String(editing.details.file_name)}</button>
                        <button type="button" className="button tertiary small" onClick={() => removeFile(editing.id)} disabled={uploading}>Xoá file</button>
                      </>
                    ) : (
                      <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx" disabled={uploading}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(editing.id, f); }} />
                    )}
                    {uploading ? <small>Đang tải lên...</small> : null}
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx"
                      onChange={(e) => setPendingFile(e.target.files?.[0] || null)} />
                    {pendingFile ? <small>Đã chọn: {pendingFile.name}</small> : null}
                  </div>
                )}
              </label>

              <label>Trạng thái triển khai
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(EMR_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              {extraFields.filter((f) => f.pairWithStatus).map((f) => (
                <label key={f.key}>{f.label}
                  <select value={form.details[f.key] || ""} onChange={(e) => setForm({ ...form, details: { ...form.details, [f.key]: e.target.value } })}>
                    <option value="">— Chưa chọn —</option>
                    {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
              ))}
              <label>Mức ưu tiên
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="LOW">Thấp</option><option value="MEDIUM">Trung bình</option><option value="HIGH">Cao</option><option value="CRITICAL">Nghiêm trọng</option></select>
              </label>
              <fieldset>
                <legend>Khoa/phòng — Phạm vi áp dụng</legend>
                {departments.length ? (
                  <div className="department-checks">
                    {departments.map((d) => (
                      <label key={d.id}>
                        <input
                          type="checkbox"
                          checked={form.department_ids.includes(d.id)}
                          onChange={() => setForm({ ...form, department_ids: toggleId(form.department_ids, d.id) })}
                        /> {d.short_name || d.name}
                      </label>
                    ))}
                  </div>
                ) : null}
                <small>Không chọn khoa/phòng nào nghĩa là áp dụng toàn viện. Chọn một hoặc nhiều khoa/phòng cụ thể nếu hạng mục không áp dụng cho toàn viện.</small>
              </fieldset>
              <label>Đơn vị phụ trách<select value={form.owner_department_id} onChange={(e)=>setForm({...form,owner_department_id:e.target.value})}><option value="">— Chưa gán —</option>{departments.map(d=><option key={d.id} value={d.id}>{d.short_name||d.name}</option>)}</select></label>
              <label>Hạn hoàn thành<input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></label>
              <label className="inline-check"><input type="checkbox" checked={form.is_go_live_gate} onChange={(e) => setForm({ ...form, is_go_live_gate: e.target.checked })} /> Điều kiện bắt buộc trước Go-live</label>
              <label>Minh chứng / liên kết xác minh<input value={form.evidence_url} onChange={(e) => setForm({ ...form, evidence_url: e.target.value, verify_completed:false })} placeholder="URL hoặc tham chiếu minh chứng" /></label>
              {editing&&form.status==="DONE"&&form.evidence_url?<label className="inline-check"><input type="checkbox" checked={form.verify_completed} onChange={(e)=>setForm({...form,verify_completed:e.target.checked})}/> Xác minh hoàn thành dựa trên minh chứng</label>:null}
            </div>
            <div className="modal-footer">
              <button type="button" className="button tertiary" onClick={closeModal} disabled={saving}>Huỷ</button>
              <button type="button" className="button primary" onClick={save} disabled={saving}>{saving ? "Đang lưu..." : "Lưu"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
