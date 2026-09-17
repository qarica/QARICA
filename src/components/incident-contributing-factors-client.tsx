"use client";

import { useCallback, useEffect, useState } from "react";

const FACTORS = [
  { code: "PATIENT", label: "Người bệnh", hint: "Tình trạng, ngôn ngữ, hành vi, đặc điểm cá nhân" },
  { code: "STAFF", label: "Nhân viên", hint: "Kiến thức, năng lực, mệt mỏi, kinh nghiệm" },
  { code: "TASK_TECHNOLOGY", label: "Công việc / công nghệ", hint: "Quy trình, hướng dẫn, thiết bị, thiết kế công việc" },
  { code: "TEAM", label: "Nhóm làm việc", hint: "Giao tiếp, bàn giao, phối hợp, giám sát" },
  { code: "WORK_ENVIRONMENT", label: "Môi trường làm việc", hint: "Nhân lực, tải công việc, không gian, điều kiện làm việc" },
  { code: "INFORMATION_SYSTEMS", label: "Hệ thống thông tin", hint: "Thông tin, hồ sơ, cảnh báo, dữ liệu, truyền đạt" },
  { code: "ORGANIZATION_MANAGEMENT", label: "Tổ chức / quản lý", hint: "Ưu tiên, nguồn lực, văn hóa an toàn, quản trị" },
  { code: "INSTITUTIONAL_CONTEXT", label: "Bối cảnh thể chế", hint: "Quy định, chính sách, yếu tố bên ngoài bệnh viện" },
] as const;

export function IncidentContributingFactorsClient({ recordId }: { recordId: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [editable, setEditable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/incidents/${recordId}/contributing-factors`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Không tải được yếu tố góp phần.");
      setSelected((json.factors || []).map((x: any) => String(x.factor_code)));
      setEditable(!!json.editable);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được yếu tố góp phần.");
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  useEffect(() => { void load(); }, [load]);

  function toggle(code: string) {
    if (!editable) return;
    setNotice("");
    setSelected((current) => current.includes(code) ? current.filter((x) => x !== code) : [...current, code]);
  }

  async function save() {
    if (saving || !editable) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/incidents/${recordId}/contributing-factors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factors: selected }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Không lưu được yếu tố góp phần.");
      setNotice(json.message || "Đã lưu yếu tố góp phần.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được yếu tố góp phần.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="in-box incident-factors">
      <style>{`
        .incident-factors .factor-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}
        .incident-factors .factor-head h3{margin:0 0 4px}
        .incident-factors .factor-head p{margin:0}
        .incident-factors .factor-count{border-radius:999px;background:#eef6ff;color:#1d4ed8;padding:5px 8px;font-size:10px;font-weight:850;white-space:nowrap}
        .incident-factors .factor-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
        .incident-factors .factor-card{display:flex;gap:9px;align-items:flex-start;text-align:left;border:1px solid #dde7e9;background:#fff;border-radius:11px;padding:10px;cursor:pointer;color:inherit}
        .incident-factors .factor-card:hover{border-color:#a9c8e6;background:#f8fbff}
        .incident-factors .factor-card.selected{border-color:#86b7e4;background:#eef6ff}
        .incident-factors .factor-card:disabled{cursor:default;opacity:1}
        .incident-factors .factor-check{width:17px;height:17px;min-width:17px;border:1px solid #b8c6ca;border-radius:5px;display:grid;place-items:center;font-size:11px;font-weight:900;margin-top:1px;background:#fff}
        .incident-factors .selected .factor-check{background:#2563eb;border-color:#2563eb;color:#fff}
        .incident-factors .factor-copy strong{display:block;font-size:11px}
        .incident-factors .factor-copy small{display:block;color:#708087;font-size:9px;line-height:1.35;margin-top:2px}
        .incident-factors .factor-actions{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px}
        .incident-factors .factor-help{font-size:9px;color:#718087}
        @media(max-width:760px){.incident-factors .factor-grid{grid-template-columns:1fr}.incident-factors .factor-head,.incident-factors .factor-actions{display:grid}}
      `}</style>
      <div className="factor-head">
        <div>
          <h3>Yếu tố góp phần · Systems Thinking</h3>
          <p>Chọn các nhóm yếu tố của hệ thống có góp phần tạo ra sự cố; không dùng để quy lỗi cá nhân.</p>
        </div>
        <span className="factor-count">{selected.length}/8 nhóm</span>
      </div>
      {error ? <div className="alert error">{error}</div> : null}
      {notice ? <div className="alert success">{notice}</div> : null}
      {loading ? <div className="empty-state compact">Đang tải yếu tố góp phần...</div> : (
        <div className="factor-grid">
          {FACTORS.map((factor) => {
            const active = selected.includes(factor.code);
            return <button type="button" disabled={!editable} onClick={() => toggle(factor.code)} className={`factor-card ${active ? "selected" : ""}`} key={factor.code}>
              <span className="factor-check">{active ? "✓" : ""}</span>
              <span className="factor-copy"><strong>{factor.label}</strong><small>{factor.hint}</small></span>
            </button>;
          })}
        </div>
      )}
      <div className="factor-actions">
        <span className="factor-help">{editable ? "Có thể chọn nhiều nhóm; dữ liệu được lưu cấu trúc để phân tích xu hướng toàn viện." : "Yếu tố đã được khóa theo giai đoạn điều tra hiện tại."}</span>
        {editable ? <button type="button" className="button primary small" disabled={saving || loading} onClick={save}>{saving ? "Đang lưu..." : "Lưu yếu tố góp phần"}</button> : null}
      </div>
    </div>
  );
}
