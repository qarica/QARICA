"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

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

export function PersonalWorkspaceClient({ initialRows, userId }: { initialRows: Item[]; userId: string }) {
  const supabase = createClient();
  const [rows, setRows] = useState(initialRows);
  const [tab, setTab] = useState<ItemType>("TASK");
  const [importBusy, setImportBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  async function importTemplates() {
    const existingTitles = new Set(rows.filter((r) => r.item_type === "NOTE").map((r) => r.title));
    const toInsert = HEAD_OF_DEPARTMENT_TEMPLATES.filter((t) => !existingTitles.has(t.title)).map((t) => ({
      owner_user_id: userId,
      item_type: "NOTE" as const,
      title: t.title,
      category: t.category,
      content: t.content,
    }));
    if (!toInsert.length) return;
    setImportBusy(true);
    setError("");
    const { data, error } = await supabase
      .from("personal_workspace_items")
      .insert(toInsert)
      .select("id,item_type,title,content,category,due_at,status,completed_at");
    setImportBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setRows((v) => [...((data ?? []) as Item[]), ...v]);
    setTab("NOTE");
  }

  async function add() {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    setBusy(true);
    setError("");
    const payload: Record<string, unknown> = {
      owner_user_id: userId,
      item_type: tab,
      title: cleanTitle,
      category: category.trim() || null,
    };
    if (tab === "TASK") payload.due_at = dueAt ? new Date(`${dueAt}T00:00:00`).toISOString() : null;
    if (tab === "NOTE") payload.content = content.trim() || null;
    const { data, error } = await supabase
      .from("personal_workspace_items")
      .insert(payload)
      .select("id,item_type,title,content,category,due_at,status,completed_at")
      .single();
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setRows((v) => [data as Item, ...v]);
    setTitle("");
    setContent("");
    setCategory("");
    setDueAt("");
  }

  async function toggleDone(row: Item) {
    const next = row.status === "DONE" ? "OPEN" : "DONE";
    const { error } = await supabase
      .from("personal_workspace_items")
      .update({ status: next, completed_at: next === "DONE" ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) {
      setError(error.message);
      return;
    }
    setRows((v) => v.map((x) => (x.id === row.id ? { ...x, status: next } : x)));
  }

  function startEdit(row: Item) {
    setEditingId(row.id);
    setEditContent(row.content ?? "");
  }

  async function saveEdit(id: string) {
    const { error } = await supabase
      .from("personal_workspace_items")
      .update({ content: editContent.trim() || null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    setRows((v) => v.map((x) => (x.id === id ? { ...x, content: editContent.trim() || null } : x)));
    setEditingId(null);
  }

  async function remove(id: string) {
    const { error } = await supabase.from("personal_workspace_items").delete().eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    setRows((v) => v.filter((x) => x.id !== id));
  }

  const visible = rows.filter((r) => r.item_type === tab);
  const existingNoteTitles = new Set(rows.filter((r) => r.item_type === "NOTE").map((r) => r.title));
  const pendingImportCount = HEAD_OF_DEPARTMENT_TEMPLATES.filter((t) => !existingNoteTitles.has(t.title)).length;

  return (
    <section className="work-section pw-section">
      <div className="pw-tabs">
        <button type="button" className={`pw-tab ${tab === "TASK" ? "active" : ""}`} onClick={() => setTab("TASK")}>
          Việc cần làm
        </button>
        <button type="button" className={`pw-tab ${tab === "NOTE" ? "active" : ""}`} onClick={() => setTab("NOTE")}>
          Ghi chú / quy trình
        </button>
        {pendingImportCount > 0 ? (
          <button type="button" className="button secondary small pw-import" disabled={importBusy} onClick={() => void importTemplates()}>
            + Nhập {pendingImportCount} mục mẫu Trưởng phòng
          </button>
        ) : null}
      </div>
      <div className="pw-form">
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
        {tab === "NOTE" ? (
          <textarea className="input pw-content" rows={4} placeholder="Nội dung ghi chú..." value={content} onChange={(e) => setContent(e.target.value)} />
        ) : null}
        <div className="pw-form-row">
          <input className="input" placeholder="Phân loại (vd: QLCL, Vận hành, Chiến lược...)" value={category} maxLength={60} onChange={(e) => setCategory(e.target.value)} />
          {tab === "TASK" ? <input className="input" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /> : null}
        </div>
        <button className="button primary small" disabled={busy || !title.trim()} onClick={() => void add()}>
          + Thêm {tab === "TASK" ? "việc" : "ghi chú"}
        </button>
      </div>
      {error ? (
        <div className="alert error" style={{ margin: "0 12px 12px" }}>
          {error}
        </div>
      ) : null}
      <div className="work-list">
        {visible.map((r) => (
          <div className="work-row pw-row" key={r.id}>
            <div className="work-main">
              <strong style={{ textDecoration: r.status === "DONE" ? "line-through" : "none" }}>{r.title}</strong>
              <small>
                {r.category ? `${r.category} · ` : ""}
                {r.item_type === "TASK" ? formatDue(r.due_at) : "Ghi chú cá nhân"}
              </small>
              {r.item_type === "NOTE" ? (
                editingId === r.id ? (
                  <div className="pw-edit">
                    <textarea className="input" rows={4} value={editContent} onChange={(e) => setEditContent(e.target.value)} />
                    <div className="pw-edit-actions">
                      <button className="button primary small" onClick={() => void saveEdit(r.id)}>
                        Lưu
                      </button>
                      <button className="button tertiary small" onClick={() => setEditingId(null)}>
                        Hủy
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="pw-note-content">{r.content || "(Chưa có nội dung)"}</p>
                )
              ) : null}
            </div>
            <div>
              <span className="status-badge info">{r.status === "DONE" ? "Đã xong" : "Cá nhân"}</span>
            </div>
            {r.item_type === "TASK" ? (
              <button className="button secondary small" onClick={() => void toggleDone(r)}>
                {r.status === "DONE" ? "Mở lại" : "Hoàn tất"}
              </button>
            ) : editingId === r.id ? null : (
              <button className="button secondary small" onClick={() => startEdit(r)}>
                Sửa
              </button>
            )}
            <button className="button tertiary small" onClick={() => void remove(r.id)}>
              Xóa
            </button>
          </div>
        ))}
        {!visible.length ? <div className="empty-state compact">{tab === "TASK" ? "Chưa có việc cần làm." : "Chưa có ghi chú nào."}</div> : null}
      </div>
      <style jsx>{`
        .pw-tabs {
          display: flex;
          gap: 8px;
          padding: 12px 12px 0;
        }
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
