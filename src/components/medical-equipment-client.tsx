"use client";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

type Department = { id: string; name: string };

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
  is_active: boolean;
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
  is_active: boolean;
};

const EMPTY: Form = {
  sequence_no: "", equipment_name: "", model_code: "", manufacturer: "", origin_country: "",
  year_manufactured: "", year_in_use: "", machine_code: "", registration_number: "",
  contract_from: "", contract_to: "", valid_from: "", department_id: "", legacyDepartmentLabel: "", notes: "", is_active: true,
};

function toForm(e: Equipment): Form {
  return {
    id: e.id, sequence_no: e.sequence_no != null ? String(e.sequence_no) : "", equipment_name: e.equipment_name,
    model_code: e.model_code || "", manufacturer: e.manufacturer || "", origin_country: e.origin_country || "",
    year_manufactured: e.year_manufactured != null ? String(e.year_manufactured) : "",
    year_in_use: e.year_in_use != null ? String(e.year_in_use) : "",
    machine_code: e.machine_code || "", registration_number: e.registration_number || "",
    contract_from: e.contract_from || "", contract_to: e.contract_to || "", valid_from: e.valid_from || "",
    department_id: e.department_id || "", legacyDepartmentLabel: e.department_id ? "" : e.department_label || "", notes: e.notes || "", is_active: e.is_active,
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
      .filter((e) => showInactive || e.is_active)
      .filter((e) => !onlyUnmapped || (!e.department_id && e.department_label))
      .filter((e) => !q || [e.equipment_name, e.model_code, e.manufacturer, e.machine_code, e.registration_number, departments.find((d) => d.id === e.department_id)?.name, e.department_label].some((v) => (v || "").toLowerCase().includes(q)));
  }, [initialEquipment, search, showInactive, onlyUnmapped, departments]);

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
      };
      if (form.id) payload.is_active = form.is_active;
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
          {canManage ? (
            <button className="button primary" onClick={() => { setForm({ ...EMPTY }); setMessage(null); }}>
              <Icon name="plus" size={18} /> Thêm thiết bị
            </button>
          ) : null}
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
                  <td><span className={`status-badge ${e.is_active ? "success" : "muted"}`}>{e.is_active ? "Đang sử dụng" : "Ngưng sử dụng"}</span></td>
                  {canManage ? (
                    <td>
                      <button className="button tertiary small" onClick={() => { setForm(toForm(e)); setMessage(null); }}>
                        <Icon name="pencil" size={15} /> Sửa
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={canManage ? 8 : 7}><div className="empty-state">Chưa có thiết bị phù hợp.</div></td></tr> : null}
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
                  <label className="span-2">Ghi chú<textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
                </div>
                {form.id ? (
                  <label className="switch-row">
                    <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                    <span><strong>Đang sử dụng</strong><small>Bỏ chọn để đánh dấu thiết bị đã ngưng sử dụng/thanh lý; dữ liệu vẫn được giữ lại.</small></span>
                  </label>
                ) : null}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="button secondary" onClick={() => setForm(null)} disabled={busy}>Hủy</button>
              <button className="button primary" disabled={busy}><Icon name="save" size={17} />{busy ? "Đang lưu..." : "Lưu thiết bị"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
