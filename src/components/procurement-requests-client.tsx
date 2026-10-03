"use client";

import { useState } from "react";

type Department = { id: string; name: string };
type Req = {
  id: string;
  department_id: string;
  request_type: "NEW_PURCHASE" | "REPAIR" | "TRANSFER";
  urgency: "NORMAL" | "URGENT";
  title: string;
  description: string | null;
  submitted_at: string;
  status: "SUBMITTED" | "BGD_APPROVED" | "BGD_REJECTED" | "TGD_APPROVED" | "TGD_REJECTED" | "NOTIFIED";
  bgd_note: string | null;
  tgd_note: string | null;
};

const TYPE_LABEL: Record<string, string> = { NEW_PURCHASE: "Mua mới", REPAIR: "Sửa chữa", TRANSFER: "Điều chuyển kho" };
const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Chờ BGĐ duyệt",
  BGD_APPROVED: "BGĐ đã duyệt — chờ TGĐ",
  BGD_REJECTED: "BGĐ không duyệt",
  TGD_APPROVED: "TGĐ đã duyệt",
  TGD_REJECTED: "TGĐ không duyệt",
  NOTIFIED: "Đã thông báo đơn vị",
};

export function ProcurementRequestsClient({
  departments,
  initialRequests,
  canManage,
}: {
  departments: Department[];
  initialRequests: Req[];
  canManage: boolean;
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [departmentId, setDepartmentId] = useState(departments[0]?.id || "");
  const [requestType, setRequestType] = useState<"NEW_PURCHASE" | "REPAIR" | "TRANSFER">("NEW_PURCHASE");
  const [urgency, setUrgency] = useState<"NORMAL" | "URGENT">("NORMAL");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notingId, setNotingId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const departmentName = (id: string) => departments.find((d) => d.id === id)?.name || "—";

  async function submit() {
    if (!title.trim()) {
      setError("Chưa nhập tên đề xuất.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/procurement/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ department_id: departmentId, request_type: requestType, urgency, title: title.trim(), description: description.trim() || null }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error || "Không gửi được đề xuất.");
      return;
    }
    setRequests((v) => [body.request as Req, ...v]);
    setTitle("");
    setDescription("");
    setUrgency("NORMAL");
  }

  async function act(req: Req, action: string, note?: string) {
    setError("");
    const res = await fetch(`/api/procurement/requests/${req.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Không thực hiện được thao tác.");
      return;
    }
    setRequests((v) => v.map((r) => (r.id === req.id ? { ...r, ...body.request } : r)));
    setNotingId(null);
    setNoteText("");
    setPendingAction(null);
  }

  function startNote(req: Req, action: string) {
    setNotingId(req.id);
    setPendingAction(action);
    setNoteText("");
  }

  return (
    <div className="procurement-overview">
      {canManage ? (
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Tiếp nhận đề xuất mới</h2>
              <p>Ghi nhận đề xuất mua sắm/sửa chữa từ khoa/phòng để trình duyệt.</p>
            </div>
          </div>
          <div className="procurement-form">
            <input className="input" placeholder="Tên đề xuất..." value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />
            <div className="procurement-form-row">
              <select className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} disabled={!departments.length}>
                {departments.length ? null : <option value="">— Chưa có khoa/phòng nào —</option>}
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select className="input" value={requestType} onChange={(e) => setRequestType(e.target.value as any)}>
                <option value="NEW_PURCHASE">Mua mới</option>
                <option value="REPAIR">Sửa chữa</option>
                <option value="TRANSFER">Điều chuyển kho</option>
              </select>
              <select className="input" value={urgency} onChange={(e) => setUrgency(e.target.value as any)}>
                <option value="NORMAL">Thường quy</option>
                <option value="URGENT">Khẩn</option>
              </select>
            </div>
            <textarea className="input" rows={2} placeholder="Mô tả chi tiết (tùy chọn)..." value={description} onChange={(e) => setDescription(e.target.value)} />
            {error ? <div className="alert error">{error}</div> : null}
            <button className="button primary" disabled={busy || !title.trim() || !departmentId} onClick={() => void submit()}>
              Gửi đề xuất
            </button>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-title">
          <h2>Danh sách đề xuất</h2>
        </div>
        <div className="work-list">
          {requests.map((r) => (
            <div className="work-row" key={r.id}>
              <div className="work-main">
                <strong>{r.title}</strong>
                <small>
                  {departmentName(r.department_id)} · {TYPE_LABEL[r.request_type]} · {r.urgency === "URGENT" ? "Khẩn" : "Thường quy"} · {STATUS_LABEL[r.status]}
                  {r.bgd_note ? ` · BGĐ: ${r.bgd_note}` : ""}
                  {r.tgd_note ? ` · TGĐ: ${r.tgd_note}` : ""}
                </small>
                {notingId === r.id ? (
                  <div className="procurement-note">
                    <textarea className="input" rows={2} placeholder="Ghi chú quyết định (tùy chọn)..." value={noteText} onChange={(e) => setNoteText(e.target.value)} />
                    <div className="procurement-note-actions">
                      <button className="button primary small" onClick={() => void act(r, pendingAction!, noteText)}>
                        Xác nhận
                      </button>
                      <button className="button tertiary small" onClick={() => setNotingId(null)}>
                        Hủy
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
              {canManage && notingId !== r.id ? (
                <div className="procurement-actions">
                  {r.status === "SUBMITTED" ? (
                    <>
                      <button className="button primary small" onClick={() => startNote(r, "BGD_APPROVE")}>
                        BGĐ duyệt
                      </button>
                      <button className="button tertiary small" onClick={() => startNote(r, "BGD_REJECT")}>
                        BGĐ không duyệt
                      </button>
                    </>
                  ) : null}
                  {r.status === "BGD_APPROVED" ? (
                    <>
                      <button className="button primary small" onClick={() => startNote(r, "TGD_APPROVE")}>
                        TGĐ duyệt
                      </button>
                      <button className="button tertiary small" onClick={() => startNote(r, "TGD_REJECT")}>
                        TGĐ không duyệt
                      </button>
                    </>
                  ) : null}
                  {["TGD_APPROVED", "BGD_REJECTED", "TGD_REJECTED"].includes(r.status) ? (
                    <button className="button secondary small" onClick={() => void act(r, "NOTIFY")}>
                      Thông báo đơn vị
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
          {!requests.length ? <div className="empty-state compact">Chưa có đề xuất nào.</div> : null}
        </div>
      </section>
      <style jsx>{`
        .procurement-overview {
          display: grid;
          gap: 16px;
        }
        .procurement-form {
          display: grid;
          gap: 8px;
          padding: 0 12px 12px;
        }
        .procurement-form-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
        }
        .procurement-note {
          display: grid;
          gap: 6px;
          margin-top: 6px;
        }
        .procurement-note-actions {
          display: flex;
          gap: 8px;
        }
        .procurement-actions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          align-items: flex-start;
        }
        @media (max-width: 760px) {
          .procurement-form-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
