"use client";

import { useEffect, useState } from "react";
import type { InternalAuditType } from "@/lib/internal-audit-types";

type Department = { id: string; name: string };
type ChecklistItem = { id: string; content: string; category: string | null };
type Finding = {
  id: string;
  audit_id: string;
  department_id: string;
  owner_user_id: string | null;
  description: string;
  status: "OPEN" | "SENT_TO_DEPT" | "DEPT_ACKNOWLEDGED" | "DEPT_DISPUTED" | "HEAD_APPROVED" | "RESOLVED";
  department_response: string | null;
  head_decision: "UPHELD" | "WAIVED" | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Chưa gửi khoa",
  SENT_TO_DEPT: "Đã gửi khoa — chờ phản hồi",
  DEPT_ACKNOWLEDGED: "Khoa đã đồng thuận",
  DEPT_DISPUTED: "Khoa giải trình — chờ TP quyết định",
  HEAD_APPROVED: "TP đã quyết định",
  RESOLVED: "Đã xử lý xong",
};

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}
function currentPeriod() {
  return today().slice(0, 7);
}

export function HsbaAuditOverviewClient({
  auditType,
  departments,
  checklistItems,
  initialFindings,
  canManage,
}: {
  auditType: InternalAuditType;
  departments: Department[];
  checklistItems: ChecklistItem[];
  initialFindings: Finding[];
  canManage: boolean;
}) {
  const [departmentId, setDepartmentId] = useState(departments[0]?.id || "");
  const [recordReference, setRecordReference] = useState("");
  const [period, setPeriod] = useState(currentPeriod());
  const [resultsByItem, setResultsByItem] = useState<Record<string, "PASS" | "FAIL">>({});
  const [notesByItem, setNotesByItem] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [findings, setFindings] = useState(initialFindings);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");

  // Switching audit_type (via the workspace nav) re-runs the server page with
  // new initialFindings props but keeps this same client component instance
  // mounted — resync local state so the list actually reflects the new type.
  useEffect(() => {
    setFindings(initialFindings);
  }, [auditType, initialFindings]);

  const departmentName = (id: string) => departments.find((d) => d.id === id)?.name || "—";

  function setResult(itemId: string, result: "PASS" | "FAIL") {
    setResultsByItem((v) => ({ ...v, [itemId]: result }));
  }

  async function submitAudit() {
    const results = checklistItems
      .filter((i) => resultsByItem[i.id])
      .map((i) => ({ checklist_item_id: i.id, result: resultsByItem[i.id], note: notesByItem[i.id] || "" }));
    if (!recordReference.trim()) {
      setError("Chưa nhập mã/số hồ sơ.");
      return;
    }
    if (!results.length) {
      setError("Chưa chấm tiêu chí nào.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    const res = await fetch("/api/hsba-audit/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ department_id: departmentId, record_reference: recordReference.trim(), period, results, audit_type: auditType }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error || "Không lưu được lượt kiểm tra.");
      return;
    }
    setMessage(`Đã lưu lượt kiểm tra "${recordReference.trim()}" — ${body.findings_created || 0} lỗi được tạo.`);
    setRecordReference("");
    setResultsByItem({});
    setNotesByItem({});
    if (body.findings_created) {
      const refreshed = await fetch(`/api/hsba-audit/findings?audit_type=${auditType}`).then((r) => r.json()).catch(() => null);
      if (refreshed?.ok) setFindings(refreshed.findings.filter((f: Finding) => f.status !== "RESOLVED"));
    }
  }

  async function act(finding: Finding, action: string, extra: Record<string, unknown> = {}) {
    setError("");
    const res = await fetch(`/api/hsba-audit/findings/${finding.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Không thực hiện được thao tác.");
      return;
    }
    if (body.finding.status === "RESOLVED") {
      setFindings((v) => v.filter((f) => f.id !== finding.id));
    } else {
      setFindings((v) => v.map((f) => (f.id === finding.id ? { ...f, ...body.finding } : f)));
    }
    setRespondingId(null);
    setResponseText("");
  }

  return (
    <div className="hsba-audit-overview">
      {canManage ? (
        <section className="panel hsba-form-panel">
          <div className="panel-title">
            <div>
              <h2>Tạo lượt kiểm tra mới</h2>
              <p>Chấm theo bảng kiểm — tiêu chí chưa đạt sẽ tự tạo lỗi gửi khoa.</p>
            </div>
          </div>
          <div className="hsba-form-row">
            <select className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} disabled={!departments.length}>
              {departments.length ? null : <option value="">— Chưa có khoa/phòng nào —</option>}
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <input className="input" placeholder="Mã/số hồ sơ (PID)" value={recordReference} onChange={(e) => setRecordReference(e.target.value)} />
            <input className="input" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tiêu chí</th>
                  <th style={{ width: 160 }}>Kết quả</th>
                  <th style={{ width: 220 }}>Ghi chú lỗi (nếu có)</th>
                </tr>
              </thead>
              <tbody>
                {checklistItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.content}</td>
                    <td>
                      <div className="hsba-result-toggle">
                        <button type="button" className={`button small ${resultsByItem[item.id] === "PASS" ? "primary" : "secondary"}`} onClick={() => setResult(item.id, "PASS")}>
                          Đạt
                        </button>
                        <button type="button" className={`button small ${resultsByItem[item.id] === "FAIL" ? "primary" : "secondary"}`} onClick={() => setResult(item.id, "FAIL")}>
                          Chưa đạt
                        </button>
                      </div>
                    </td>
                    <td>
                      {resultsByItem[item.id] === "FAIL" ? (
                        <input
                          className="input"
                          placeholder="Mô tả lỗi cụ thể..."
                          value={notesByItem[item.id] || ""}
                          onChange={(e) => setNotesByItem((v) => ({ ...v, [item.id]: e.target.value }))}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
                {!checklistItems.length ? (
                  <tr>
                    <td colSpan={3} className="empty-state compact">
                      Chưa có tiêu chí nào — vào tab &quot;Bảng kiểm&quot; để khai báo.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {error ? <div className="alert error">{error}</div> : null}
          {message ? <div className="alert success">{message}</div> : null}
          <button className="button primary" disabled={busy || !checklistItems.length || !departmentId} onClick={() => void submitAudit()}>
            Lưu lượt kiểm tra
          </button>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Lỗi cần xử lý</h2>
            <p>Theo dõi lỗi từ khi phát hiện đến khi khắc phục xong.</p>
          </div>
        </div>
        <div className="work-list">
          {findings.map((f) => (
            <div className="work-row" key={f.id}>
              <div className="work-main">
                <strong>{f.description}</strong>
                <small>
                  {departmentName(f.department_id)} · {STATUS_LABEL[f.status] || f.status}
                  {f.department_response ? ` · Phản hồi: ${f.department_response}` : ""}
                </small>
                {respondingId === f.id ? (
                  <div className="hsba-respond">
                    <textarea className="input" rows={2} placeholder="Nội dung phản hồi của khoa..." value={responseText} onChange={(e) => setResponseText(e.target.value)} />
                    <div className="hsba-respond-actions">
                      <button className="button primary small" onClick={() => void act(f, "ACK", { department_response: responseText })}>
                        Đồng thuận, sẽ khắc phục
                      </button>
                      <button className="button secondary small" onClick={() => void act(f, "DISPUTE", { department_response: responseText })}>
                        Giải trình / phản đối
                      </button>
                      <button className="button tertiary small" onClick={() => setRespondingId(null)}>
                        Hủy
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="hsba-actions">
                {canManage && f.status === "OPEN" ? (
                  <button className="button secondary small" onClick={() => void act(f, "SEND")}>
                    Gửi khoa
                  </button>
                ) : null}
                {f.status === "SENT_TO_DEPT" && respondingId !== f.id ? (
                  <button className="button secondary small" onClick={() => setRespondingId(f.id)}>
                    Khoa phản hồi
                  </button>
                ) : null}
                {canManage && f.status === "DEPT_DISPUTED" ? (
                  <>
                    <button className="button secondary small" onClick={() => void act(f, "DECIDE", { head_decision: "UPHELD" })}>
                      Giữ nguyên lỗi
                    </button>
                    <button className="button tertiary small" onClick={() => void act(f, "DECIDE", { head_decision: "WAIVED" })}>
                      Miễn lỗi
                    </button>
                  </>
                ) : null}
                {canManage && (f.status === "DEPT_ACKNOWLEDGED" || f.status === "HEAD_APPROVED") ? (
                  <button className="button primary small" onClick={() => void act(f, "RESOLVE")}>
                    Đóng lỗi
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {!findings.length ? <div className="empty-state compact">Không có lỗi nào cần xử lý.</div> : null}
        </div>
      </section>
      <style jsx>{`
        .hsba-audit-overview {
          display: grid;
          gap: 16px;
        }
        .hsba-form-row {
          display: grid;
          grid-template-columns: 1fr 1fr 160px;
          gap: 8px;
          padding: 0 12px 12px;
        }
        .hsba-result-toggle {
          display: flex;
          gap: 6px;
        }
        .hsba-respond {
          display: grid;
          gap: 6px;
          margin-top: 6px;
        }
        .hsba-respond-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .hsba-actions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          align-items: flex-start;
        }
        @media (max-width: 760px) {
          .hsba-form-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
