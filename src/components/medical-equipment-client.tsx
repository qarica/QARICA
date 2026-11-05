"use client";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { TQM_CHART_CSS, TqmDonut, TqmHorizontalBars } from "@/components/tqm-charts";

type Department = { id: string; name: string };

export type EquipmentStatus = "IN_USE" | "MAINTENANCE" | "INACTIVE";

const STATUS_LABEL: Record<EquipmentStatus, string> = { IN_USE: "Đang sử dụng", MAINTENANCE: "Bảo trì/Sửa chữa", INACTIVE: "Ngưng sử dụng" };
const STATUS_BADGE_TONE: Record<EquipmentStatus, string> = { IN_USE: "success", MAINTENANCE: "warning", INACTIVE: "muted" };

// Phân loại mức độ rủi ro TTBYT theo Điều 4 Nghị định 98/2021/NĐ-CP (còn
// hiệu lực sau khi đối chiếu NĐ 07/2023/NĐ-CP và NĐ 04/2025/NĐ-CP — cả hai
// không sửa Điều 4/5). Kết quả phân loại do người có chuyên môn QLCL tự xác
// định cho từng thiết bị, không phải trường hệ thống tự suy ra.
export type RiskClassification = "A" | "B" | "C" | "D";
export const RISK_CLASSIFICATION_LABEL: Record<RiskClassification, string> = {
  A: "Loại A — rủi ro thấp",
  B: "Loại B — rủi ro trung bình thấp",
  C: "Loại C — rủi ro trung bình cao",
  D: "Loại D — rủi ro cao",
};

type Equipment = {
  id: string;
  sequence_no: number | null;
  equipment_name: string;
  model_code: string | null;
  manufacturer: string | null;
  origin_country: string | null;
  year_manufactured: number | null;
  year_in_use: number | null;
  machine_code: string | null;
  registration_number: string | null;
  contract_from: string | null;
  contract_to: string | null;
  valid_from: string | null;
  department_id: string | null;
  // Nhãn khoa/phòng tự do nhập từ đợt số hóa dữ liệu đầu tiên (trước khi có
  // department_id) — chỉ còn là dữ liệu gốc hiển thị dự phòng cho các dòng
  // chưa ai xác nhận lại bằng dropdown; không còn ghi mới qua UI.
  department_label: string | null;
  notes: string | null;
  status: EquipmentStatus;
  risk_classification: RiskClassification | null;
};

type Form = {
  id?: string;
  sequence_no: string;
  equipment_name: string;
  model_code: string;
  manufacturer: string;
  origin_country: string;
  year_manufactured: string;
  year_in_use: string;
  machine_code: string;
  registration_number: string;
  contract_from: string;
  contract_to: string;
  valid_from: string;
  department_id: string;
  legacyDepartmentLabel: string;
  notes: string;
  status: EquipmentStatus;
  risk_classification: "" | RiskClassification;
};

const EMPTY: Form = {
  sequence_no: "", equipment_name: "", model_code: "", manufacturer: "", origin_country: "",
  year_manufactured: "", year_in_use: "", machine_code: "", registration_number: "",
  contract_from: "", contract_to: "", valid_from: "", department_id: "", legacyDepartmentLabel: "", notes: "", status: "IN_USE", risk_classification: "",
};

function toForm(e: Equipment): Form {
  return {
    id: e.id, sequence_no: e.sequence_no != null ? String(e.sequence_no) : "", equipment_name: e.equipment_name,
    model_code: e.model_code || "", manufacturer: e.manufacturer || "", origin_country: e.origin_country || "",
    year_manufactured: e.year_manufactured != null ? String(e.year_manufactured) : "",
    year_in_use: e.year_in_use != null ? String(e.year_in_use) : "",
    machine_code: e.machine_code || "", registration_number: e.registration_number || "",
    contract_from: e.contract_from || "", contract_to: e.contract_to || "", valid_from: e.valid_from || "",
    department_id: e.department_id || "", legacyDepartmentLabel: e.department_id ? "" : e.department_label || "", notes: e.notes || "", status: e.status,
    risk_classification: e.risk_classification || "",
  };
}

