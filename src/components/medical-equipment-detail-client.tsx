/* eslint-disable @next/next/no-img-element -- Mã QR là data URL tạo client-side (qrcode), không phải ảnh tĩnh/remote để Next tối ưu. */
"use client";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { Icon } from "@/components/icon";
import { RISK_CLASSIFICATION_LABEL, type EquipmentStatus, type RiskClassification } from "@/components/medical-equipment-client";

type Department = { id: string; name: string };
type Profile = { user_id: string; full_name: string | null; email: string | null };

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
  department_label: string | null;
  notes: string | null;
  status: EquipmentStatus;
  risk_classification: RiskClassification | null;
};

type EventType = "ASSIGN" | "TRANSFER" | "RETURN" | "MAINTENANCE_START" | "MAINTENANCE_DONE" | "NOTE";

type Event = {
  id: string;
  equipment_id: string;
  event_type: EventType;
  to_department_id: string | null;
  event_date: string;
  note: string | null;
  created_by: string;
  created_at: string;
};

const STATUS_LABEL: Record<EquipmentStatus, string> = { IN_USE: "Đang sử dụng", MAINTENANCE: "Bảo trì/Sửa chữa", INACTIVE: "Ngưng sử dụng" };
const STATUS_BADGE_TONE: Record<EquipmentStatus, string> = { IN_USE: "success", MAINTENANCE: "warning", INACTIVE: "muted" };
const EVENT_TYPE_LABEL: Record<EventType, string> = {
  ASSIGN: "Cấp phát",
  TRANSFER: "Chuyển khoa / Bàn giao",
  RETURN: "Thu hồi",
  MAINTENANCE_START: "Đưa vào bảo trì/sửa chữa",
  MAINTENANCE_DONE: "Hoàn tất bảo trì — đưa lại sử dụng",
  NOTE: "Khác",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("vi-VN").format(new Date(`${d}T00:00:00`));
}

