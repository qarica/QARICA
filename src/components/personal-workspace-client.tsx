"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { activeItems, deletedItems, mergeWorkspaceItems, vietnamDateToIso } from "@/lib/personal-workspace";

type ItemType = "TASK" | "NOTE";
type Item = {
  id: string;
  item_type: ItemType;
  title: string;
  content: string | null;
  category: string | null;
  due_at: string | null;
  status: "OPEN" | "DONE";
  completed_at: string | null;
  deleted_at?: string | null;
};

function formatDue(value: string | null) {
  if (!value) return "Không đặt hạn";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short" }).format(new Date(value));
}

// Chắt lọc từ tài liệu "Mô tả công việc – Phòng KHTH" (Tâm Anh): chỉ các đầu
// việc mang tính điều hành/giám sát/phê duyệt ở tầm Trưởng phòng — không lấy
// các đầu việc chi tiết gắn tên nhân sự cụ thể (Vinh, Hà, Huy...) của từng tổ.
const HEAD_OF_DEPARTMENT_TEMPLATES: { title: string; category: string; content: string }[] = [
  { title: "Rà soát & giải trình xuất toán BHYT với Đoàn giám định", category: "BHYT", content: "Hàng quý: rà soát hồ sơ, giải trình chuyên môn với Đoàn giám định về thanh quyết toán BHYT; phối hợp Tổ HSBA cập nhật/điều chỉnh nội dung, trình BGĐ duyệt biện pháp khắc phục xuất toán; thông báo kết quả cho các KLS ngay sau khi duyệt." },
  { title: "Giám sát tiến độ hoạt động P.KHTH theo chỉ đạo BGĐ", category: "Vận hành", content: "Đảm bảo mọi công việc/hoạt động của P.KHTH được triển khai kịp thời đến các đơn vị liên quan theo chỉ đạo định kỳ/đột xuất của Ban Giám đốc; hoàn thành đúng thời hạn được giao." },
  { title: "Văn bản hóa quy trình P.KHTH & phê duyệt QTKT các Trung tâm/Khoa", category: "Văn bản", content: "Đảm bảo quy trình vận hành của P.KHTH được văn bản hóa đúng tiến độ trên phần mềm QLVB; hỗ trợ phê duyệt QTKT của các Trung tâm/Khoa trên phần mềm (rà soát, duyệt yêu cầu soạn thảo từ KLS, chuyển bộ phận hành chính sửa theo template chuẩn)." },
  { title: "Họp rút kinh nghiệm chuyên môn & rà soát báo cáo HSBA hàng tháng", category: "HSBA", content: "Hàng tháng: rà soát nội dung báo cáo HSBA trước khi gửi Văn phòng CMO và các KLS; tham dự đầy đủ các buổi họp rút kinh nghiệm chuyên môn về HSBA; trình bày báo cáo khi được Văn phòng CMO chỉ định." },
  { title: "Lập kế hoạch kiểm tra, kiểm chéo HSBA năm", category: "HSBA", content: "Hoàn thành kế hoạch kiểm tra HSBA định kỳ + kiểm chéo (TATB & TAQ7) trước ngày 01/01 năm mới, trình Lãnh đạo Phòng & CMO phê duyệt. Kiểm tra định kỳ tối thiểu 1 tháng/lần; kiểm tra chéo triển khai đầu tuần thứ 2 mỗi tháng." },
  { title: "Theo dõi hành nghề bác sĩ trên cổng SYT/BHYT", category: "BHYT", content: "Cập nhật thông tin đăng ký hành nghề của bác sĩ để tránh xuất toán BHYT do sai chứng chỉ. Xử lý trong vòng 2 tuần (GĐTT/TK) hoặc tối đa 2 tháng (BS); BS luân chuyển site nội bộ: đăng ký tối thiểu trước 10 ngày." },
  { title: "Được ủy quyền ký hội chẩn kỹ thuật cao", category: "Chuyên môn", content: "Ký duyệt văn bản hội chẩn liên quan sử dụng kỹ thuật cao trong KCB; đảm bảo bàn giao đúng thời hạn cho Phòng BHYT; rà soát, ký duyệt bổ sung hội chẩn khi có yêu cầu từ bộ phận giám định BHYT." },
  { title: "Giám sát phác đồ điều trị & QTKT nội trú", category: "Chuyên môn", content: "Xây dựng kế hoạch giám sát chi tiết phác đồ điều trị nội trú + quy trình kỹ thuật điều trị nội trú vào tháng 01 hàng năm. Theo dõi, yêu cầu khoa phòng giải trình/điều chỉnh khi có thiếu sót vượt khả năng chuyên môn." },
  { title: "Hỗ trợ công tác thẩm định QTKT", category: "Chuyên môn", content: "Phối hợp KLS xây dựng QTKT và Quyết định ban hành liên quan khi có đợt thẩm định; thực hiện photo, sao y, đóng cuốn tài liệu theo yêu cầu; hoàn thành đúng deadline được cấp trên giao." },
  { title: "Phối hợp Phòng Nhân sự rà soát định biên bác sĩ", category: "Nhân sự", content: "Theo chỉ đạo BGĐ hoặc định kỳ tháng/quý: xem lại số lượng định biên bác sĩ mỗi chuyên khoa theo từng site; phối hợp Phòng Nhân sự về số lượng phòng khám dự kiến mở, số BS cần tuyển, trình BGĐ phê duyệt." },
  { title: "Đào tạo quy trình OTM & Luật KCB cho nhân viên mới", category: "Đào tạo", content: "Soạn bài, trình BGĐ phê duyệt, đào tạo nhân viên mới/hiện tại về quy trình OTM và Luật khám chữa bệnh liên quan P.KHTH; thực hiện theo lịch Tamri sắp xếp hoặc chỉ đạo đột xuất từ BGĐ." },
];

