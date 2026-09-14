"use client";

import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

type Department = { id: string; name: string; short_name: string | null };
type Profile = { user_id: string; full_name: string | null; email: string | null; primary_department_id: string | null };

type FormState = {
  title: string;
  description: string;
  priority: string;
  leadDepartmentId: string;
  assigneeUserId: string;
  dueDate: string;
  expectedResult: string;
  verificationRequirement: string;
  milestoneGroup: string;
  isRequired: boolean;
};

export function PlanActionCreateClient({
  planId,
  departments,
  profiles,
  defaultDepartmentId,
  defaultDueDate,
}: {
  planId: string;
  departments: Department[];
  profiles: Profile[];
  defaultDepartmentId?: string | null;
  defaultStartDate?: string | null;
  defaultDueDate?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState<FormState>(() => initialForm(defaultDepartmentId, defaultDueDate));

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  function openForm() {
    setForm(initialForm(defaultDepartmentId, defaultDueDate));
    setMessage(null);
    setOpen(true);
  }

  function requestClose() {
    if (busy) return;
    const original = initialForm(defaultDepartmentId, defaultDueDate);
    const changed = JSON.stringify(form) !== JSON.stringify(original);
    if (changed && !window.confirm("Bạn có chắc muốn đóng? Dữ liệu chưa lưu sẽ bị mất.")) return;
    setMessage(null);
    setOpen(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return setMessage({ tone: "error", text: "Vui lòng nhập nội dung nhiệm vụ." });
    if (!form.leadDepartmentId) return setMessage({ tone: "error", text: "Vui lòng chọn khoa/phòng phụ trách." });
    if (!form.assigneeUserId) return setMessage({ tone: "error", text: "Vui lòng chọn người phụ trách." });
    if (!form.dueDate) return setMessage({ tone: "error", text: "Vui lòng nhập hạn hoàn thành." });
    if (!form.expectedResult.trim()) return setMessage({ tone: "error", text: "Vui lòng nhập kết quả mong đợi." });

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/plans/${planId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          priority: form.priority,
          lead_department_id: form.leadDepartmentId,
          assignee_user_id: form.assigneeUserId,
          due_date: form.dueDate,
          expected_result: form.expectedResult.trim(),
          verification_requirement: form.verificationRequirement.trim() || null,
          milestone_group: form.milestoneGroup.trim() || null,
          is_required: form.isRequired,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể tạo nhiệm vụ.");
      setMessage({ tone: "success", text: `Đã tạo nhiệm vụ ${data.record_code}.` });
      router.refresh();
      setTimeout(() => setOpen(false), 550);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Có lỗi xảy ra." });
    } finally {
      setBusy(false);
    }
  }

  const eligibleProfiles = profiles.filter((p) => !form.leadDepartmentId || !p.primary_department_id || p.primary_department_id === form.leadDepartmentId);

  const modal = open && typeof document !== "undefined" ? createPortal(
    <div className="modal-backdrop" style={{ padding: 16 }}>
      <form
        className="modal-card"
        onSubmit={submit}
        style={{
          width: "min(1440px, calc(100vw - 32px))",
          height: "min(900px, calc(100dvh - 32px))",
          maxHeight: "calc(100dvh - 32px)",
          borderRadius: 18,
        }}
      >
        <div className="modal-head" style={{ flexShrink: 0, padding: "18px 24px" }}>
          <div>
            <div className="eyebrow">ACTION / TASK · KẾ HOẠCH</div>
            <h2>Thêm nhiệm vụ vào kế hoạch</h2>
            <p className="muted" style={{ margin: "5px 0 0", fontSize: 12 }}>
              Phân công đầu việc, thời hạn, kết quả mong đợi và yêu cầu minh chứng.
            </p>
          </div>
          <button type="button" className="icon-button" title="Đóng cửa sổ" aria-label="Đóng cửa sổ" onClick={requestClose}>
            <Icon name="x" size={22} />
          </button>
        </div>

        <div className="modal-body" style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "24px 28px 30px" }}>
          {message ? <div className={`alert ${message.tone}`} style={{ marginBottom: 18 }}>{message.text}</div> : null}

          <div className="form-stack" style={{ gap: 24 }}>
            <section>
              <div style={{ marginBottom: 13 }}>
                <strong style={{ fontSize: 14 }}>1. Nội dung nhiệm vụ</strong>
                <div className="muted tiny" style={{ marginTop: 4 }}>Xác định rõ đầu việc và nhóm/mốc triển khai.</div>
              </div>
              <div className="form-grid two" style={{ gap: 16 }}>
                <label className="span-2">
                  <span>Nội dung nhiệm vụ *</span>
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ví dụ: Ban hành quy định kiểm soát tài liệu" />
                </label>
                <label>
                  <span>Ưu tiên</span>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    <option value="LOW">Thấp</option>
                    <option value="NORMAL">Bình thường</option>
                    <option value="HIGH">Cao</option>
                    <option value="URGENT">Khẩn</option>
                    <option value="CRITICAL">Rất khẩn / trọng yếu</option>
                  </select>
                </label>
                <label>
                  <span>Nhóm / mốc công việc</span>
                  <input value={form.milestoneGroup} onChange={(e) => setForm({ ...form, milestoneGroup: e.target.value })} placeholder="Có thể để trống" />
                </label>
              </div>
            </section>

            <section style={{ borderTop: "1px solid var(--line)", paddingTop: 22 }}>
              <div style={{ marginBottom: 13 }}>
                <strong style={{ fontSize: 14 }}>2. Phân công & thời hạn</strong>
                <div className="muted tiny" style={{ marginTop: 4 }}>Chọn đơn vị và cá nhân chịu trách nhiệm trực tiếp.</div>
              </div>
              <div className="form-grid two" style={{ gap: 16 }}>
                <label>
                  <span>Khoa/Phòng phụ trách *</span>
                  <select value={form.leadDepartmentId} onChange={(e) => setForm({ ...form, leadDepartmentId: e.target.value, assigneeUserId: "" })}>
                    <option value="">— Chọn đơn vị —</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Người phụ trách *</span>
                  <select value={form.assigneeUserId} onChange={(e) => setForm({ ...form, assigneeUserId: e.target.value })}>
                    <option value="">— Chọn người phụ trách —</option>
                    {eligibleProfiles.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email || p.user_id}</option>)}
                  </select>
                </label>
                <div style={{ padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 11, background: "#f8fafb" }}>
                  <span className="tiny muted">Ngày bắt đầu</span>
                  <div style={{ marginTop: 5, fontWeight: 800 }}>Tự động = ngày kế hoạch được phê duyệt</div>
                  <small>Không nhập tay để bảo đảm tất cả nhiệm vụ bắt đầu theo cùng mốc phê duyệt.</small>
                </div>
                <label>
                  <span>Hạn hoàn thành *</span>
                  <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                </label>
              </div>
            </section>

            <section style={{ borderTop: "1px solid var(--line)", paddingTop: 22 }}>
              <div style={{ marginBottom: 13 }}>
                <strong style={{ fontSize: 14 }}>3. Kết quả & minh chứng</strong>
                <div className="muted tiny" style={{ marginTop: 4 }}>Nêu sản phẩm cần đạt và căn cứ để xác minh hoàn thành.</div>
              </div>
              <div className="form-grid two" style={{ gap: 16 }}>
                <label className="span-2">
                  <span>Kết quả mong đợi *</span>
                  <textarea rows={3} value={form.expectedResult} onChange={(e) => setForm({ ...form, expectedResult: e.target.value })} placeholder="Sản phẩm hoặc kết quả cụ thể để xác định nhiệm vụ đã hoàn thành" />
                </label>
                <label className="span-2">
                  <span>Yêu cầu xác minh / minh chứng</span>
                  <textarea rows={3} value={form.verificationRequirement} onChange={(e) => setForm({ ...form, verificationRequirement: e.target.value })} placeholder="Ví dụ: Quyết định ban hành và file tài liệu đã phê duyệt" />
                </label>
                <label className="span-2">
                  <span>Mô tả / hướng dẫn thực hiện</span>
                  <textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Thông tin bổ sung nếu cần" />
                </label>
              </div>
            </section>

            <section style={{ borderTop: "1px solid var(--line)", paddingTop: 20 }}>
              <label style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 11, background: "#f8fafb" }}>
                <input type="checkbox" style={{ width: 18, height: 18, minHeight: 18, flex: "0 0 auto" }} checked={form.isRequired} onChange={(e) => setForm({ ...form, isRequired: e.target.checked })} />
                <span style={{ margin: 0 }}>Tính là nhiệm vụ bắt buộc trong tiến độ kế hoạch</span>
              </label>
            </section>
          </div>
        </div>

        <div className="modal-footer" style={{ flexShrink: 0, padding: "14px 24px", boxShadow: "0 -6px 18px rgba(26,42,49,.04)" }}>
          <button type="button" className="button secondary" disabled={busy} onClick={requestClose}>Hủy / Đóng</button>
          <button className="button primary" disabled={busy}><Icon name="save" size={17} /> {busy ? "Đang tạo..." : "Tạo nhiệm vụ"}</button>
        </div>
      </form>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button className="button primary" onClick={openForm}><Icon name="plus" size={17} /> Thêm nhiệm vụ</button>
      {modal}
    </>
  );
}

function initialForm(defaultDepartmentId?: string | null, defaultDueDate?: string | null): FormState {
  return {
    title: "",
    description: "",
    priority: "NORMAL",
    leadDepartmentId: defaultDepartmentId || "",
    assigneeUserId: "",
    dueDate: defaultDueDate || "",
    expectedResult: "",
    verificationRequirement: "",
    milestoneGroup: "",
    isRequired: true,
  };
}
