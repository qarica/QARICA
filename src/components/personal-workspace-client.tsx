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

export function PersonalWorkspaceClient({ initialRows, userId }: { initialRows: Item[]; userId: string }) {
  const supabase = createClient();
  const [rows, setRows] = useState(initialRows);
  const [tab, setTab] = useState<ItemType>("TASK");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

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

  return (
    <section className="work-section pw-section">
      <div className="pw-tabs">
        <button type="button" className={`pw-tab ${tab === "TASK" ? "active" : ""}`} onClick={() => setTab("TASK")}>
          Việc cần làm
        </button>
        <button type="button" className={`pw-tab ${tab === "NOTE" ? "active" : ""}`} onClick={() => setTab("NOTE")}>
          Ghi chú / quy trình
        </button>
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