export function MedicalEquipmentDetailClient({
  equipment,
  departments,
  initialEvents,
  profiles,
  canManage,
}: {
  equipment: Equipment;
  departments: Department[];
  initialEvents: Event[];
  profiles: Profile[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventType, setEventType] = useState<EventType>("ASSIGN");
  const [toDepartmentId, setToDepartmentId] = useState("");
  const [eventDate, setEventDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const departmentName = (id: string | null) => (id ? departments.find((d) => d.id === id)?.name : null) || "—";
  const profileName = (id: string) => { const p = profiles.find((x) => x.user_id === id); return p?.full_name || p?.email || id; };

  useEffect(() => {
    const url = `${window.location.origin}/medical-equipment/${equipment.id}`;
    QRCode.toDataURL(url, { width: 220, margin: 1 }).then(setQrDataUrl).catch(() => setQrDataUrl(""));
  }, [equipment.id]);

  async function submitEvent(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/medical-equipment/${equipment.id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_type: eventType, to_department_id: toDepartmentId || null, event_date: eventDate, note: note.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không ghi nhận được sự kiện.");
      setShowEventForm(false);
      setToDepartmentId("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Thông tin thiết bị</h2>
            <p>Dữ liệu sổ quản lý TTBYT — mã QR dưới đây dùng để quét tra cứu nhanh ngay trên thiết bị.</p>
          </div>
          <span className={`status-badge ${STATUS_BADGE_TONE[equipment.status]}`}>{STATUS_LABEL[equipment.status]}</span>
        </div>
        <div className="detail-grid">
          <div><span>Ký hiệu / Model</span>{equipment.model_code || "—"}</div>
          <div><span>Mã máy</span>{equipment.machine_code || "—"}</div>
          <div><span>Hãng sản xuất</span>{equipment.manufacturer || "—"}</div>
          <div><span>Nước sản xuất</span>{equipment.origin_country || "—"}</div>
          <div><span>Năm SX / SD</span>{[equipment.year_manufactured, equipment.year_in_use].filter(Boolean).join(" / ") || "—"}</div>
          <div><span>Số lưu hành</span>{equipment.registration_number || "—"}</div>
          <div><span>Khoa sử dụng</span>{equipment.department_id ? departmentName(equipment.department_id) : equipment.department_label || "—"}</div>
          <div><span>Phân loại TTBYT</span>{equipment.risk_classification ? RISK_CLASSIFICATION_LABEL[equipment.risk_classification] : "— Chưa xác định —"}</div>
          <div><span>Hợp đồng</span>{[formatDate(equipment.contract_from), formatDate(equipment.contract_to)].join(" – ")}</div>
          <div><span>Hiệu lực từ</span>{formatDate(equipment.valid_from)}</div>
          <div><span>Ghi chú</span>{equipment.notes || "—"}</div>
        </div>
      </section>

      <section className="panel ttbyt-qr-panel">
        <div className="panel-title"><h2>Mã QR tra cứu</h2></div>
        <div className="ttbyt-qr-body">
          {qrDataUrl ? <img src={qrDataUrl} alt={`Mã QR của ${equipment.equipment_name}`} width={180} height={180} /> : <div className="loading-state compact">Đang tạo mã QR...</div>}
          <div>
            <p>Dán mã này lên thiết bị. Quét bằng camera điện thoại sẽ mở đúng trang chi tiết này (cần đăng nhập hệ thống).</p>
            {qrDataUrl ? (
              <a className="button secondary small" download={`qr-${equipment.machine_code || equipment.id}.png`} href={qrDataUrl}>
                <Icon name="download" size={15} /> Tải mã QR
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Lịch sử bàn giao/bảo trì</h2>
            <p>Cấp phát, chuyển khoa, thu hồi và bảo trì/sửa chữa theo thời gian.</p>
          </div>
          {canManage ? (
            <button className="button primary" onClick={() => { setShowEventForm(true); setError(""); }}>
              <Icon name="plus" size={18} /> Thêm sự kiện
            </button>
          ) : null}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Loại sự kiện</th>
                <th>Khoa nhận</th>
                <th>Ghi chú</th>
                <th>Người ghi nhận</th>
              </tr>
            </thead>
            <tbody>
              {initialEvents.map((ev) => (
                <tr key={ev.id}>
                  <td>{formatDate(ev.event_date)}</td>
                  <td>{EVENT_TYPE_LABEL[ev.event_type]}</td>
                  <td>{ev.to_department_id ? departmentName(ev.to_department_id) : "—"}</td>
                  <td>{ev.note || "—"}</td>
                  <td>{profileName(ev.created_by)}</td>
                </tr>
              ))}
              {!initialEvents.length ? <tr><td colSpan={5}><div className="empty-state">Chưa có sự kiện nào được ghi nhận.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <Link className="button tertiary" href="/medical-equipment"><Icon name="arrow-left" size={16} /> Quay lại sổ TTBYT</Link>

      {showEventForm ? (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={submitEvent}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">SỰ KIỆN MỚI</div>
                <h2>{equipment.equipment_name}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => !busy && setShowEventForm(false)}><Icon name="x" /></button>
            </div>
            <div className="modal-body">
              {error ? <div className="alert error">{error}</div> : null}
              <div className="form-stack">
                <div className="form-grid two">
                  <label className="span-2">
                    Loại sự kiện
                    <select value={eventType} onChange={(e) => setEventType(e.target.value as EventType)}>
                      {(Object.keys(EVENT_TYPE_LABEL) as EventType[]).map((k) => (
                        <option key={k} value={k}>{EVENT_TYPE_LABEL[k]}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Khoa nhận (nếu có)
                    <select value={toDepartmentId} onChange={(e) => setToDepartmentId(e.target.value)}>
                      <option value="">— Không chọn —</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>Ngày<input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} /></label>
                  <label className="span-2">Ghi chú<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="button secondary" onClick={() => setShowEventForm(false)} disabled={busy}>Hủy</button>
              <button className="button primary" disabled={busy}><Icon name="save" size={17} />{busy ? "Đang lưu..." : "Lưu sự kiện"}</button>
            </div>
          </form>
        </div>
      ) : null}
      <style>{`
        .ttbyt-qr-body{display:flex;gap:18px;align-items:center;padding:0 19px 19px;flex-wrap:wrap;min-width:0}
        .ttbyt-qr-body img{border:1px solid var(--line);border-radius:12px;padding:10px;background:#fff}
        .ttbyt-qr-body p{margin:0 0 10px;color:var(--muted);font-size:12px;max-width:420px}
      `}</style>
    </>
  );
}
