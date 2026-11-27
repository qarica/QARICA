"use client";

import { useState } from "react";
import { EISENHOWER_ACTION, EISENHOWER_LABEL, EISENHOWER_QUADRANTS, EISENHOWER_TONE, type EisenhowerQuadrant } from "@/lib/eisenhower";

import { VnDateInput } from "@/components/vn-date-input";
type Staff = { id: string; name: string };
type Item = {
  id: string;
  work_plan_id: string;
  title: string;
  why_text: string | null;
  where_text: string | null;
  how_text: string | null;
  due_date: string | null;
  eisenhower_quadrant: EisenhowerQuadrant;
  status: "OPEN" | "DONE" | "CANCELLED";
  assignee_user_id: string | null;
};
type Plan = {
  id: string;
  title: string;
  smart_measurable: string | null;
  target_date: string | null;
  status: "OPEN" | "DONE" | "CANCELLED";
  items: Item[];
};

const STATUS_LABEL: Record<string, string> = { OPEN: "Đang mở", DONE: "Hoàn thành", CANCELLED: "Đã huỷ" };
const STATUS_TONE: Record<string, string> = { OPEN: "info", DONE: "success", CANCELLED: "muted" };

function formatDate(value: string | null) {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function WorkPlansClient({ initialPlans, staffRoster, canManage }: { initialPlans: Plan[]; staffRoster: Staff[]; canManage: boolean }) {
  const [plans, setPlans] = useState(initialPlans);
  const [error, setError] = useState("");
  const staffName = (id: string) => staffRoster.find((s) => s.id === id)?.name || "—";

  // Tạo kế hoạch (SMART: Specific=title, Measurable=smartMeasurable, Time-bound=targetDate)
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [smartMeasurable, setSmartMeasurable] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function createPlan() {
    const clean = title.trim();
    if (!clean) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/work-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: clean, smart_measurable: smartMeasurable.trim() || null, target_date: targetDate || null }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error || "Không tạo được kế hoạch.");
      return;
    }
    setPlans((v) => [{ ...(body.plan as Plan), items: [] }, ...v]);
    setTitle("");
    setSmartMeasurable("");
    setTargetDate("");
    setFormOpen(false);
  }

  async function deletePlan(plan: Plan) {
    if (!window.confirm(`Xoá kế hoạch "${plan.title}" và toàn bộ đầu việc bên trong? Không thể hoàn tác.`)) return;
    setError("");
    const res = await fetch(`/api/work-plans/${plan.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Không xoá được kế hoạch.");
      return;
    }
    setPlans((v) => v.filter((p) => p.id !== plan.id));
  }

  async function togglePlanStatus(plan: Plan) {
    const next = plan.status === "DONE" ? "OPEN" : "DONE";
    setError("");
    const res = await fetch(`/api/work-plans/${plan.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Không cập nhật được.");
      return;
    }
    setPlans((v) => v.map((p) => (p.id === plan.id ? { ...p, status: body.plan.status } : p)));
  }

  // Đầu việc mới (5W1H + Eisenhower + người phụ trách) — form mở theo từng kế hoạch
  const [itemFormPlanId, setItemFormPlanId] = useState<string | null>(null);
  const [itemTitle, setItemTitle] = useState("");
  const [itemWhy, setItemWhy] = useState("");
  const [itemWhere, setItemWhere] = useState("");
  const [itemHow, setItemHow] = useState("");
  const [itemDue, setItemDue] = useState("");
  const [itemQuadrant, setItemQuadrant] = useState<EisenhowerQuadrant>("P2");
  const [itemAssignee, setItemAssignee] = useState("");
  const [itemBusy, setItemBusy] = useState(false);

  function resetItemForm() {
    setItemFormPlanId(null);
    setItemTitle("");
    setItemWhy("");
    setItemWhere("");
    setItemHow("");
    setItemDue("");
    setItemQuadrant("P2");
    setItemAssignee("");
  }

  async function createItem(planId: string) {
    const clean = itemTitle.trim();
    if (!clean || !itemAssignee) return;
    setItemBusy(true);
    setError("");
    const res = await fetch(`/api/work-plans/${planId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: clean,
        why_text: itemWhy.trim() || null,
        where_text: itemWhere.trim() || null,
        how_text: itemHow.trim() || null,
        due_date: itemDue || null,
        eisenhower_quadrant: itemQuadrant,
        assignee_user_id: itemAssignee,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setItemBusy(false);
    if (!res.ok) {
      setError(body.error || "Không tạo được đầu việc.");
      return;
    }
    setPlans((v) => v.map((p) => (p.id === planId ? { ...p, items: [...p.items, body.item as Item] } : p)));
    resetItemForm();
  }

  async function deleteItem(planId: string, item: Item) {
    if (!window.confirm(`Xoá đầu việc "${item.title}"? Không thể hoàn tác.`)) return;
    setError("");
    const res = await fetch(`/api/work-plans/${planId}/items/${item.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Không xoá được.");
      return;
    }
    setPlans((v) => v.map((p) => (p.id === planId ? { ...p, items: p.items.filter((i) => i.id !== item.id) } : p)));
  }

  async function toggleItemStatus(planId: string, item: Item) {
    const next = item.status === "DONE" ? "OPEN" : "DONE";
    setError("");
    const res = await fetch(`/api/work-plans/${planId}/items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Không cập nhật được.");
      return;
    }
    setPlans((v) => v.map((p) => (p.id === planId ? { ...p, items: p.items.map((i) => (i.id === item.id ? { ...i, status: body.item.status } : i)) } : p)));
  }

  // Đổi người phụ trách trực tiếp trong 1 lần gọi API (PATCH assignee_user_id).
  const [transferItemId, setTransferItemId] = useState<string | null>(null);
  const [transferPerson, setTransferPerson] = useState("");

  async function transferAssignee(planId: string, item: Item) {
    if (!transferPerson) return;
    setError("");
    const res = await fetch(`/api/work-plans/${planId}/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignee_user_id: transferPerson }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Không đổi được người phụ trách.");
      return;
    }
    setPlans((v) => v.map((p) => (p.id === planId ? { ...p, items: p.items.map((i) => (i.id === item.id ? { ...i, assignee_user_id: body.item.assignee_user_id } : i)) } : p)));
    setTransferItemId(null);
    setTransferPerson("");
  }

  // Ma trận Eisenhower: tổng hợp mọi đầu việc đang mở (OPEN) của mọi kế
  // hoạch — quadrant ở đây là lựa chọn trực tiếp lúc tạo (không tính như
  // personal_reminders), xem src/lib/eisenhower.ts.
  const openItems = plans.flatMap((p) => p.items.filter((i) => i.status === "OPEN").map((i) => ({ ...i, planTitle: p.title })));

  return (
    <div className="wp-overview">
      {error ? <div className="alert error">{error}</div> : null}

      {canManage ? (
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Tạo kế hoạch mới</h2>
              <p>SMART: mục tiêu cụ thể + chỉ tiêu đo lường được + hạn chót.</p>
            </div>
          </div>
          <button type="button" className="button secondary small" aria-expanded={formOpen} onClick={() => setFormOpen((v) => !v)}>
            {formOpen ? "Thu gọn" : "+ Tạo kế hoạch"}
          </button>
          {formOpen ? (
            <div className="wp-form">
              <input className="input" placeholder="Mục tiêu kế hoạch (Specific)..." value={title} onChange={(e) => setTitle(e.target.value)} />
              <div className="wp-form-row">
                <input className="input" placeholder="Chỉ tiêu đo lường được (Measurable)..." value={smartMeasurable} onChange={(e) => setSmartMeasurable(e.target.value)} />
                <label>
                  <span>Hạn chót (Time-bound)</span>
                  <VnDateInput className="input" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
                </label>
              </div>
              <button className="button primary small" disabled={busy || !title.trim()} onClick={() => void createPlan()}>
                Tạo kế hoạch
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {openItems.length ? (
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Ma trận Eisenhower</h2>
              <p>Toàn bộ đầu việc đang mở, mọi kế hoạch — xếp theo quan trọng × khẩn cấp.</p>
            </div>
          </div>
          <div className="wp-matrix">
            {EISENHOWER_QUADRANTS.map((q) => {
              const list = openItems.filter((i) => i.eisenhower_quadrant === q);
              return (
                <div key={q} className={`wp-quadrant tone-${EISENHOWER_TONE[q]}`}>
                  <div className="wp-quadrant-head">
                    <span>
                      {q} · {EISENHOWER_LABEL[q]}
                    </span>
                    <strong>{list.length}</strong>
                  </div>
                  <small>{EISENHOWER_ACTION[q]}</small>
                  {list.length ? (
                    <ul>
                      {list.slice(0, 4).map((i) => (
                        <li key={i.id}>
                          {i.title} <span className="muted">· {i.planTitle}</span>
                        </li>
                      ))}
                      {list.length > 4 ? <li className="muted">+{list.length - 4} việc khác</li> : null}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-title">
          <h2>Danh sách kế hoạch</h2>
        </div>
        {!plans.length ? <div className="empty-state">Chưa có kế hoạch nào.</div> : null}
        <div className="wp-plan-list">
          {plans.map((plan) => (
            <article key={plan.id} className="wp-plan-card">
              <div className="wp-plan-head">
                <div>
                  <strong>{plan.title}</strong>
                  <div className="subline">
                    {plan.smart_measurable ? `Chỉ tiêu: ${plan.smart_measurable} · ` : ""}
                    Hạn: {formatDate(plan.target_date)}
                  </div>
                </div>
                <div className="wp-plan-head-actions">
                  <span className={`status-badge ${STATUS_TONE[plan.status]}`}>{STATUS_LABEL[plan.status]}</span>
                  {canManage ? (
                    <>
                      <button type="button" className="button tertiary small" onClick={() => void togglePlanStatus(plan)}>
                        {plan.status === "DONE" ? "Mở lại" : "Hoàn thành"}
                      </button>
                      <button type="button" className="button tertiary small" onClick={() => void deletePlan(plan)}>
                        Xoá
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="wp-item-list">
                {plan.items.map((item) => (
                  <div key={item.id} className="wp-item-row">
                    <div className="wp-item-main">
                      <div className="wp-item-title">
                        <strong>{item.title}</strong>
                        <span className={`status-badge ${EISENHOWER_TONE[item.eisenhower_quadrant]}`}>{item.eisenhower_quadrant}</span>
                        <span className={`status-badge ${STATUS_TONE[item.status]}`}>{STATUS_LABEL[item.status]}</span>
                      </div>
                      <div className="subline">
                        {item.why_text ? `Why: ${item.why_text} · ` : ""}
                        {item.where_text ? `Where: ${item.where_text} · ` : ""}
                        {item.how_text ? `How: ${item.how_text} · ` : ""}
                        When: {formatDate(item.due_date)}
                      </div>
                      <div className="wp-assignee-chips">
                        <span className="chip wp-assignee-chip">Phụ trách: {item.assignee_user_id ? staffName(item.assignee_user_id) : "chưa giao"}</span>
                      </div>
                      {canManage && transferItemId === item.id ? (
                        <div className="wp-transfer-row">
                          <select className="input" value={transferPerson} onChange={(e) => setTransferPerson(e.target.value)}>
                            <option value="">— Chọn người phụ trách mới —</option>
                            {staffRoster.filter((s) => s.id !== item.assignee_user_id).map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                          <button type="button" className="button secondary small" disabled={!transferPerson} onClick={() => void transferAssignee(plan.id, item)}>
                            Xác nhận
                          </button>
                          <button type="button" className="button tertiary small" onClick={() => (setTransferItemId(null), setTransferPerson(""))}>
                            Hủy
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {canManage ? (
                      <div className="wp-item-actions">
                        <button type="button" className="button tertiary small" onClick={() => setTransferItemId(transferItemId === item.id ? null : item.id)}>
                          Đổi người phụ trách
                        </button>
                        <button type="button" className="button tertiary small" onClick={() => void toggleItemStatus(plan.id, item)}>
                          {item.status === "DONE" ? "Mở lại" : "Hoàn thành"}
                        </button>
                        <button type="button" className="button tertiary small" onClick={() => void deleteItem(plan.id, item)}>
                          Xoá
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
                {!plan.items.length ? <div className="empty-state compact">Chưa có đầu việc nào.</div> : null}
              </div>

              {canManage ? (
                <div className="wp-add-item">
                  <button
                    type="button"
                    className="button secondary small"
                    aria-expanded={itemFormPlanId === plan.id}
                    onClick={() => (itemFormPlanId === plan.id ? resetItemForm() : (resetItemForm(), setItemFormPlanId(plan.id)))}
                  >
                    {itemFormPlanId === plan.id ? "Thu gọn" : "+ Thêm đầu việc (5W1H)"}
                  </button>
                  {itemFormPlanId === plan.id ? (
                    <div className="wp-item-form">
                      <input className="input" placeholder="Nội dung đầu việc (What)..." value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} />
                      <div className="wp-form-row">
                        <input className="input" placeholder="Tại sao (Why)..." value={itemWhy} onChange={(e) => setItemWhy(e.target.value)} />
                        <input className="input" placeholder="Ở đâu (Where, không bắt buộc)..." value={itemWhere} onChange={(e) => setItemWhere(e.target.value)} />
                      </div>
                      <div className="wp-form-row">
                        <input className="input" placeholder="Như thế nào (How)..." value={itemHow} onChange={(e) => setItemHow(e.target.value)} />
                        <label>
                          <span>Khi nào (When)</span>
                          <VnDateInput className="input" value={itemDue} onChange={(e) => setItemDue(e.target.value)} />
                        </label>
                      </div>
                      <label>
                        <span>Eisenhower — mức ưu tiên xử lý</span>
                        <select className="input" value={itemQuadrant} onChange={(e) => setItemQuadrant(e.target.value as EisenhowerQuadrant)}>
                          {EISENHOWER_QUADRANTS.map((q) => (
                            <option key={q} value={q}>
                              {q} · {EISENHOWER_LABEL[q]} ({EISENHOWER_ACTION[q]})
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Người phụ trách *
                        <select className="input" value={itemAssignee} onChange={(e) => setItemAssignee(e.target.value)}>
                          <option value="">— Chọn người phụ trách —</option>
                          {staffRoster.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <button className="button primary small" disabled={itemBusy || !itemTitle.trim() || !itemAssignee} onClick={() => void createItem(plan.id)}>
                        Tạo đầu việc
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <style jsx>{`
        .wp-overview {
          display: grid;
          gap: 16px;
        }
        .wp-overview > * {
          min-width:0;
        }
        .wp-form,
        .wp-item-form {
          display: grid;
          gap: 8px;
          padding: 12px;
          border: 1px dashed var(--line);
          border-radius: 12px;
          margin-top: 10px;
        }
        .wp-form > *,
        .wp-item-form > * {
          min-width:0;
        }
        .wp-form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .wp-form-row > * {
          min-width:0;
        }
        .wp-matrix {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          padding: 0 18px 18px;
        }
        .wp-matrix > * {
          min-width:0;
        }
        .wp-quadrant {
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 11px;
        }
        .wp-quadrant-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;
          font-weight: 700;
        }
        .wp-quadrant-head strong {
          font-size: 17px;
        }
        .wp-quadrant > small {
          display: block;
          color: var(--muted);
          font-size: 10px;
          margin-top: 2px;
        }
        .wp-quadrant ul {
          list-style: none;
          margin: 8px 0 0;
          padding: 0;
          display: grid;
          gap: 4px;
        }
        .wp-quadrant li {
          font-size: 11px;
          overflow-wrap: anywhere;
        }
        .wp-quadrant.tone-danger {
          border-color: #f3c8c8;
          background: var(--danger-soft);
        }
        .wp-quadrant.tone-warning {
          border-color: #f2dfb0;
          background: var(--warning-soft);
        }
        .wp-quadrant.tone-info {
          border-color: #c8dcf3;
          background: var(--info-soft);
        }
        .wp-quadrant.tone-muted {
          border-color: var(--line);
          background: #f7fafb;
        }
        .wp-plan-list {
          display: grid;
          gap: 14px;
          padding: 0 18px 18px;
        }
        .wp-plan-list > * {
          min-width:0;
        }
        .wp-plan-card {
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 14px;
          background: #fff;
        }
        .wp-plan-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
          flex-wrap: wrap;
        }
        .wp-plan-head-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .subline {
          display: block;
          color: var(--muted);
          font-size: 11px;
          margin-top: 3px;
        }
        .wp-item-list {
          display: grid;
          gap: 8px;
          margin-top: 12px;
        }
        .wp-item-list > * {
          min-width:0;
        }
        .wp-item-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
          border: 1px solid #edf1f2;
          border-radius: 10px;
          padding: 10px;
          flex-wrap: wrap;
        }
        .wp-item-main {
          min-width:0;
          flex: 1 1 260px;
        }
        .wp-item-title {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .wp-item-actions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .wp-assignee-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-top: 6px;
        }
        .wp-transfer-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
        }
        .wp-transfer-row > * {
          min-width:0;
        }
        .wp-transfer-row select {
          min-width: 160px;
          width: auto;
        }
        .wp-assignee-chip {
          display: inline-flex;
          align-items: center;
          background: var(--info-soft);
          color: #075985;
        }
        .wp-add-item {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #edf1f2;
        }
        @media (max-width: 760px) {
          .wp-form-row,
          .wp-matrix {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
