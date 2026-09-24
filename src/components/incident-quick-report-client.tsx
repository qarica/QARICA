"use client";

import { useState } from "react";
import Link from "next/link";
import { routeForRecord } from "@/lib/record-route";

type Department = { id: string; label: string };

const HARM_OPTIONS = [
  { value: "MILD", label: "Nhẹ" },
  { value: "MODERATE", label: "Trung bình" },
  { value: "SEVERE", label: "Nặng" },
] as const;

function autoTitle(departmentLabel: string, description: string) {
  const short = description.trim().replace(/\s+/g, " ").slice(0, 70);
  const now = new Date();
  const stamp = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `Sự cố ${departmentLabel} ${stamp} — ${short || "chưa mô tả"}`;
}

export function IncidentQuickReportClient({
  departments,
  defaultDepartmentId,
  workYear,
}: {
  departments: Department[];
  defaultDepartmentId: string | null;
  workYear: number;
}) {
  const [departmentId, setDepartmentId] = useState(defaultDepartmentId || "");
  const [description, setDescription] = useState("");
  const [harm, setHarm] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ record_id: string; record_code: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!departmentId) { setError("Cần chọn khoa/phòng nơi xảy ra."); return; }
    if (description.trim().length < 5) { setError("Cần mô tả ngắn gọn sự việc."); return; }

    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const departmentLabel = departments.find((d) => d.id === departmentId)?.label || "";
      const res = await fetch("/api/domain-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          record_type: "INCIDENT",
          title: autoTitle(departmentLabel, description),
          work_year: workYear,
          fields: {
            report_type: "VOLUNTARY",
            incident_location_department_id: departmentId,
            occurred_at: nowIso,
            reported_at: nowIso,
            initial_description: description.trim(),
            initial_harm_assessment: harm || null,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không tạo được báo cáo.");
      setResult({ record_id: json.record_id, record_code: json.record_code });
    } catch (e: any) {
      setError(e.message || "Không tạo được báo cáo.");
    } finally {
      setSaving(false);
    }
  }

  function reportAnother() {
    setResult(null);
    setDescription("");
    setHarm("");
    setError("");
  }

  if (result) {
    return (
      <div className="panel" style={{ padding: 20 }}>
        <div className="alert success">
          <strong>Đã gửi báo cáo nhanh — mã {result.record_code}.</strong>
          <p style={{ margin: "6px 0 0" }}>Hồ sơ đang ở trạng thái ban đầu. Bổ sung người báo cáo, thông tin người bệnh và xử trí ban đầu trong hồ sơ đầy đủ khi có thời gian.</p>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <Link className="button primary" href={routeForRecord("INCIDENT", result.record_id)}>Mở hồ sơ để bổ sung chi tiết</Link>
          <button type="button" className="button secondary" onClick={reportAnother}>Báo cáo sự cố khác</button>
        </div>
      </div>
    );
  }

  return (
    <form className="panel" style={{ padding: 20, display: "grid", gap: 14, maxWidth: 640 }} onSubmit={submit}>
      <label className="field">
        <span>Khoa/phòng nơi xảy ra *</span>
        <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} autoFocus>
          <option value="">Chọn khoa/phòng</option>
          {departments.map((d) => <option value={d.id} key={d.id}>{d.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Mô tả ngắn gọn về sự cố *</span>
        <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Việc gì xảy ra, ở đâu, với ai — ghi nhanh sự việc, chi tiết bổ sung sau." />
      </label>
      <div className="field">
        <span>Mức độ ảnh hưởng ban đầu (tuỳ chọn)</span>
        <div style={{ display: "flex", gap: 8 }}>
          {HARM_OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.value}
              className={`button ${harm === opt.value ? "primary" : "secondary"} small`}
              onClick={() => setHarm((current) => (current === opt.value ? "" : opt.value))}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      {error ? <div className="alert error">{error}</div> : null}
      <div className="modal-actions">
        <Link className="button tertiary" href="/incidents">Hủy</Link>
        <button type="submit" className="button primary" disabled={saving}>{saving ? "Đang gửi..." : "Gửi báo cáo nhanh"}</button>
      </div>
    </form>
  );
}
