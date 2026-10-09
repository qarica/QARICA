"use client";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useEmrCreateSignal } from "@/components/emr-create-context";
import { Icon } from "@/components/icon";
import { categoriesReferencing, EMR_CATEGORIES, EMR_CATEGORY_FIELDS, EMR_CATEGORY_KPIS, EMR_STATUS_LABELS, formatBooleanValue, formatSequenceStep, formatSequenceValue, parseSequenceStep, sequenceSteps, SEQUENCE_SEPARATOR, SEQUENCE_STEP_METHOD_SEPARATOR, type EmrCategoryCode, type EmrKpiBucket } from "@/lib/emr-categories";

type Item = { id: string; category: string; title: string; description: string | null; status: string; department_ids:string[]; owner_department_id:string|null; due_date: string | null; priority: string; is_go_live_gate: boolean; evidence_url: string | null; verified_at: string | null; verified_by: string | null; details: Record<string, unknown>; publish_status: string; published_at: string | null; published_by: string | null; created_at: string; updated_at: string };

function toggleId(ids: string[], id: string) { return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]; }

// Trình tự ký lưu "vai trò::phương thức" nối bằng " → " giữa các bước
// (xem parseSequenceStep/formatSequenceStep) — ô nhập tự do "Khác" không
// được chứa đúng 2 chuỗi phân tách này, nếu không bước sẽ bị tách sai khi
// đọc lại (vd ai đó gõ "BS trực::ca đêm" sẽ bị hiểu nhầm method="ca đêm").
function sanitizeCustomRole(value: string): string {
  return value.split(SEQUENCE_STEP_METHOD_SEPARATOR).join(" ").split(SEQUENCE_SEPARATOR).join(" ").replace(/\s+/g, " ").trim();
}

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
  // Lấy đúng danh sách lựa chọn đã khai báo cho record_types thay vì liệt kê
  // lại — 1 nguồn duy nhất cho options của field này.
  const recordTypeOptions = extraFields.find((f) => f.key === "record_types")?.options || [];
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
  // Forward: this category's own fields that point at another category's
  // items (e.g. Lỗi's "Biểu mẫu liên quan"). Reverse: other categories whose
  // fields point back AT this one (e.g. Biểu mẫu learning that Lỗi links to
  // it), so a form's row can surface "N lỗi liên quan" without Biểu mẫu's
  // config knowing Lỗi exists beyond that one declared reference.
  const referenceFields = extraFields.filter((f) => f.type === "reference" && f.referenceCategory);
  const incomingReferences = categoriesReferencing(categoryCode as EmrCategoryCode);
  // DAO_TAO's reverse reference is rendered as the "Tạo/Duyệt đào tạo" link
  // right in the training_required cell instead of a generic "N liên quan"
  // column, so it isn't shown twice. LOI's reverse reference is likewise
  // excluded here since it now has its own "Lỗi & Ghi chú" tab (xem
  // hasNotesSplit/loiReference bên dưới) — without this exclusion, the
  // "▸ Xem chi tiết" detail panel (which renders regardless of which tab is
  // active) would duplicate the same "N lỗi liên quan" link the tab already
  // shows.
  const genericIncomingReferences = incomingReferences.filter((r) => r.category !== "DAO_TAO" && r.category !== "LOI");
  // Yêu cầu thực tế: "Anh cần 1 nút để xem lỗi và ghi chú" rồi "Nút lỗi và
  // ghi chú sẽ ngang hàng với các nút thông tin biểu mẫu, tiến độ ... để bấm
  // xem chứ ko phải nút con" — Lỗi liên quan (categoriesReferencing) và Ghi
  // chú (field "notes") giờ là MỘT TAB riêng ("Lỗi & Ghi chú", xem view
  // "notes" bên dưới) ngang hàng với "Thông tin .../Tiến độ triển khai",
  // không còn là nút nhỏ nằm trong cột hành động của từng dòng. Generic: tab
  // chỉ hiện khi danh mục thực sự có 1 trong 2 thứ này, không hard-code
  // riêng BIEU_MAU.
  const loiReference = incomingReferences.find((r) => r.category === "LOI");
  const hasNotesField = extraFields.some((f) => f.key === "notes");
  const hasNotesSplit = Boolean(loiReference) || hasNotesField;
  // "scope" is a third view mode, BIEU_MAU-only (see the toolbar button
  // below): a matrix of biểu mẫu × khoa/phòng replacing the per-item inline
  // "Khoa/phòng — Phạm vi áp dụng" fieldset in the create/edit modal for this
  // one category, so scope can be ticked across every form from one screen
  // instead of opening each item's modal individually.
  const hasTabs = hasProgressSplit || hasNotesSplit;
  const [view, setView] = useState<"info" | "progress" | "scope" | "notes">("info");
  const showDescription = !(hasProgressSplit && view === "progress") && view !== "notes";
  const showPriorityDueStatus = !(hasProgressSplit && view === "info") && view !== "notes";
  const visibleInfoColumns = (hasProgressSplit && view === "progress") || view === "notes" ? [] : infoColumns;
  const visibleProgressColumns = (hasProgressSplit && view === "info") || view === "notes" ? [] : progressColumns;
  const showNotesColumns = hasNotesSplit && view === "notes";
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  function toggleExpanded(id: string) { setExpandedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
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
  // Yêu cầu thực tế: "Bổ sung nút lọc biểu mẫu đã phát hành và chờ duyệt
  // phát hành" — chỉ áp dụng cho BIEU_MAU (các danh mục khác không có khái
  // niệm duyệt phát hành). Lọc trên `filtered` (sau search/sort), không đổi
  // `items` gốc — giữ nguyên các chỗ khác (KPI, ma trận...) vẫn đọc items đầy
  // đủ.
  const [publishFilter, setPublishFilter] = useState<"ALL" | "PUBLISHED" | "DRAFT">("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);
  const emptyDetails = () => Object.fromEntries(extraFields.map((f) => [f.key, ""])) as Record<string, string>;
  const [form, setForm] = useState({ title: "", description: "", status: "TODO", priority: "MEDIUM", due_date: "", department_ids:[] as string[], owner_department_id:"", is_go_live_gate: false, evidence_url: "", verify_completed:false, details: emptyDetails() });
  const [saving, setSaving] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [departments,setDepartments]=useState<{id:string;name:string;short_name:string|null;department_type:string|null}[]>([]);
  // Ma trận "Phạm vi áp dụng" chỉ nói về việc biểu mẫu này dùng ở Khoa nào —
  // Phòng (quản lý/hỗ trợ, vd Ban Giám đốc, Phòng CNTT...) không có hoạt động
  // lâm sàng nên không bao giờ là nơi áp dụng biểu mẫu bệnh án. Loại trừ đúng
  // 2 loại đã biết (MANAGEMENT/SUPPORT, cùng tiêu chí với KPI "Khoa đã
  // Go-live" ở emr-command-center.tsx) thay vì chỉ nhận CLINICAL/PARACLINICAL
  // — khoa chưa kịp phân loại (department_type null) vẫn hiện trong ma trận
  // thay vì bị ẩn nhầm. CHỈ áp dụng cho ma trận này — fieldset "Khoa/phòng —
  // Phạm vi áp dụng" ở modal tạo/sửa (các danh mục khác BIEU_MAU) và ô "Đơn
  // vị phụ trách" vẫn hiện đủ Khoa lẫn Phòng, vì 1 hạng mục triển khai EMR có
  // thể do Phòng phụ trách dù không áp dụng tại Phòng đó.
  const NON_CLINICAL_DEPARTMENT_TYPES = useMemo(() => new Set(["MANAGEMENT", "SUPPORT"]), []);
  const clinicalDepartments = useMemo(
    () => departments.filter((d) => !NON_CLINICAL_DEPARTMENT_TYPES.has((d.department_type || "").trim().toUpperCase())),
    [departments, NON_CLINICAL_DEPARTMENT_TYPES],
  );
  // "Chọn tất cả khoa" từng dùng nút "Hoàn tác" phục hồi theo snapshot
  // department_ids ngay trước lúc bấm — gây bất ngờ khi snapshot đó đã có sẵn
  // một phần khoa được tick, khiến người dùng tưởng Hoàn tác chạy sai. Bỏ hẳn
  // cơ chế snapshot, thay bằng 1 cặp nút tường minh: "Chọn tất cả khoa" = tick
  // hết, "Bỏ chọn tất cả" = bỏ tick hết (yêu cầu tường minh của người dùng —
  // không phải "đặt lại mặc định rồi vẫn hiện tick hết"). Vì vậy BỎ quy ước
  // cũ "department_ids rỗng hiển thị như mọi ô đều tick" (vốn dùng để biểu thị
  // "toàn viện") — ma trận giờ hiển thị ĐÚNG theo department_ids: rỗng = mọi
  // ô bỏ tick, có id nào thì tick đúng id đó. "Toàn viện" (rỗng) vẫn giữ
  // nguyên Ý NGHĨA DỮ LIỆU ở mọi nơi khác đọc cột này (dashboard, "Việc của
  // tôi", tự tạo nhiệm vụ đào tạo...) — chỉ riêng CÁCH HIỂN THỊ trong ma trận
  // này đổi để khớp đúng kỳ vọng "bỏ chọn tất cả = bỏ tick tất cả".

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

  const relatedCodes = Array.from(new Set([
    ...referenceFields.map((f) => f.referenceCategory as string),
    ...incomingReferences.map((r) => r.category as string),
  ]));
  // Dùng lại sau mỗi lần lưu (vd Biểu mẫu "Cần đào tạo" vừa tự tạo xong nhiệm
  // vụ Đào tạo ở server) để link "Tạo nhiệm vụ đào tạo →" đổi ngay thành
  // "Duyệt đào tạo →" mà không cần người dùng tự tải lại trang.
  async function fetchRefItems() {
    if (!relatedCodes.length) return {};
    const results = await Promise.all(relatedCodes.map((code) =>
      fetch(`/api/emr/items?category=${encodeURIComponent(code)}`).then((r) => r.json()).then((j) => [code, j.ok ? j.items : []] as const).catch(() => [code, []] as const)
    ));
    return Object.fromEntries(results);
  }

  useEffect(() => {
    let cancelled = false;
    fetchRefItems().then((next) => { if (!cancelled) setRefItems(next); });
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
      // Biểu mẫu "Cần đào tạo" vừa tự tạo nhiệm vụ Đào tạo ở server (nếu có) —
      // nạp lại refItems để link đổi ngay thành "Duyệt đào tạo →".
      fetchRefItems().then(setRefItems);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setSaving(false);
    }
  }

  // Ma trận "Phạm vi áp dụng" (chỉ BIEU_MAU) hiển thị tick đúng theo
  // department_ids hiện có (xem giải thích ở khai báo clinicalDepartments) —
  // tick 1 ô = thêm đúng id đó vào danh sách, không còn "mặc định hiểu rỗng
  // là đã tick hết rồi mới trừ ra" như bản cũ.
  async function toggleScopeCell(item: Item, deptId: string) {
    const next = toggleId(item.department_ids, deptId);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, department_ids: next } : i)));
    try {
      const res = await fetch(`/api/emr/items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ department_ids: next }) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không lưu được.");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
      await load({ silent: true });
    }
  }

  // Nút tiện ích trên mỗi hàng: tick hết mọi khoa lâm sàng cho 1 biểu mẫu
  // thay vì bấm từng ô, lưu tường minh danh sách đầy đủ để khớp đúng cách
  // các checkbox khác đã xây (tick từng khoa một cũng ra danh sách tường
  // minh, không tự gộp về rỗng).
  async function selectAllDepartmentsForItem(item: Item) {
    const next = clinicalDepartments.map((d) => d.id);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, department_ids: next } : i)));
    try {
      const res = await fetch(`/api/emr/items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ department_ids: next }) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không lưu được.");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
      await load({ silent: true });
    }
  }

  // Nút ngược lại: đặt department_ids về rỗng — mặc định "toàn viện" (xem
  // fieldset gốc). KHÔNG dùng để biểu thị "không áp dụng khoa nào" — danh
  // sách rỗng vẫn có nghĩa là áp dụng cho MỌI khoa ở mọi nơi khác đọc cột
  // này (dashboard EMR, "Việc của tôi", tự tạo nhiệm vụ đào tạo...), nên ma
  // trận vẫn hiện tick hết sau khi bấm nút này nếu toàn bộ khoa lâm sàng đã
  // được chọn trước đó — đây là hành vi đúng, không phải lỗi không đổi.
  async function clearAllDepartmentsForItem(item: Item) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, department_ids: [] } : i)));
    try {
      const res = await fetch(`/api/emr/items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ department_ids: [] }) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không lưu được.");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
      await load({ silent: true });
    }
  }

  // Báo cáo thực tế: "Danh mục biểu mẫu còn thiếu duyệt phát hành hoặc cập
  // nhật. Sau khi duyệt mới triển khai, áp dụng, tiến độ" — biểu mẫu mới tạo
  // (hoặc vừa sửa nội dung) luôn ở Nháp, server chặn chuyển trạng thái triển
  // khai/gán phạm vi áp dụng cho tới khi bấm "Duyệt phát hành" ở đây.
  async function publishItem(item: Item) {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, publish_status: "PUBLISHED", published_at: now } : i)));
    try {
      const res = await fetch(`/api/emr/items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publish: true }) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không duyệt được.");
      await load({ silent: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
      await load({ silent: true });
    }
  }

  // Ma trận "Phạm vi loại hồ sơ" (chỉ BIEU_MAU, cùng màn hình "Phạm vi áp
  // dụng" với ma trận khoa/phòng ở trên): record_types nằm trong `details`
  // (chuỗi phân tách bằng dấu phẩy), không phải cột riêng như department_ids
  // — nên phải gửi NGUYÊN details hiện có kèm giá trị mới, vì PATCH route
  // dựng lại details từ đầu theo đúng các field của danh mục (sanitizeDetails),
  // gửi thiếu field nào sẽ mất field đó.
  async function toggleRecordTypeCell(item: Item, typeValue: string) {
    const current = String(item.details?.record_types || "").split(",").map((s) => s.trim()).filter(Boolean);
    const next = toggleId(current, typeValue);
    const nextDetails = { ...item.details, record_types: next.join(", ") };
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, details: nextDetails } : i)));
    try {
      const res = await fetch(`/api/emr/items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ details: nextDetails }) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không lưu được.");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
      await load({ silent: true });
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
    let rows = text ? items.filter((i) => `${i.title} ${i.description || ""}`.toLowerCase().includes(text)) : items;
    if (categoryCode === "BIEU_MAU" && publishFilter !== "ALL") rows = rows.filter((i) => i.publish_status === publishFilter);
    if (titleSort === "default") return rows;
    return [...rows].sort((a, b) => titleSort === "asc" ? a.title.localeCompare(b.title, "vi") : b.title.localeCompare(a.title, "vi"));
  }, [items, search, titleSort, categoryCode, publishFilter]);

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

  // Báo cáo thực tế: "...sau khi duyệt mới triển khai, áp dụng, tiến độ" —
  // biểu mẫu còn Nháp (chưa duyệt phát hành) không được tính vào KPI "Tiến độ
  // triển khai" (vốn chỉ phản ánh các biểu mẫu đã chính thức đưa vào theo
  // dõi). Chỉ loại ở BIEU_MAU — các danh mục khác không có khái niệm duyệt
  // phát hành nên publish_status của chúng (PUBLISHED do backfill) không có
  // ý nghĩa lọc.
  const kpiItems = categoryCode === "BIEU_MAU" ? items.filter((i) => i.publish_status !== "DRAFT") : items;

  return (
    <div className="page-stack">
      {kpis.length ? <section className="kpis" style={{ display: "grid", gridTemplateColumns: `repeat(${kpis.length},minmax(0,1fr))`, gap: 12 }}>
        {kpis.map((k) => <article className="kpi-card" key={k.bucket} style={{ background: "#fff", border: "1px solid #e5eaf2", borderRadius: 14, padding: 16, boxShadow: "0 1px 2px rgba(15,23,42,.03)", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span className={`emr-cat-kpi-icon ${KPI_TONE[k.bucket]}`}><Icon name={KPI_ICON[k.bucket]} size={19} /></span>
          <div><div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a" }}>{bucketCount(k.bucket, kpiItems, hasBlockedBucket)}</div>
          <div style={{ fontSize: 12.5, color: "#475569", fontWeight: 600, marginTop: 2 }}>{k.label}</div></div>
        </article>)}
        <style>{`.emr-cat-kpi-icon{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex:0 0 auto}.emr-cat-kpi-icon.blue{background:#dbeafe;color:#2563eb}.emr-cat-kpi-icon.green{background:#dcfce7;color:#16a34a}.emr-cat-kpi-icon.amber{background:#fef3c7;color:#b45309}.emr-cat-kpi-icon.red{background:#fee2e2;color:#dc2626}.emr-cat-kpi-icon.slate{background:#e2e8f0;color:#475569}`}</style>
      </section> : null}
      <div className="toolbar" style={{ padding: "0 0 4px" }}>
        <div className="toolbar-left"><div className="search-box"><Icon name="search" size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Tìm trong ${categoryLabel.toLowerCase()}...`} /></div>
          {categoryCode === "BIEU_MAU" ? (
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" className={`button ${publishFilter === "ALL" ? "primary" : "tertiary"} small`} onClick={() => setPublishFilter("ALL")}>Tất cả</button>
              <button type="button" className={`button ${publishFilter === "PUBLISHED" ? "primary" : "tertiary"} small`} onClick={() => setPublishFilter("PUBLISHED")}>Đã phát hành</button>
              <button type="button" className={`button ${publishFilter === "DRAFT" ? "primary" : "tertiary"} small`} onClick={() => setPublishFilter("DRAFT")}>Chờ duyệt phát hành</button>
            </div>
          ) : null}
        </div>
        {hasTabs ? (
          <div className="toolbar-right" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" className={`button ${view === "info" ? "primary" : "tertiary"} small`} onClick={() => setView("info")}>Thông tin {categoryLabel.toLowerCase()}</button>
            {hasProgressSplit ? <button type="button" className={`button ${view === "progress" ? "primary" : "tertiary"} small`} onClick={() => setView("progress")}>Tiến độ triển khai</button> : null}
            {categoryCode === "BIEU_MAU" ? <button type="button" className={`button ${view === "scope" ? "primary" : "tertiary"} small`} onClick={() => setView("scope")}>Phạm vi áp dụng</button> : null}
            {hasNotesSplit ? <button type="button" className={`button ${view === "notes" ? "primary" : "tertiary"} small`} onClick={() => setView("notes")}>Lỗi &amp; Ghi chú</button> : null}
            {categoryCode === "BIEU_MAU" ? <Link className="button secondary small" href="/emr/bieu-mau/tree">Cây biểu mẫu</Link> : null}
          </div>
        ) : null}
      </div>
      {error ? <div className="alert error">{error}</div> : null}
      {loading ? (
        <div className="empty-state">Đang tải...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">Chưa có mục nào trong &quot;{categoryLabel}&quot;.{canManage ? <> Bấm &quot;+ Thêm mục&quot; để tạo mới.</> : null}</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          {search ? <>Không tìm thấy mục phù hợp với &quot;{search}&quot;.</> : publishFilter === "PUBLISHED" ? "Chưa có biểu mẫu nào đã phát hành." : publishFilter === "DRAFT" ? "Không còn biểu mẫu nào chờ duyệt phát hành." : "Không tìm thấy mục phù hợp."}
        </div>
      ) : view === "scope" ? (
        <div className="panel emr-scope-matrix">
          {!clinicalDepartments.length && !recordTypeOptions.length ? (
            <div className="empty-state">Chưa có khoa hoặc loại hồ sơ nào để gán phạm vi áp dụng.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <colgroup>
                  <col className="emr-scope-corner-col" />
                  {clinicalDepartments.map((d) => <col key={d.id} />)}
                  {recordTypeOptions.map((rt) => <col key={rt} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th rowSpan={2} className="emr-scope-corner">Biểu mẫu</th>
                    {clinicalDepartments.length ? <th colSpan={clinicalDepartments.length}>Theo khoa</th> : null}
                    {recordTypeOptions.length ? <th colSpan={recordTypeOptions.length}>Theo loại hồ sơ bệnh án</th> : null}
                  </tr>
                  <tr>
                    {clinicalDepartments.map((d) => <th key={d.id} className="emr-scope-col-head">{d.short_name || d.name}</th>)}
                    {recordTypeOptions.map((rt) => <th key={rt} className="emr-scope-col-head">{rt}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const selectedRecordTypes = String(item.details?.record_types || "").split(",").map((s) => s.trim()).filter(Boolean);
                    // Ma trận hiển thị tick ĐÚNG theo department_ids hiện có —
                    // không còn coi rỗng là "đã tick hết" (xem comment ở khai
                    // báo clinicalDepartments). "Chọn tất cả khoa" chỉ hiện khi
                    // CHƯA chọn tường minh đủ mọi khoa; đã chọn hết thì đổi
                    // thành "Bỏ chọn tất cả".
                    const explicitAllSelected = item.department_ids.length > 0 && clinicalDepartments.length > 0 && clinicalDepartments.every((d) => item.department_ids.includes(d.id));
                    // Báo cáo thực tế: biểu mẫu Nháp (chưa duyệt phát hành)
                    // không được gán phạm vi áp dụng — server đã chặn ở PATCH,
                    // đây là vô hiệu hoá tương ứng phía giao diện để không bấm
                    // vào rồi mới thấy lỗi.
                    const scopeLocked = item.publish_status === "DRAFT";
                    return (
                      <tr key={item.id}>
                        <td className="emr-scope-row-head">
                          <strong>{item.title}</strong>
                          {scopeLocked ? <small className="muted">Cần duyệt phát hành trước</small> : null}
                          {clinicalDepartments.length ? (
                            explicitAllSelected ? (
                              <button
                                type="button"
                                className="button tertiary small"
                                disabled={!canManage || scopeLocked}
                                onClick={() => clearAllDepartmentsForItem(item)}
                              >
                                Bỏ chọn tất cả
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="button tertiary small"
                                disabled={!canManage || scopeLocked}
                                onClick={() => selectAllDepartmentsForItem(item)}
                              >
                                Chọn tất cả khoa
                              </button>
                            )
                          ) : null}
                        </td>
                        {clinicalDepartments.map((d) => {
                          const checked = item.department_ids.includes(d.id);
                          return (
                            <td key={d.id} style={{ textAlign: "center" }}>
                              <span className="inline-check" style={{ justifyContent: "center" }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={!canManage || scopeLocked}
                                  aria-label={`${item.title} — ${d.short_name || d.name}`}
                                  onChange={() => toggleScopeCell(item, d.id)}
                                />
                              </span>
                            </td>
                          );
                        })}
                        {recordTypeOptions.map((rt) => (
                          <td key={rt} style={{ textAlign: "center" }}>
                            <span className="inline-check" style={{ justifyContent: "center" }}>
                              <input
                                type="checkbox"
                                checked={selectedRecordTypes.includes(rt)}
                                disabled={!canManage || scopeLocked}
                                aria-label={`${item.title} — ${rt}`}
                                onChange={() => toggleRecordTypeCell(item, rt)}
                              />
                            </span>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <style>{`
            .emr-scope-matrix .table-wrap{max-height:70vh;overflow:auto}
            .emr-scope-matrix table{border-collapse:separate;border-spacing:0;table-layout:fixed;width:max-content;min-width:100%}
            .emr-scope-matrix col.emr-scope-corner-col{width:200px}
            .emr-scope-matrix thead th{position:sticky;top:0;z-index:2;background:#f8fafb}
            .emr-scope-matrix thead tr:first-child th{top:0;height:37px}
            .emr-scope-matrix thead tr:nth-child(2) th{top:37px}
            .emr-scope-matrix th.emr-scope-col-head{width:86px;white-space:normal;word-break:break-word;line-height:1.25;font-size:11px;padding:6px 4px;text-align:center}
            .emr-scope-matrix tbody td{text-overflow:clip}
            .emr-scope-matrix td.emr-scope-row-head,.emr-scope-matrix th.emr-scope-corner{position:sticky;left:0;z-index:1;background:#fff;text-align:left;white-space:normal;word-break:break-word}
            .emr-scope-matrix th.emr-scope-corner{z-index:3;background:#f8fafb}
            .emr-scope-matrix td.emr-scope-row-head{display:flex;flex-direction:column;gap:4px;align-items:flex-start}
            .emr-scope-matrix tbody tr:hover td.emr-scope-row-head{background:#fbfdfd}
          `}</style>
        </div>
      ) : (
        <div className="panel">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th style={{ width: 30 }}></th><th>#</th>{beforeTitleFields.map((f)=><th key={f.key}>{f.label}</th>)}<th><button type="button" onClick={cycleTitleSort} title="Sắp xếp theo STT hoặc A-Z" style={{display:"flex",alignItems:"center",gap:4,background:"none",border:0,padding:0,margin:0,font:"inherit",color:"inherit",cursor:"pointer"}}>Tiêu đề <span aria-hidden="true">{titleSort==="asc"?"▲":titleSort==="desc"?"▼":"⇅"}</span></button></th>{showDescription?<th>{descLabel}</th>:null}{visibleInfoColumns.map((f)=><th key={f.key}>{f.label}</th>)}{visibleProgressColumns.map((f)=><th key={f.key}>{f.label}</th>)}{showNotesColumns?<>{hasNotesField?<th>Ghi chú</th>:null}{loiReference?<th>Lỗi liên quan</th>:null}</>:null}{showPriorityDueStatus?<><th>Ưu tiên</th><th>Hạn</th><th>Trạng thái triển khai</th></>:null}{categoryCode==="BIEU_MAU"?<th>Duyệt phát hành</th>:null}<th></th></tr>
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
                    {showNotesColumns?<>
                      {hasNotesField?<td>{item.details?.notes ? String(item.details.notes) : "—"}</td>:null}
                      {loiReference?(() => {
                        const loiCount = (refItems.LOI || []).filter((r) => r.details?.[loiReference.field.key] === item.id).length;
                        return <td>{loiCount ? <Link className="table-link" href="/emr/loi">{loiCount} lỗi liên quan →</Link> : <Link className="table-link" href="/emr/loi">Ghi nhận lỗi mới →</Link>}</td>;
                      })():null}
                    </>:null}
                    {showPriorityDueStatus?<>
                    <td><span className={`status-badge ${item.priority==="CRITICAL"?"danger":item.priority==="HIGH"?"warning":"muted"}`}>{{LOW:"Thấp",MEDIUM:"Trung bình",HIGH:"Cao",CRITICAL:"Nghiêm trọng"}[item.priority]||item.priority}</span></td><td>{item.due_date || "—"}</td>
                    <td>{EMR_STATUS_LABELS[item.status] || item.status}{item.verified_at ? <div><small>Đã xác minh</small></div> : null}</td>
                    </>:null}
                    {categoryCode==="BIEU_MAU"?<td>
                      <span className={`status-badge ${item.publish_status==="PUBLISHED"?"success":"warning"}`}>{item.publish_status==="PUBLISHED"?"Đã duyệt":"Nháp"}</span>
                      {item.publish_status==="DRAFT" && canManage ? <div><button type="button" className="button tertiary small" style={{marginTop:4}} onClick={()=>publishItem(item)}>Duyệt phát hành</button></div> : null}
                    </td>:null}
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
              {categoryCode === "BIEU_MAU" ? (
                <label>Mã biểu mẫu
                  <input value={form.details.form_code || ""} onChange={(e) => setForm({ ...form, details: { ...form.details, form_code: e.target.value } })} />
                </label>
              ) : null}
              {extraFields.filter((f) => !f.pairWithStatus && !(categoryCode === "BIEU_MAU" && ["record_types", "form_code", "binding_group", "binding_group_order", "vendor_form_code", "execution_platform"].includes(f.key))).map((f) => (
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
                      {sequenceSteps(form.details[f.key]).map((step, i, steps) => {
                        const { role, method } = parseSequenceStep(step);
                        // Yêu cầu thực tế: "khác thì cho nhập text" — chọn
                        // "Khác" hiện thêm ô nhập tự do thay vì chỉ bó buộc
                        // trong danh sách lựa chọn sẵn. Xử lý chung cho MỌI
                        // field "sequence" có option "Khác" trong danh sách,
                        // không hard-code riêng signing_sequence — 1 vai trò
                        // không khớp option nào (đã lưu từ lần nhập tự do
                        // trước) cũng hiện lại đúng là đang ở chế độ "Khác".
                        const hasCustomOption = (f.options || []).includes("Khác");
                        const isKnownRole = role === "" || (f.options || []).includes(role);
                        const selectValue = isKnownRole ? role : "Khác";
                        const showCustomRoleInput = hasCustomOption && selectValue === "Khác";
                        const updateRole = (newRole: string) => {
                          const next = [...steps];
                          next[i] = formatSequenceStep(newRole, method);
                          setForm({ ...form, details: { ...form.details, [f.key]: next.join(SEQUENCE_SEPARATOR) } });
                        };
                        return (
                        <div className={`sequence-step-row${f.methodOptions ? " has-method" : ""}`} key={i}>
                          <span className="sequence-step-no">{i + 1}</span>
                          <div className="sequence-step-role">
                            <select
                              value={selectValue}
                              onChange={(e) => updateRole(e.target.value)}
                            >
                              <option value="">— Chọn —</option>
                              {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                            {showCustomRoleInput ? (
                              <input
                                placeholder="Nhập vai trò..."
                                value={role === "Khác" ? "" : role}
                                onChange={(e) => updateRole(sanitizeCustomRole(e.target.value) || "Khác")}
                              />
                            ) : null}
                          </div>
                          {f.methodOptions ? (
                            <select
                              value={method}
                              aria-label="Phương thức ký"
                              onChange={(e) => {
                                const next = [...steps];
                                next[i] = formatSequenceStep(role, e.target.value);
                                setForm({ ...form, details: { ...form.details, [f.key]: next.join(SEQUENCE_SEPARATOR) } });
                              }}
                            >
                              <option value="">— Phương thức ký —</option>
                              {f.methodOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                            </select>
                          ) : null}
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
                        );
                      })}
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
                <select value={form.status} disabled={categoryCode === "BIEU_MAU" && !!editing && editing.publish_status === "DRAFT"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(EMR_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                {categoryCode === "BIEU_MAU" && editing && editing.publish_status === "DRAFT" ? <small className="muted">Biểu mẫu cần được duyệt phát hành trước khi chuyển trạng thái triển khai.</small> : null}
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
              {categoryCode !== "BIEU_MAU" ? (
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
              ) : (
                // BIEU_MAU quản lý phạm vi áp dụng qua ma trận riêng (nút "Phạm
                // vi áp dụng" ở toolbar), không lặp lại ở đây.
                <small className="muted">Phạm vi áp dụng theo khoa/phòng cho biểu mẫu này được quản lý ở màn hình &quot;Phạm vi áp dụng&quot; (nút trên thanh công cụ), không chỉnh ở đây.</small>
              )}
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
