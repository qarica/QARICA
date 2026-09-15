"use client";

import { useEffect, useState } from "react";

type CriterionRow = {
  criteria_item_id: string;
  code: string | null;
  title: string;
  description: string | null;
  sequence_no: number | null;
  is_required: boolean;
  score: number | null;
  result: string | null;
  note: string;
  workflow_status: string;
};

const RESULT_OPTIONS = [
  { value: "", label: "— Chưa chấm —" },
  { value: "DAT", label: "Đạt" },
  { value: "KHONG_DAT", label: "Không đạt" },
  { value: "KHONG_AP_DUNG", label: "Không áp dụng" },
];

export function AssessmentCriteriaPanel({ recordId }: { recordId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<CriterionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [scored, setScored] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/assessments/${recordId}/criteria`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tải được danh sách tiêu chí.");
      setRows(data.criteria ?? []);
      setTotal(data.total ?? 0);
      setScored(data.scored ?? 0);
    } catch (e: any) {
      setError(e.message || "Có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);

  function updateRow(criteriaItemId: string, patch: Partial<CriterionRow>) {
    setRows((prev) => prev.map((r) => (r.criteria_item_id === criteriaItemId ? { ...r, ...patch } : r)));
  }

  async function saveRow(row: CriterionRow) {
    setSavingId(row.criteria_item_id);
    setSavedId(null);
    try {
      const res = await fetch(`/api/assessments/${recordId}/criteria`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          criteria_item_id: row.criteria_item_id,
          result: row.result || null,
          note: row.note || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lưu thất bại.");
      setSavedId(row.criteria_item_id);
      setScored((s) => (row.workflow_status === "DRAFT" ? s + 1 : s));
      updateRow(row.criteria_item_id, { workflow_status: "SUBMITTED" });
    } catch (e: any) {
      alert(e.message || "Có lỗi xảy ra khi lưu.");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <section className="panel"><div className="panel-title"><h2>Chấm điểm tiêu chí</h2></div><div style={{ padding: 24, color: "var(--muted)" }}>Đang tải danh sách tiêu chí...</div></section>;
  if (error) return <section className="panel"><div className="panel-title"><h2>Chấm điểm tiêu chí</h2></div><div style={{ padding: 24, color: "#b42318" }}>{error}</div></section>;
  if (!rows.length) return null;

  const pct = total ? Math.round((scored / total) * 100) : 0;

  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <h2>Chấm điểm tiêu chí</h2>
          <p>Đã chấm {scored}/{total} tiêu chí ({pct}%). Mỗi dòng lưu riêng, không cần lưu cả bảng.</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 70 }}>Mã</th>
              <th>Tên tiêu chí</th>
              <th style={{ width: 170 }}>Kết quả tự chấm</th>
              <th style={{ width: 260 }}>Ghi chú / minh chứng</th>
              <th style={{ width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.criteria_item_id}>
                <td><strong>{row.code}</strong></td>
                <td>
                  {row.title}
                  {row.description ? <div className="subline">{row.description}</div> : null}
                </td>
                <td>
                  <select
                    value={row.result || ""}
                    onChange={(e) => updateRow(row.criteria_item_id, { result: e.target.value || null })}
                  >
                    {RESULT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    placeholder="Ghi chú, minh chứng..."
                    value={row.note}
                    onChange={(e) => updateRow(row.criteria_item_id, { note: e.target.value })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={savingId === row.criteria_item_id}
                    onClick={() => saveRow(row)}
                  >
                    {savingId === row.criteria_item_id ? "Đang lưu..." : savedId === row.criteria_item_id ? "Đã lưu ✓" : "Lưu"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
