"use client";

import { useState } from "react";

type Department = { id: string; name: string };
type Registration = {
  id: string;
  department_id: string;
  physician_name: string;
  physician_code: string | null;
  role_type: "GDTT_TK" | "BS";
  case_type: "NEW_HIRE" | "INTERNAL_TRANSFER";
  effective_date: string;
  deadline: string;
  status: "PENDING" | "REGISTERED";
  notes: string | null;
};

const ROLE_LABEL: Record<string, string> = { GDTT_TK: "GĐTT / Trưởng khoa", BS: "Bác sĩ" };
const CASE_LABEL: Record<string, string> = { NEW_HIRE: "Nhân sự mới", INTERNAL_TRANSFER: "Luân chuyển nội bộ" };

const DUE_SOON_WINDOW_DAYS = 5;

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(new Date(`${value}T00:00:00`));
}
function daysUntil(deadline: string, now: string) {
  return Math.round((Date.parse(`${deadline}T00:00:00+07:00`) - Date.parse(`${now}T00:00:00+07:00`)) / 86400000);
}

export function PhysicianLicenseClient({
  departments,
  initialRegistrations,
  canManage,
}: {
  departments: Department[];
  initialRegistrations: Registration[];
  canManage: boolean;
}) {
  const [registrations, setRegistrations] = useState(initialRegistrations);
  const [departmentId, setDepartmentId] = useState(departments[0]?.id || "");
  const [physicianName, setPhysicianName] = useState("");
  const [physicianCode, setPhysicianCode] = useState("");
  const [roleType, setRoleType] = useState<"GDTT_TK" | "BS">("BS");
  const [caseType, setCaseType] = useState<"NEW_HIRE" | "INTERNAL_TRANSFER">("NEW_HIRE");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [onlyPending, setOnlyPending] = useState(true);

  const departmentName = (id: string) => departments.find((d) => d.id === id)?.name || "—";

  async function submit() {
    if (!physicianName.trim()) {
      setError("Chưa nhập tên bác sĩ.");
      return;
    }
    if (!effectiveDate) {
      setError("Chưa chọn ngày hiệu lực.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/physician-license/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        department_id: departmentId,
        physician_name: physicianName.trim(),
        physician_code: physicianCode.trim() || null,
        role_type: roleType,
        case_type: caseType,
        effective_date: effectiveDate,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error || "Không lưu được.");
      return;
    }
    setRegistrations((v) => [body.registration as Registration, ...v]);
    setPhysicianName("");
    setPhysicianCode("");
    setEffectiveDate("");
  }

  async function markRegistered(reg: Registration) {
    setError("");
    const res = await fetch(`/api/physician-license/registrations/${reg.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "REGISTER" }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Không cập nhật được.");
      return;
    }
    setRegistrations((v) => v.map((r) => (r.id === reg.id ? { ...r, ...body.registration } : r)));
  }

  const visible = onlyPending ? registrations.filter((r) => r.status === "PENDING") : registrations;
  const now = today();

  return (
    <div className="physician-license-overview">
      {canManage ? (
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Khai báo đăng ký hành nghề</h2>
              <p>Hạn tự tính: GĐTT/Trưởng khoa 14 ngày, Bác sĩ 60 ngày kể từ ngày hiệu lực; luân chuyển nội bộ phải đăng ký trước 10 ngày.</p>
            </div>
          </div>
          <div className="pl-form">
            <input className="input" placeholder="Tên bác sĩ..." value={physicianName} onChange={(e) => setPhysicianName(e.target.value)} />
            <div className="pl-form-row">
              <select className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} disabled={!departments.length}>
                {departments.length ? null : <option value="">— Chưa có khoa/phòng nào —</option>}
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <input className="input" placeholder="Mã nhân viên (tùy chọn)" value={physicianCode} onChange={(e) => setPhysicianCode(e.target.value)} />
            </div>
            <div className="pl-form-row">
              <select className="input" value={roleType} onChange={(e) => setRoleType(e.target.value as any)}>
                <option value="BS">Bác sĩ</option>
                <option value="GDTT_TK">GĐTT / Trưởng khoa</option>
              </select>
              <select className="input" value={caseType} onChange={(e) => setCaseType(e.target.value as any)}>
                <option value="NEW_HIRE">Nhân sự mới</option>
                <option value="INTERNAL_TRANSFER">Luân chuyển nội bộ</option>
              </select>
              <input className="input" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
            {error ? <div className="alert error">{error}</div> : null}
            <button className="button primary" disabled={busy || !physicianName.trim() || !effectiveDate || !departmentId} onClick={() => void submit()}>
              Khai báo
            </button>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-title">
          <h2>Danh sách theo dõi</h2>
          <label className="inline-check">
            <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} /> Chỉ hiện chưa đăng ký
          </label>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Bác sĩ</th>
                <th>Khoa/Phòng</th>
                <th>Vai trò</th>
                <th>Trường hợp</th>
                <th>Hạn đăng ký</th>
                <th>Trạng thái</th>
                {canManage ? <th>Thao tác</th> : null}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const overdue = r.status === "PENDING" && r.deadline < now;
                const dueSoon = r.status === "PENDING" && !overdue && daysUntil(r.deadline, now) <= DUE_SOON_WINDOW_DAYS;
                return (
                  <tr key={r.id}>
                    <td>
                      {r.physician_name}
                      {r.physician_code ? ` (${r.physician_code})` : ""}
                    </td>
                    <td>{departmentName(r.department_id)}</td>
                    <td>{ROLE_LABEL[r.role_type]}</td>
                    <td>{CASE_LABEL[r.case_type]}</td>
                    <td>{formatDate(r.deadline)}</td>
                    <td>
                      <span className={`status-badge ${r.status === "REGISTERED" ? "success" : overdue ? "danger" : dueSoon ? "warning" : "info"}`}>
                        {r.status === "REGISTERED" ? "Đã đăng ký" : overdue ? "Quá hạn" : dueSoon ? "Sắp hết hạn" : "Chưa đăng ký"}
                      </span>
                    </td>
                    {canManage ? (
                      <td>
                        {r.status === "PENDING" ? (
                          <button className="button primary small" onClick={() => void markRegistered(r)}>
                            Đánh dấu đã đăng ký
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {!visible.length ? (
                <tr>
                  <td colSpan={canManage ? 7 : 6} className="empty-state compact">
                    Không có bản ghi nào.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <style jsx>{`
        .physician-license-overview {
          display: grid;
          gap: 16px;
        }
        .pl-form {
          display: grid;
          gap: 8px;
          padding: 0 12px 12px;
        }
        .pl-form-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
        }
        @media (max-width: 760px) {
          .pl-form-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
