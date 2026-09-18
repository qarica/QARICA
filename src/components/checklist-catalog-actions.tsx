"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ChecklistCatalogActions({ id, name, description, sourceCode, active, draft }: {
  id: string; name: string; description: string | null; sourceCode: string | null; active: boolean; draft: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(name);
  const [detail, setDetail] = useState(description || "");
  const [originalCode, setOriginalCode] = useState(sourceCode || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(operation: "update" | "retire" | "draft") {
    if (operation === "retire" && !window.confirm("Ngưng sử dụng bảng kiểm này? Các đợt đã thực hiện vẫn được lưu để truy vết.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/monitoring/templates/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation, name: title, description: detail, source_code: originalCode }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không lưu được bảng kiểm.");
      setEditing(false); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không lưu được bảng kiểm."); }
    finally { setBusy(false); }
  }
  return <section className="panel" style={{ padding: 16 }}>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <strong>Quản lý mẫu bảng kiểm</strong>
      {active && draft ? <button type="button" className="button secondary small" onClick={() => setEditing(!editing)}>Cập nhật</button> : null}
      {active && !draft ? <button type="button" className="button secondary small" disabled={busy} onClick={() => save("draft")}>Tạo bản nháp cập nhật</button> : null}
      {active ? <button type="button" className="button secondary small" disabled={busy} onClick={() => save("retire")}>Ngưng sử dụng</button> : <span className="status-badge muted">Đã ngưng sử dụng</span>}
    </div>
    {editing ? <div className="form-stack" style={{ marginTop: 12 }}>
      <label>Tên bảng kiểm *<input value={title} onChange={event => setTitle(event.target.value)} /></label>
      <label>Mô tả<textarea value={detail} onChange={event => setDetail(event.target.value)} rows={3} /></label>
      <label>Mã biểu mẫu gốc (nếu có)<input value={originalCode} onChange={event => setOriginalCode(event.target.value)} /></label>
      <div style={{ display: "flex", gap: 8 }}><button type="button" className="button primary" disabled={busy || !title.trim()} onClick={() => save("update")}>Lưu cập nhật</button><button type="button" className="button secondary" onClick={() => setEditing(false)}>Hủy</button></div>
    </div> : null}
    {error ? <div className="alert error" role="alert">{error}</div> : null}
  </section>;
}
