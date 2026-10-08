"use client";

import { Fragment, useEffect, useState } from "react";
import { INTERNAL_AUDIT_TYPE_LABEL, type InternalAuditType } from "@/lib/internal-audit-types";

type Department = { id: string; name: string };
type ChecklistItem = { id: string; content: string; category: string | null; is_active: boolean };
type ChecklistTemplateOption = { id: string; name: string; versionId: string; versionNo: number };
type Finding = {
  id: string;
  audit_id: string;
  department_id: string;
  owner_user_id: string | null;
  owner_name: string | null;
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
  templates,
  initialFindings,
  canManage,
}: {
  auditType: InternalAuditType;
  departments: Department[];
  templates: ChecklistTemplateOption[];
  initialFindings: Finding[];
  canManage: boolean;
}) {
  const [departmentId, setDepartmentId] = useState(departments[0]?.id || "");
  const [templateId, setTemplateId] = useState(templates[0]?.id || "");
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [recordReference, setRecordReference] = useState("");
  const [period, setPeriod] = useState(currentPeriod());
  // Chỉ HSBA giữ đúng 2 mức Đạt/Chưa đạt như cũ — Phác đồ điều trị và QTKT
  // nội trú là kiểm bổ sung, cần 4 mức: Đạt/Đạt 1 phần/Không đạt/Không áp
  // dụng (yêu cầu tường minh của người dùng). type vẫn khai báo chung 1 union
  // vì cùng 1 state — nhánh render theo auditType quyết định thực tế có hiện
  // PARTIAL/NA hay không, HSBA không bao giờ set 2 giá trị đó.
  const supportsPartialAndNa = auditType !== "HSBA";
  const [resultsByItem, setResultsByItem] = useState<Record<string, "PASS" | "FAIL" | "PARTIAL" | "NA">>({});
  const [notesByItem, setNotesByItem] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [findings, setFindings] = useState(initialFindings);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [staffByDept, setStaffByDept] = useState<Record<string, { id: string; name: string }[]>>({});

  const selectedTemplate = templates.find((t) => t.id === templateId) || null;

  useEffect(() => {
    setTemplateId(templates[0]?.id || "");
  }, [templates]);

  useEffect(() => {
    if (!selectedTemplate) {
      setChecklistItems([]);
      return;
    }
    let cancelled = false;
    setLoadingItems(true);
    fetch(`/api/hsba-audit/checklist-items?checklist_version_id=${selectedTemplate.versionId}`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        setChecklistItems(res.ok ? (res.items || []).filter((i: ChecklistItem) => i.is_active) : []);
      })
      .finally(() => {
        if (!cancelled) setLoadingItems(false);
      });
    setResultsByItem({});
    setNotesByItem({});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate?.versionId]);

  // Switching audit_type (via the workspace nav) re-runs the server page with
  // new initialFindings props but keeps this same client component instance
  // mounted — resync local state so the list actually reflects the new type.
  useEffect(() => {
    setFindings(initialFindings);
  }, [auditType, initialFindings]);

  const departmentName = (id: string) => departments.find((d) => d.id === id)?.name || "—";

  // Danh sách nhân viên để gán "phụ trách" (owner_user_id) chỉ cần tải 1 lần
  // cho mỗi khoa/phòng có lỗi — nạp lười theo từng khoa thay vì tải hết nhân
  // sự toàn viện cùng lúc.
  useEffect(() => {
    if (!canManage) return;
    const deptIds = Array.from(new Set(findings.map((f) => f.department_id))).filter((id) => !staffByDept[id]);
    if (!deptIds.length) return;
    deptIds.forEach((deptId) => {
      fetch(`/api/hsba-audit/department-staff?department_id=${deptId}`)
        .then((r) => r.json())
        .then((res) => {
          if (res?.ok) setStaffByDept((prev) => ({ ...prev, [deptId]: res.staff }));
        })
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, findings]);

  async function assignOwner(finding: Finding, ownerUserId: string) {
    setError("");
    const res = await fetch(`/api/hsba-audit/findings/${finding.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ASSIGN_OWNER", owner_user_id: ownerUserId || null }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Không gán được nhân viên phụ trách.");
      return;
    }
    const newOwnerName = ownerUserId ? (staffByDept[finding.department_id] || []).find((s) => s.id === ownerUserId)?.name || null : null;
    setFindings((v) => v.map((f) => (f.id === finding.id ? { ...f, owner_user_id: body.finding.owner_user_id, owner_name: newOwnerName } : f)));
  }

  function setResult(itemId: string, result: "PASS" | "FAIL" | "PARTIAL" | "NA") {
    setResultsByItem((v) => ({ ...v, [itemId]: result }));
  }

  // Nhóm tiêu chí theo "Phân loại" (category) đã khai báo sẵn từ màn hình
  // "Bảng kiểm" (vd Lâm sàng, Cận lâm sàng — tự nhập, không hardcode) — nếu
  // chưa ai khai category nào (mọi item đều null, như toàn bộ dữ liệu HSBA
  // hiện có) thì gom về đúng 1 nhóm rỗng và không hiện dòng tiêu đề nhóm, để
  // bảng kiểm không khai category vẫn hiển thị y hệt trước đây.
  const groupedItems = (() => {
    const order: string[] = [];
    const byCategory = new Map<string, ChecklistItem[]>();
    for (const item of checklistItems) {
      const key = item.category || "";
      if (!byCategory.has(key)) {
        order.push(key);
        byCategory.set(key, []);
      }
      byCategory.get(key)!.push(item);
    }
    return order.map((key) => ({ category: key || null, items: byCategory.get(key) as ChecklistItem[] }));
  })();
  const showCategoryGroups = groupedItems.length > 1 || (groupedItems.length === 1 && groupedItems[0].category !== null);

  async function submitAudit() {
    const results = checklistItems
      .filter((i) => resultsByItem[i.id])
      .map((i) => ({ checklist_item_id: i.id, result: resultsByItem[i.id], note: notesByItem[i.id] || "" }));
    if (!selectedTemplate) {
      setError("Chưa chọn mẫu bảng kiểm.");
      return;
    }
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
      body: JSON.stringify({
        department_id: departmentId,
        record_reference: recordReference.trim(),
        period,
        results,
        audit_type: auditType,
        checklist_version_id: selectedTemplate.versionId,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error || "Không lưu được lượt kiểm tra.");
      return;
    }
    // Chỉ HSBA mới có "lỗi gửi khoa"; Phác đồ/QTKT là kiểm bổ sung không bắt
    // buộc, Không đạt chỉ được ghi nhận vào báo cáo, không trả về khoa.
    setMessage(
      auditType === "HSBA"
        ? `Đã lưu lượt kiểm tra "${recordReference.trim()}" — ${body.findings_created || 0} lỗi được tạo và gửi khoa.`
        : `Đã ghi nhận kết quả chấm "${recordReference.trim()}" — ${body.failed_count || 0}/${results.length} tiêu chí không đạt (chỉ tính vào báo cáo, không gửi khoa).`,
    );
    setRecordReference("");
    setResultsByItem({});
    setNotesByItem({});
    if (auditType === "HSBA" && body.findings_created) {
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
            <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)} disabled={!templates.length}>
              {templates.length ? null : <option value="">— Chưa có mẫu bảng kiểm đã phát hành —</option>}
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (v{t.versionNo})
                </option>
              ))}
            </select>
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
                  <th style={{ width: supportsPartialAndNa ? 280 : 160 }}>Kết quả</th>
                  <th style={{ width: 220 }}>Ghi chú lỗi (nếu có)</th>
                </tr>
              </thead>
              <tbody>
                {loadingItems ? (
                  <tr>
                    <td colSpan={3} className="empty-state compact">
                      Đang tải tiêu chí...
                    </td>
                  </tr>
                ) : null}
                {!loadingItems && groupedItems.map((group) => (
                  <Fragment key={group.category || "__none__"}>
                    {showCategoryGroups ? (
                      <tr className="hsba-category-row">
                        <td colSpan={3}><strong>{group.category || "Khác"}</strong></td>
                      </tr>
                    ) : null}
                    {group.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.content}</td>
                        <td>
                          <div className="hsba-result-toggle">
                            <button type="button" className={`button small ${resultsByItem[item.id] === "PASS" ? "primary" : "secondary"}`} onClick={() => setResult(item.id, "PASS")}>
                              Đạt
                            </button>
                            {supportsPartialAndNa ? (
                              <button type="button" className={`button small ${resultsByItem[item.id] === "PARTIAL" ? "primary" : "secondary"}`} onClick={() => setResult(item.id, "PARTIAL")}>
                                Đạt 1 phần
                              </button>
                            ) : null}
                            <button type="button" className={`button small ${resultsByItem[item.id] === "FAIL" ? "primary" : "secondary"}`} onClick={() => setResult(item.id, "FAIL")}>
                              Chưa đạt
                            </button>
                            {supportsPartialAndNa ? (
                              <button type="button" className={`button small ${resultsByItem[item.id] === "NA" ? "primary" : "secondary"}`} onClick={() => setResult(item.id, "NA")}>
                                Không áp dụng
                              </button>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          {resultsByItem[item.id] === "FAIL" || resultsByItem[item.id] === "PARTIAL" ? (
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
                  </Fragment>
                ))}
                {!loadingItems && !checklistItems.length ? (
                  <tr>
                    <td colSpan={3} className="empty-state compact">
                      {!templates.length
                        ? canManage
                          ? 'Chưa có mẫu bảng kiểm nào đã phát hành — vào tab "Bảng kiểm" để tạo và phát hành.'
                          : 'Chưa có mẫu bảng kiểm nào đã phát hành. Liên hệ quản trị viên.'
                        : canManage
                          ? 'Mẫu bảng kiểm này chưa có tiêu chí nào — vào tab "Bảng kiểm" để khai báo.'
                          : 'Chưa có tiêu chí nào. Việc khai báo cần quyền "Quản lý kiểm tra chất lượng HSBA" — liên hệ quản trị viên.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {error ? <div className="alert error">{error}</div> : null}
          {message ? <div className="alert success">{message}</div> : null}
          <button className="button primary" disabled={busy || !checklistItems.length || !departmentId || !selectedTemplate} onClick={() => void submitAudit()}>
            Lưu lượt kiểm tra
          </button>
        </section>
      ) : null}

      {auditType === "HSBA" ? (
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
                {canManage ? (
                  <label className="hsba-owner-pick">
                    <span>Nhân viên phụ trách:</span>
                    <select
                      className="input"
                      value={f.owner_user_id || ""}
                      onChange={(e) => void assignOwner(f, e.target.value)}
                    >
                      <option value="">— Chưa gán —</option>
                      {/* Người đã gán trước đó có thể đã ngưng hoạt động hoặc đổi
                          khoa/phòng — vẫn phải hiện đúng tên hiện lưu trong DB,
                          không để dropdown trông như "chưa gán" một cách sai lệch. */}
                      {f.owner_user_id && !(staffByDept[f.department_id] || []).some((s) => s.id === f.owner_user_id) ? (
                        <option value={f.owner_user_id}>{f.owner_name || f.owner_user_id} (đã ngưng hoạt động/đổi khoa)</option>
                      ) : null}
                      {(staffByDept[f.department_id] || []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
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
      ) : (
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Kết quả chấm</h2>
              <p>
                {INTERNAL_AUDIT_TYPE_LABEL[auditType]} là kiểm bổ sung không bắt buộc — kết quả Không đạt chỉ được ghi nhận vào báo cáo tháng, không tạo lỗi gửi khoa xử lý như bảng kiểm Hồ sơ bệnh án.
              </p>
            </div>
          </div>
        </section>
      )}
      <style jsx>{`
        .hsba-audit-overview {
          display: grid;
          gap: 16px;
        }
        .hsba-form-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr 160px;
          gap: 8px;
          padding: 0 12px 12px;
        }
        .hsba-result-toggle {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .hsba-owner-pick {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 6px;
          font-size: 11px;
          color: #64748b;
        }
        .hsba-owner-pick select {
          width: auto;
          min-height: 30px;
          font-size: 11px;
          padding: 3px 6px;
        }
        .hsba-category-row td {
          background: #f8fafb;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #475569;
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