export function MedicalEquipmentClient({ initialEquipment, departments, canManage }: { initialEquipment: Equipment[]; departments: Department[]; canManage: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  // Phản hồi thực tế: department_label nhập tự do đợt số hóa đầu không khớp
  // tên khoa/phòng đã cấu hình — bộ lọc này giúp tìm nhanh các dòng còn
  // chưa ai chọn lại bằng dropdown (department_id null) để xác nhận.
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const unmappedCount = useMemo(() => initialEquipment.filter((e) => !e.department_id && e.department_label).length, [initialEquipment]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialEquipment
      .filter((e) => showInactive || e.status !== "INACTIVE")
      .filter((e) => !onlyUnmapped || (!e.department_id && e.department_label))
      .filter((e) => !q || [e.equipment_name, e.model_code, e.manufacturer, e.machine_code, e.registration_number, departments.find((d) => d.id === e.department_id)?.name, e.department_label].some((v) => (v || "").toLowerCase().includes(q)));
  }, [initialEquipment, search, showInactive, onlyUnmapped, departments]);

  // Dashboard tổng quan: luôn tính trên TOÀN BỘ sổ (initialEquipment), không
  // phụ thuộc bộ lọc/tìm kiếm của bảng bên dưới — tham khảo mẫu "Quản trị hệ
  // thống mạng" người dùng gửi (KPI + donut trạng thái + top khoa/phòng theo
  // số lượng tài sản).
  const dashboard = useMemo(() => {
    const total = initialEquipment.length;
    const countByStatus: Record<EquipmentStatus, number> = { IN_USE: 0, MAINTENANCE: 0, INACTIVE: 0 };
    for (const e of initialEquipment) countByStatus[e.status]++;
    const countByClassification: Record<RiskClassification, number> = { A: 0, B: 0, C: 0, D: 0 };
    let unclassified = 0;
    for (const e of initialEquipment) {
      if (e.risk_classification) countByClassification[e.risk_classification]++;
      else unclassified++;
    }
    const countByDept = new Map<string, number>();
    for (const e of initialEquipment) {
      const label = e.department_id ? departments.find((d) => d.id === e.department_id)?.name : e.department_label;
      if (!label) continue;
      countByDept.set(label, (countByDept.get(label) || 0) + 1);
    }
    const deptBars = Array.from(countByDept.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value]) => ({ label, value }));
    return { total, countByStatus, countByClassification, unclassified, deptBars };
  }, [initialEquipment, departments]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.equipment_name.trim()) return setMessage({ tone: "error", text: "Vui lòng nhập tên thiết bị." });
    setBusy(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {
        sequence_no: form.sequence_no || null, equipment_name: form.equipment_name.trim(),
        model_code: form.model_code.trim() || null, manufacturer: form.manufacturer.trim() || null,
        origin_country: form.origin_country.trim() || null,
        year_manufactured: form.year_manufactured || null, year_in_use: form.year_in_use || null,
        machine_code: form.machine_code.trim() || null, registration_number: form.registration_number.trim() || null,
        contract_from: form.contract_from || null, contract_to: form.contract_to || null, valid_from: form.valid_from || null,
        department_id: form.department_id || null, notes: form.notes.trim() || null,
        risk_classification: form.risk_classification || null,
      };
      if (form.id) payload.status = form.status;
      const res = await fetch(form.id ? `/api/medical-equipment/${form.id}` : "/api/medical-equipment", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không thể lưu thiết bị.");
      setMessage({ tone: "success", text: form.id ? "Đã cập nhật thiết bị." : "Đã thêm thiết bị." });
      router.refresh();
      setTimeout(() => setForm(null), 700);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Có lỗi xảy ra." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="panel ttbyt-dashboard">
        <div className="panel-title">
          <div>
            <h2>Tổng quan</h2>
            <p>Tổng hợp toàn bộ sổ, không phụ thuộc bộ lọc/tìm kiếm bên dưới.</p>
          </div>
        </div>
        <div className="ttbyt-kpis">
          <div className="kpi-tile"><span>Tổng thiết bị</span><strong>{dashboard.total}</strong></div>
          <div className="kpi-tile"><span>Đang sử dụng</span><strong>{dashboard.countByStatus.IN_USE}</strong></div>
          <div className="kpi-tile"><span>Bảo trì/Sửa chữa</span><strong>{dashboard.countByStatus.MAINTENANCE}</strong></div>
          <div className="kpi-tile"><span>Ngưng sử dụng</span><strong>{dashboard.countByStatus.INACTIVE}</strong></div>
        </div>
        <div className="ttbyt-charts">
          <div>
            <h3>Tình trạng thiết bị</h3>
            <TqmDonut
              value={dashboard.total ? Math.round((dashboard.countByStatus.IN_USE / dashboard.total) * 100) : 0}
              label="Đang sử dụng"
              segments={[
                { label: "Đang sử dụng", value: dashboard.countByStatus.IN_USE, tone: "green" },
                { label: "Bảo trì/Sửa chữa", value: dashboard.countByStatus.MAINTENANCE, tone: "amber" },
                { label: "Ngưng sử dụng", value: dashboard.countByStatus.INACTIVE, tone: "slate" },
              ]}
            />
          </div>
          <div>
            <h3>
              Phân loại TTBYT{" "}
              <span className="status-badge warning" title="Đề xuất rà soát theo Nghị định 98/2021/NĐ-CP, chưa được QLCL xác nhận chính thức cho từng thiết bị">
                chưa xác minh
              </span>
            </h3>
            <TqmDonut
              value={dashboard.total ? Math.round(((dashboard.total - dashboard.unclassified) / dashboard.total) * 100) : 0}
              label="Đã có phân loại"
              segments={[
                { label: "Loại A", value: dashboard.countByClassification.A, tone: "brand" },
                { label: "Loại B", value: dashboard.countByClassification.B, tone: "blue" },
                { label: "Loại C", value: dashboard.countByClassification.C, tone: "amber" },
                { label: "Loại D", value: dashboard.countByClassification.D, tone: "red" },
                { label: "Chưa xác định", value: dashboard.unclassified, tone: "slate" },
              ]}
            />
          </div>
          <div className="span-2">
            <h3>Thiết bị theo khoa/phòng (top 8)</h3>
            {dashboard.deptBars.length ? <TqmHorizontalBars rows={dashboard.deptBars} /> : <div className="empty-state compact">Chưa có thiết bị nào gắn khoa/phòng.</div>}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="toolbar">
          <div className="toolbar-left">
            <div className="search-box">
              <Icon name="search" size={18} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên, ký hiệu, hãng SX, mã máy, khoa..." />
            </div>
            <label className="inline-check">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Hiện thiết bị đã ngưng sử dụng
            </label>
            {unmappedCount ? (
              <label className="inline-check">
                <input type="checkbox" checked={onlyUnmapped} onChange={(e) => setOnlyUnmapped(e.target.checked)} /> Chỉ hiện chưa xác nhận khoa/phòng ({unmappedCount})
              </label>
            ) : null}
          </div>
          <div className="toolbar-left">
            <Link className="button tertiary" href="/api/medical-equipment/export">
              <Icon name="download" size={18} /> Xuất Excel
            </Link>
            {canManage ? (
              <button className="button primary" onClick={() => { setForm({ ...EMPTY }); setMessage(null); }}>
                <Icon name="plus" size={18} /> Thêm thiết bị
              </button>
            ) : null}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tên thiết bị</th>
                <th>Ký hiệu</th>
                <th>Hãng SX</th>
                <th>Năm SX / SD</th>
                <th>Mã máy</th>
                <th>Khoa sử dụng</th>
                <th>Trạng thái</th>
                <th>Phân loại</th>
                <th>QR / Lịch sử</th>
                {canManage ? <th></th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td><strong>{e.equipment_name}</strong></td>
                  <td>{e.model_code || "—"}</td>
                  <td>{[e.manufacturer, e.origin_country].filter(Boolean).join(" · ") || "—"}</td>
                  <td>{[e.year_manufactured, e.year_in_use].filter(Boolean).join(" / ") || "—"}</td>
                  <td>{e.machine_code || "—"}</td>
                  <td>
                    {e.department_id ? (
                      departments.find((d) => d.id === e.department_id)?.name || "—"
                    ) : e.department_label ? (
                      <span title="Nhãn gốc nhập từ đợt số hóa đầu tiên, chưa chọn lại theo danh mục khoa/phòng đã cấu hình">
                        {e.department_label} <span className="status-badge warning">chưa xác nhận</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td><span className={`status-badge ${STATUS_BADGE_TONE[e.status]}`}>{STATUS_LABEL[e.status]}</span></td>
                  <td>{e.risk_classification ? <span className="code-pill" title={RISK_CLASSIFICATION_LABEL[e.risk_classification]}>{e.risk_classification}</span> : "—"}</td>
                  <td>
                    <Link className="button tertiary small" href={`/medical-equipment/${e.id}`}>
                      <Icon name="qr-code" size={15} /> Chi tiết
                    </Link>
                  </td>
                  {canManage ? (
                    <td>
                      <button className="button tertiary small" onClick={() => { setForm(toForm(e)); setMessage(null); }}>
                        <Icon name="pencil" size={15} /> Sửa
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={canManage ? 10 : 9}><div className="empty-state">Chưa có thiết bị phù hợp.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {form ? (
        <div className="modal-backdrop">
          <form className="modal-card xl" onSubmit={submit}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">{form.id ? "CẬP NHẬT" : "THÊM MỚI"}</div>
                <h2>{form.id ? form.equipment_name : "Thiết bị mới"}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => !busy && setForm(null)}><Icon name="x" /></button>
            </div>
            <div className="modal-body">
              {message ? <div className={`alert ${message.tone}`}>{message.text}</div> : null}
              <div className="form-stack">
                <div className="form-grid two">
                  <label className="span-2">Tên thiết bị *<input value={form.equipment_name} onChange={(e) => setForm({ ...form, equipment_name: e.target.value })} /></label>
                  <label>Ký hiệu / Model<input value={form.model_code} onChange={(e) => setForm({ ...form, model_code: e.target.value })} /></label>
                  <label>Mã máy<input value={form.machine_code} onChange={(e) => setForm({ ...form, machine_code: e.target.value })} /></label>
                  <label>Hãng sản xuất<input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} /></label>
                  <label>Nước sản xuất<input value={form.origin_country} onChange={(e) => setForm({ ...form, origin_country: e.target.value })} /></label>
                  <label>Năm sản xuất<input type="number" value={form.year_manufactured} onChange={(e) => setForm({ ...form, year_manufactured: e.target.value })} /></label>
                  <label>Năm sử dụng<input type="number" value={form.year_in_use} onChange={(e) => setForm({ ...form, year_in_use: e.target.value })} /></label>
                  <label>Số lưu hành<input value={form.registration_number} onChange={(e) => setForm({ ...form, registration_number: e.target.value })} /></label>
                  <label>
                    Khoa sử dụng
                    <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                      <option value="">— Chưa chọn —</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    {form.legacyDepartmentLabel ? <small>Nhãn gốc từ đợt số hóa đầu tiên: &ldquo;{form.legacyDepartmentLabel}&rdquo; — chọn khoa/phòng đúng ở trên để xác nhận.</small> : null}
                  </label>
                  <label>Hợp đồng từ<input type="date" value={form.contract_from} onChange={(e) => setForm({ ...form, contract_from: e.target.value })} /></label>
                  <label>Hợp đồng đến<input type="date" value={form.contract_to} onChange={(e) => setForm({ ...form, contract_to: e.target.value })} /></label>
                  <label>Hiệu lực từ<input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} /></label>
                  <label>STT (thứ tự sổ)<input type="number" value={form.sequence_no} onChange={(e) => setForm({ ...form, sequence_no: e.target.value })} /></label>
                  <label>
                    Phân loại TTBYT
                    <select value={form.risk_classification} onChange={(e) => setForm({ ...form, risk_classification: e.target.value as Form["risk_classification"] })}>
                      <option value="">— Chưa xác định —</option>
                      {(Object.keys(RISK_CLASSIFICATION_LABEL) as RiskClassification[]).map((k) => (
                        <option key={k} value={k}>{RISK_CLASSIFICATION_LABEL[k]}</option>
                      ))}
                    </select>
                    <small>Theo Điều 4 Nghị định 98/2021/NĐ-CP — do người có chuyên môn QLCL tự xác định cho từng thiết bị.</small>
                  </label>
                  {form.id ? (
                    <label>
                      Trạng thái
                      <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as EquipmentStatus })}>
                        <option value="IN_USE">Đang sử dụng</option>
                        <option value="MAINTENANCE">Bảo trì/Sửa chữa</option>
                        <option value="INACTIVE">Ngưng sử dụng</option>
                      </select>
                      <small>Bảo trì/Sửa chữa và Ngưng sử dụng cũng ghi được qua tab &quot;Chi tiết&quot; — Lịch sử bàn giao/bảo trì, kèm mốc thời gian.</small>
                    </label>
                  ) : null}
                  <label className="span-2">Ghi chú<textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="button secondary" onClick={() => setForm(null)} disabled={busy}>Hủy</button>
              <button className="button primary" disabled={busy}><Icon name="save" size={17} />{busy ? "Đang lưu..." : "Lưu thiết bị"}</button>
            </div>
          </form>
        </div>
      ) : null}
      <style>{TQM_CHART_CSS + `
        .ttbyt-dashboard .ttbyt-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:0 19px 16px}.ttbyt-dashboard .ttbyt-kpis>*{min-width:0}
        .ttbyt-dashboard .kpi-tile{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:4px}
        .ttbyt-dashboard .kpi-tile span{font-size:11px;color:var(--muted);font-weight:700}
        .ttbyt-dashboard .kpi-tile strong{font-size:22px}
        .ttbyt-dashboard .ttbyt-charts{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:0 19px 19px}
        .ttbyt-dashboard .ttbyt-charts h3{margin:0 0 6px;font-size:13px}
        .ttbyt-dashboard .ttbyt-charts h3 .status-badge{font-size:9px;padding:2px 7px;vertical-align:middle}
        .ttbyt-dashboard .ttbyt-charts .span-2{grid-column:1/-1}
        @media(max-width:760px){.ttbyt-dashboard .ttbyt-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.ttbyt-dashboard .ttbyt-charts{grid-template-columns:1fr}.ttbyt-dashboard .ttbyt-charts .span-2{grid-column:auto}}
      `}</style>
    </>
  );
}