export function PersonalWorkspaceClient({ initialRows, userId, highlightedItemId = null }: { initialRows: Item[]; userId: string; highlightedItemId?: string | null }) {
  const supabase = createClient();
  const [rows, setRows] = useState(activeItems(initialRows));
  const [tab, setTab] = useState<ItemType>("TASK");
  const [showTrash, setShowTrash] = useState(false);
  const [trashBusy, setTrashBusy] = useState(false);
  const trashRequestLock = useRef(false);
  const [importBusy, setImportBusy] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const mutationLock = useRef(false);
  const dataVersion = useRef(0);
  function beginMutation() {
    if (mutationLock.current) return false;
    mutationLock.current = true;
    dataVersion.current += 1;
    setMutationBusy(true);
    return true;
  }
  function endMutation() {
    mutationLock.current = false;
    setMutationBusy(false);
  }
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [taskFilter, setTaskFilter] = useState<"OPEN" | "DONE" | "ALL">(highlightedItemId ? "ALL" : "OPEN");
  const [reminderChoice, setReminderChoice] = useState(false);
  const [completionDates, setCompletionDates] = useState<Record<string,string>>({});

  useEffect(() => {
    let cancelled = false;
    const versionAtStart = dataVersion.current;
    async function refreshActiveItems() {
      const { data, error } = await supabase
        .from("personal_workspace_items")
        .select("id,item_type,title,content,category,due_at,status,completed_at,deleted_at")
        .eq("owner_user_id", userId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (cancelled || dataVersion.current !== versionAtStart) return;
      if (error) {
        setError(`Không thể đồng bộ danh sách: ${error.message}`);
        return;
      }
      setRows((current) => mergeWorkspaceItems((data ?? []) as Item[], deletedItems(current)));
    }
    void refreshActiveItems();
    return () => { cancelled = true; };
    // The initial synchronization runs once for this authenticated workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function openTrash() {
    if (mutationLock.current || trashRequestLock.current) return;
    if (showTrash) {
      setShowTrash(false);
      return;
    }
    setError("");
    trashRequestLock.current = true;
    setTrashBusy(true);
    try {
    const { data, error } = await supabase
      .from("personal_workspace_items")
      .select("id,item_type,title,content,category,due_at,status,completed_at,deleted_at")
      .eq("owner_user_id", userId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(200);
    if (error) {
      setError(error.message);
      return;
    }
    setRows((current) => mergeWorkspaceItems(activeItems(current), (data ?? []) as Item[]));
    setShowTrash(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải thùng rác.");
    } finally {
      trashRequestLock.current = false;
      setTrashBusy(false);
    }
  }

  async function importTemplates() {
    const existingTitles = new Set(rows.filter((r) => !r.deleted_at && r.item_type === "NOTE").map((r) => r.title));
    const toInsert = HEAD_OF_DEPARTMENT_TEMPLATES.filter((t) => !existingTitles.has(t.title)).map((t) => ({
      owner_user_id: userId,
      item_type: "NOTE" as const,
      title: t.title,
      category: t.category,
      content: t.content,
    }));
    if (!toInsert.length || !beginMutation()) return;
    setImportBusy(true);
    setError("");
    try {
    const { data, error } = await supabase
      .from("personal_workspace_items")
      .insert(toInsert)
      .select("id,item_type,title,content,category,due_at,status,completed_at");
    if (error) {
      setError(error.message);
      return;
    }
    if (!data || data.length !== toInsert.length) {
      setError("Kết quả nhập chưa đầy đủ. Vui lòng tải lại danh sách trước khi thử tiếp.");
      return;
    }
    setRows((v) => [...(data as Item[]), ...v]);
    setTab("NOTE");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể nhập ghi chú mẫu.");
    } finally {
      setImportBusy(false);
      endMutation();
    }
  }

  async function add() {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    if (tab === "TASK" && !reminderChoice && window.confirm("Bạn có muốn đặt nhắc nhở cho việc này không?\\nChọn OK để thiết lập ngày nhắc, hoặc Hủy để lưu việc không có nhắc nhở.")) {
      setReminderChoice(true);
      return;
    }
    if (tab === "TASK" && reminderChoice && !dueAt) {
      setError("Vui lòng chọn ngày đến hạn khi bật nhắc nhở.");
      return;
    }
    if (!beginMutation()) return;
    setBusy(true);
    setError("");
    const payload: Record<string, unknown> = {
      owner_user_id: userId,
      item_type: tab,
      title: cleanTitle,
      category: category.trim() || null,
    };
    if (tab === "TASK") {
      const normalizedDue = dueAt ? vietnamDateToIso(dueAt) : null;
      if (dueAt && !normalizedDue) {
        setError("Ngày đến hạn không hợp lệ.");
        setBusy(false);
        endMutation();
        return;
      }
      payload.due_at = normalizedDue;
    }
    if (tab === "NOTE" || tab === "TASK") payload.content = content.trim() || null;
    try {
    const { data, error } = await supabase
      .from("personal_workspace_items")
      .insert(payload)
      .select("id,item_type,title,content,category,due_at,status,completed_at")
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    if (!data?.id) {
      setError("Không xác nhận được bản ghi mới. Vui lòng tải lại danh sách.");
      return;
    }
    setRows((v) => [data as Item, ...v]);
    setTitle("");
    setContent("");
    setCategory("");
    setDueAt("");
    setReminderChoice(false);
    setShowComposer(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tạo bản ghi.");
    } finally {
      setBusy(false);
      endMutation();
    }
  }

  async function toggleDone(row: Item) {
    if (!beginMutation()) return;
    setError("");
    const next = row.status === "DONE" ? "OPEN" : "DONE";
    const selectedDate = completionDates[row.id] || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date());
    const completedAt = next === "DONE" ? vietnamDateToIso(selectedDate) : null;
    if (next === "DONE" && (!completedAt || selectedDate > new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date()))) {
      setError("Ngày hoàn thành không hợp lệ hoặc ở tương lai."); endMutation(); return;
    }
    try {
    const { data, error } = await supabase
      .from("personal_workspace_items")
      .update({ status: next, completed_at: completedAt, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("owner_user_id", userId)
      .eq("status", row.status)
      .is("deleted_at", null)
      .select("id");
    if (error) {
      setError(error.message);
      return;
    }
    if (!data?.some((updated) => updated.id === row.id)) {
      setError("Không thể cập nhật: dữ liệu đã thay đổi hoặc bạn không có quyền. Vui lòng tải lại.");
      return;
    }
    setRows((v) => v.map((x) => (x.id === row.id ? { ...x, status: next, completed_at: completedAt } : x)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể cập nhật công việc.");
    } finally {
      endMutation();
    }
  }

  function startEdit(row: Item) {
    setEditingId(row.id);
    setEditContent(row.content ?? "");
  }

  async function saveEdit(id: string) {
    if (!beginMutation()) return;
    setError("");
    const newContent = editContent.trim() || null;
    try {
    const { data, error } = await supabase
      .from("personal_workspace_items")
      .update({ content: newContent, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner_user_id", userId)
      .eq("item_type", rows.find((item) => item.id === id)?.item_type ?? "NOTE")
      .is("deleted_at", null)
      .select("id");
    if (error) {
      setError(error.message);
      return;
    }
    if (!data?.some((updated) => updated.id === id)) {
      setError("Không thể lưu: ghi chú không tồn tại hoặc bạn không có quyền. Vui lòng tải lại.");
      return;
    }
    setRows((v) => v.map((x) => (x.id === id ? { ...x, content: newContent } : x)));
    setEditingId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu ghi chú.");
    } finally {
      endMutation();
    }
  }

  async function remove(id: string) {
    if (mutationLock.current) return;
    const item = rows.find((row) => row.id === id && !row.deleted_at);
    if (!item) return;
    if (!window.confirm(`Chuyển "${item.title}" vào thùng rác? Bạn có thể khôi phục sau.`)) return;
    if (!beginMutation()) return;
    setError("");
    try {
      const deletedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from("personal_workspace_items")
        .update({ deleted_at: deletedAt, updated_at: deletedAt })
        .eq("id", id)
        .eq("owner_user_id", userId)
        .is("deleted_at", null)
        .select("id");
      if (error) throw error;
      if (!data?.some((row) => row.id === id)) {
        setError("Không thể chuyển vào thùng rác. Vui lòng tải lại.");
        return;
      }
      setRows((current) => current.map((row) => row.id === id ? { ...row, deleted_at: deletedAt } : row));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể chuyển vào thùng rác.");
    } finally {
      endMutation();
    }
  }

  async function restore(id: string) {
    if (!beginMutation()) return;
    setError("");
    try {
      const { data, error } = await supabase
        .from("personal_workspace_items")
        .update({ deleted_at: null, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("owner_user_id", userId)
        .not("deleted_at", "is", null)
        .select("id");
      if (error) throw error;
      if (!data?.some((row) => row.id === id)) {
        setError("Không thể khôi phục. Vui lòng tải lại.");
        return;
      }
      setRows((current) => current.map((row) => row.id === id ? { ...row, deleted_at: null } : row));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể khôi phục bản ghi.");
    } finally {
      endMutation();
    }
  }

  const activeTasks = rows.filter((r) => !r.deleted_at && r.item_type === "TASK");
  const openCount = activeTasks.filter((r) => r.status !== "DONE").length;
  const doneCount = activeTasks.filter((r) => r.status === "DONE").length;
  const visible = rows.filter((r) => showTrash ? Boolean(r.deleted_at) : !r.deleted_at && r.item_type === tab && (tab !== "TASK" || taskFilter === "ALL" || r.status === taskFilter));
  const existingNoteTitles = new Set(rows.filter((r) => r.item_type === "NOTE").map((r) => r.title));
  const pendingImportCount = HEAD_OF_DEPARTMENT_TEMPLATES.filter((t) => !existingNoteTitles.has(t.title)).length;

  return (
    <section className="panel pw-section">
      <div className="pw-tabs">
        <button type="button" className={`pw-tab ${tab === "TASK" ? "active" : ""}`} disabled={showTrash} onClick={() => setTab("TASK")}>
          Việc cần làm
        </button>
        <button type="button" className={`pw-tab ${tab === "NOTE" ? "active" : ""}`} disabled={showTrash} onClick={() => setTab("NOTE")}>
          Ghi chú / quy trình
        </button>
        {!showTrash && pendingImportCount > 0 ? (
          <button type="button" className="button secondary small pw-import" disabled={importBusy || mutationBusy} onClick={() => void importTemplates()}>
            + Nhập {pendingImportCount} mục mẫu Trưởng phòng
          </button>
        ) : null}
        {/* Báo cáo thực tế: "rà soát vị trí Thùng rác" — trước đây là nút ĐẦU
            TIÊN của hàng, đứng trước cả 2 tab nội dung chính (Việc cần làm/
            Ghi chú), đọc như thể nó cũng là 1 tab ngang hàng dù chỉ là tác
            vụ phụ (xem đã xoá). Dời xuống cuối hàng + đẩy sát phải
            (pw-trash-btn) để tách bạch rõ: tab chính bên trái, tác vụ phụ
            bên phải — đúng quy ước thường gặp trong chính app này (vd nút
            "Lưu trữ" ở Sổ tay cá nhân cũng không nằm lẫn với các tab lọc). */}
        <button type="button" className="button secondary small pw-trash-btn" disabled={trashBusy || mutationBusy} onClick={() => void openTrash()}>{trashBusy ? "Đang tải..." : showTrash ? "Quay lại" : "Thùng rác"}</button>
      </div>
      {!showTrash ? <div className="pw-composer-toggle"><button type="button" className="button secondary small" aria-expanded={showComposer} onClick={() => setShowComposer((value) => !value)}>{showComposer ? "Ẩn biểu mẫu" : `+ Tạo ${tab === "TASK" ? "việc cá nhân" : "ghi chú"}`}</button></div> : null}
      {!showTrash && showComposer ? <div className="pw-form">
        <input
          className="input pw-title"
          placeholder={tab === "TASK" ? "Việc cần làm... (ví dụ: Nộp báo cáo tháng SYT)" : "Tiêu đề ghi chú... (ví dụ: Quy trình xử lý xuất toán BHYT)"}
          value={title}
          maxLength={300}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && tab === "TASK") void add();
          }}
        />
        {tab === "TASK" ? <label className="pw-reminder-choice"><input type="checkbox" checked={reminderChoice} onChange={(e) => setReminderChoice(e.target.checked)} /> Có cần nhắc nhở việc này không?</label> : null}
        {tab === "TASK" && reminderChoice ? <p className="pw-hint">Hãy chọn ngày đến hạn bên dưới. Đây là ngày hiển thị trong danh sách sắp đến hạn; chưa phải thông báo tự động.</p> : null}
        {tab === "NOTE" || tab === "TASK" ? (
          <textarea className="input pw-content" rows={4} placeholder={tab === "TASK" ? "Mô tả / ghi chú ban đầu (không bắt buộc)..." : "Nội dung ghi chú..."} value={content} onChange={(e) => setContent(e.target.value)} />
        ) : null}
        <div className="pw-form-row">
          <input className="input" placeholder="Phân loại (vd: QLCL, Vận hành, Chiến lược...)" value={category} maxLength={60} onChange={(e) => setCategory(e.target.value)} />
          {tab === "TASK" ? <input className="input" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /> : null}
        </div>
        <button className="button primary small" disabled={busy || mutationBusy || !title.trim()} onClick={() => void add()}>
          + Thêm {tab === "TASK" ? "việc" : "ghi chú"}
        </button>
      </div> : null}
      {tab === "TASK" && !showTrash ? <p className="pw-hint" style={{padding:"0 12px"}}>Đây là danh sách quản lý việc cá nhân. Chọn “Ghi chú / sửa” ngay trên từng việc để cập nhật nội dung; lịch và mục sắp đến hạn chỉ giúp xem nhanh.</p> : null}
      {error ? (
        <div className="alert error" style={{ margin: "0 12px 12px" }}>
          {error}
        </div>
      ) : null}
      {!showTrash && tab === "TASK" ? <div className="pw-filter" aria-label="Lọc công việc theo trạng thái">
        <button type="button" className={`pw-tab ${taskFilter === "OPEN" ? "active" : ""}`} onClick={() => setTaskFilter("OPEN")}>Chưa hoàn thành ({openCount})</button>
        <button type="button" className={`pw-tab ${taskFilter === "DONE" ? "active" : ""}`} onClick={() => setTaskFilter("DONE")}>Đã hoàn thành ({doneCount})</button>
        <button type="button" className={`pw-tab ${taskFilter === "ALL" ? "active" : ""}`} onClick={() => setTaskFilter("ALL")}>Tất cả ({activeTasks.length})</button>
      </div> : null}
      <div className="work-list">
        {highlightedItemId && !visible.some((row) => row.id === highlightedItemId) ? <p role="status" className="pw-hint" style={{padding:12}}>Không tìm thấy công việc cá nhân được chọn trong danh sách hiện tại.</p> : null}
        {visible.map((r) => (
          <div className="work-row pw-row" key={r.id} id={`personal-item-${r.id}`} style={{opacity:r.status === "DONE" ? 0.65 : 1, outline: highlightedItemId === r.id ? "2px solid var(--brand)" : undefined}}>
            <div className="work-main">
              <strong style={{ textDecoration: r.status === "DONE" ? "line-through" : "none" }}>{r.title}</strong>
              <small>
                {r.category ? `${r.category} · ` : ""}
                {r.item_type === "TASK" ? formatDue(r.due_at) : "Ghi chú cá nhân"}
              </small>
              {!showTrash ? (
                editingId === r.id ? (
                  <div className="pw-edit">
                    <textarea className="input" rows={4} value={editContent} onChange={(e) => setEditContent(e.target.value)} />
                    <div className="pw-edit-actions">
                      <button className="button primary small" disabled={mutationBusy} onClick={() => void saveEdit(r.id)}>
                        Lưu
                      </button>
                      <button className="button tertiary small" onClick={() => setEditingId(null)}>
                        Hủy
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="pw-note-content">{r.content || (r.item_type === "TASK" ? "Chưa có ghi chú tiến độ." : "(Chưa có nội dung)")}{r.item_type === "TASK" ? <button type="button" className="button tertiary small" style={{marginLeft:8}} onClick={() => startEdit(r)}>Ghi chú / sửa</button> : null}</div>
                )
              ) : null}
            </div>
            <div>
              <span className={`status-badge ${r.status === "DONE" ? "success" : "info"}`}>{r.status === "DONE" ? "✓ Hoàn thành" : "● Chưa xong"}</span>
            </div>
            {showTrash ? null : r.item_type === "TASK" ? (
              <><label className="pw-completed-date">Ngày hoàn thành <input className="input" type="date" aria-label={`Ngày hoàn thành ${r.title}`} value={completionDates[r.id] ?? (r.completed_at ? new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(r.completed_at)) : new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()))} onChange={e=>setCompletionDates(v=>({...v,[r.id]:e.target.value}))} disabled={mutationBusy}/></label><button className="button secondary small" disabled={mutationBusy} onClick={() => void toggleDone(r)}>
                {r.status === "DONE" ? "Mở lại" : "Hoàn tất"}
              </button></>
            ) : editingId === r.id ? null : (
              <button className="button secondary small" onClick={() => startEdit(r)}>
                Sửa
              </button>
            )}
            <button className="button tertiary small" disabled={mutationBusy} onClick={() => void (showTrash ? restore(r.id) : remove(r.id))}>
              {showTrash ? "Khôi phục" : "Xóa"}
            </button>
          </div>
        ))}
        {!visible.length ? <div className="empty-state compact">{showTrash ? "Thùng rác trống." : tab === "TASK" ? "Chưa có việc cần làm." : "Chưa có ghi chú nào."}</div> : null}
      </div>
      <style jsx>{`
        .pw-completed-date {display:grid;gap:4px;font-size:11px;color:#475569;max-width:165px}
        .pw-composer-toggle { padding: 12px 12px 4px; }
        .pw-tabs { flex-wrap: wrap; }
        .pw-filter { display:flex; flex-wrap:wrap; gap:8px; padding:4px 12px 12px; }
        .pw-reminder-choice { display:flex; gap:8px; align-items:center; font-size:13px; }
        .pw-hint { margin:0; color:#64748b; font-size:12px; }
        .pw-tabs {
          display: flex;
          gap: 8px;
          padding: 12px 12px 0;
        }
        .pw-trash-btn { margin-left: auto; }
        .pw-tab {
          border: 1px solid var(--line);
          background: #fff;
          border-radius: 999px;
          padding: 6px 14px;
          font-size: 12px;
          font-weight: 700;
          color: #475569;
        }
        .pw-tab.active {
          background: var(--brand);
          border-color: var(--brand);
          color: #fff;
        }
        .pw-import {
          margin-left: auto;
        }
        .pw-form {
          min-width:0;
          display: grid;
          gap: 8px;
          padding: 12px;
        }
        .pw-title {
          width: 100%;
        }
        .pw-content {
          width: 100%;
          min-height: 90px;
        }
        .pw-form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .pw-row {
          align-items: flex-start;
        }
        .pw-note-content {
          margin: 4px 0 0;
          white-space: pre-wrap;
          color: #334155;
          font-size: 13px;
        }
        .pw-edit {
          display: grid;
          gap: 6px;
          margin-top: 6px;
        }
        .pw-edit-actions {
          display: flex;
          gap: 8px;
        }
        @media (max-width: 620px) {
          .pw-form-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
