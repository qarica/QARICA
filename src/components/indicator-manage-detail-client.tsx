"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Definition = { id: string; code: string; name: string; purpose: string | null; quality_dimension: string | null; is_active: boolean };
type Version = { id: string; version_no: number; status: string; calculation_type: string | null; desired_direction: string | null; frequency: string | null; unit: string | null; multiplier: number | null; effective_from: string | null; effective_to: string | null };

const statusLabel = (v: string) => v === "PUBLISHED" ? "Đã công bố" : v === "DRAFT" ? "Bản nháp" : v === "RETIRED" ? "Ngưng sử dụng" : v || "—";
const calcOptions = [["RAW", "Giá trị trực tiếp"], ["PERCENTAGE", "Tỷ lệ %"], ["RATIO", "Tỷ số"], ["RATE", "Tỷ suất"], ["AVERAGE", "Trung bình"], ["COUNT", "Số lượng"]];
const directionOptions = [["HIGHER_IS_BETTER", "Càng cao càng tốt"], ["LOWER_IS_BETTER", "Càng thấp càng tốt"], ["TARGET_RANGE", "Trong khoảng mục tiêu"], ["NEUTRAL", "Theo dõi"]];
const frequencyOptions = [["DAILY", "Hằng ngày"], ["WEEKLY", "Hằng tuần"], ["MONTHLY", "Hằng tháng"], ["QUARTERLY", "Hằng quý"], ["SEMIANNUAL", "6 tháng"], ["ANNUAL", "Hằng năm"]];

export function IndicatorManageDetailClient({ definition, versions, canManage }: { definition: Definition; versions: Version[]; canManage: boolean }) {
  const router = useRouter();
  const [def, setDef] = useState(definition);
  const [savingDef, setSavingDef] = useState(false);
  const [defError, setDefError] = useState("");
  const [busyVersionId, setBusyVersionId] = useState("");
  const [error, setError] = useState("");
  const draft = versions.find((v) => v.status === "DRAFT") || null;

  async function saveDefinition() {
    setSavingDef(true); setDefError("");
    try {
      const res = await fetch(`/api/indicator-definitions/${def.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: def.code, name: def.name, purpose: def.purpose, quality_dimension: def.quality_dimension, is_active: def.is_active }) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không lưu được.");
      router.refresh();
    } catch (e) { setDefError(e instanceof Error ? e.message : "Có lỗi xảy ra."); } finally { setSavingDef(false); }
  }

  async function createDraft() {
    setError("");
    try {
      const res = await fetch(`/api/indicator-definitions/${def.id}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không tạo được phiên bản.");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Có lỗi xảy ra."); }
  }

  async function patchVersion(v: Version, patch: Partial<Version>) {
    setBusyVersionId(v.id); setError("");
    try {
      const res = await fetch(`/api/indicator-versions/${v.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không lưu được.");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Có lỗi xảy ra."); } finally { setBusyVersionId(""); }
  }

  async function publish(v: Version) {
    if (!window.confirm(`Phát hành phiên bản v${v.version_no}? Sau khi phát hành sẽ không sửa trực tiếp được nữa.`)) return;
    setBusyVersionId(v.id); setError("");
    try {
      const res = await fetch(`/api/indicator-definitions/${def.id}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version_id: v.id }) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không phát hành được.");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Có lỗi xảy ra."); } finally { setBusyVersionId(""); }
  }

  return <div className="page-stack">
    <div className="card" style={{ padding: 16 }}>
      <strong>Thông tin chỉ số</strong>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12, marginTop: 12 }}>
        <label>Mã chỉ số<input value={def.code} disabled={!canManage} onChange={(e) => setDef({ ...def, code: e.target.value })} /></label>
        <label>Tên chỉ số *<input value={def.name} disabled={!canManage} onChange={(e) => setDef({ ...def, name: e.target.value })} /></label>
        <label>Lĩnh vực<input value={def.quality_dimension || ""} disabled={!canManage} onChange={(e) => setDef({ ...def, quality_dimension: e.target.value })} /></label>
        <label className="inline-check">Ngưng sử dụng<input type="checkbox" checked={!def.is_active} disabled={!canManage} onChange={(e) => setDef({ ...def, is_active: !e.target.checked })} /></label>
        <label style={{ gridColumn: "1/-1" }}>Mục đích<textarea rows={2} value={def.purpose || ""} disabled={!canManage} onChange={(e) => setDef({ ...def, purpose: e.target.value })} /></label>
      </div>
      {defError ? <div className="alert error" style={{ marginTop: 8 }}>{defError}</div> : null}
      {canManage ? <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}><button className="button primary" onClick={saveDefinition} disabled={savingDef}>{savingDef ? "Đang lưu..." : "Lưu thông tin"}</button></div> : null}
    </div>

    {error ? <div className="alert error">{error}</div> : null}

    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <strong>Phiên bản chỉ số</strong>
        {canManage && !draft ? <button className="button secondary" onClick={createDraft}>+ Tạo phiên bản mới</button> : null}
      </div>
      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead><tr><th>Phiên bản</th><th>Trạng thái</th><th>Cách tính</th><th>Chiều hướng</th><th>Tần suất</th><th>Đơn vị</th><th>Hiệu lực từ</th><th></th></tr></thead>
          <tbody>
            {versions.map((v) => {
              const isDraft = v.status === "DRAFT";
              const editable = canManage && isDraft;
              const busy = busyVersionId === v.id;
              return <tr key={v.id}>
                <td><strong>v{v.version_no}</strong></td>
                <td><span className={`status-badge ${v.status === "PUBLISHED" ? "success" : v.status === "DRAFT" ? "warning" : "muted"}`}>{statusLabel(v.status)}</span></td>
                <td>{editable ? <select value={v.calculation_type || ""} disabled={busy} onChange={(e) => patchVersion(v, { calculation_type: e.target.value })}><option value="">— Chọn —</option>{calcOptions.map(([val, label]) => <option key={val} value={val}>{label}</option>)}</select> : (calcOptions.find(([val]) => val === v.calculation_type)?.[1] || "—")}</td>
                <td>{editable ? <select value={v.desired_direction || ""} disabled={busy} onChange={(e) => patchVersion(v, { desired_direction: e.target.value })}><option value="">— Chọn —</option>{directionOptions.map(([val, label]) => <option key={val} value={val}>{label}</option>)}</select> : (directionOptions.find(([val]) => val === v.desired_direction)?.[1] || "—")}</td>
                <td>{editable ? <select value={v.frequency || ""} disabled={busy} onChange={(e) => patchVersion(v, { frequency: e.target.value })}><option value="">— Chọn —</option>{frequencyOptions.map(([val, label]) => <option key={val} value={val}>{label}</option>)}</select> : (frequencyOptions.find(([val]) => val === v.frequency)?.[1] || "—")}</td>
                <td>{editable ? <input defaultValue={v.unit || ""} disabled={busy} onBlur={(e) => e.target.value !== (v.unit || "") && patchVersion(v, { unit: e.target.value })} style={{ width: 80 }} /> : (v.unit || "—")}</td>
                <td>{editable ? <input type="date" defaultValue={v.effective_from || ""} disabled={busy} onBlur={(e) => e.target.value !== (v.effective_from || "") && patchVersion(v, { effective_from: e.target.value })} /> : (v.effective_from || "—")}</td>
                <td>{editable ? <button className="button primary small" onClick={() => publish(v)} disabled={busy}>Phát hành</button> : null}</td>
              </tr>;
            })}
            {!versions.length ? <tr><td colSpan={8} style={{ padding: 24, textAlign: "center" }}>Chưa có phiên bản nào.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  </div>;
}
