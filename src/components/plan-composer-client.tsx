"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

type Department = { id: string; name: string; short_name: string | null };
type Profile = { user_id: string; full_name: string | null; email: string | null };

type DraftTask = {
  title: string;
  lead_department_id: string;
  assignee_user_id: string;
  start_date: string;
  due_date: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT" | "CRITICAL";
  expected_result: string;
  verification_requirement: string;
  description: string;
};

const EMPTY_TASK: DraftTask = { title: "", lead_department_id: "", assignee_user_id: "", start_date: "", due_date: "", priority: "NORMAL", expected_result: "", verification_requirement: "", description: "" };

function toTask(raw: any): DraftTask {
  return {
    title: raw?.title || "",
    lead_department_id: raw?.lead_department_id || "",
    assignee_user_id: raw?.assignee_user_id || "",
    start_date: raw?.start_date || "",
    due_date: raw?.due_date || "",
    priority: raw?.priority || "NORMAL",
    expected_result: raw?.expected_result || "",
    verification_requirement: raw?.verification_requirement || "",
    description: raw?.description || "",
  };
}

export function PlanComposerClient({
  planId,
  departments,
  profiles,
  initialTitle,
  initialGeneralObjective,
  initialSpecificObjectives,
  initialRequirements,
  initialDraftActions,
  defaultDepartmentId,
  initialOwnerUserId,
  initialStartDate,
  initialEndDate,
}: {
  planId: string;
  departments: Department[];
  profiles: Profile[];
  initialTitle: string;
  initialGeneralObjective: string | null;
  initialSpecificObjectives: unknown;
  initialRequirements: string | null;
  initialDraftActions: unknown;
  defaultDepartmentId: string | null;
  initialOwnerUserId: string | null;
  initialStartDate: string | null;
  initialEndDate: string | null;
}) {
  const router = useRouter();
  const [generalObjective, setGeneralObjective] = useState(initialGeneralObjective || "");
  const [specifics, setSpecifics] = useState<string[]>(Array.isArray(initialSpecificObjectives) && initialSpecificObjectives.length ? (initialSpecificObjectives as string[]) : [""]);
  const [requirements, setRequirements] = useState(initialRequirements || "");
  const [tasks, setTasks] = useState<DraftTask[]>(Array.isArray(initialDraftActions) && initialDraftActions.length ? (initialDraftActions as any[]).map(toTask) : [{ ...EMPTY_TASK, lead_department_id: defaultDepartmentId || "" }]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  function updateTask(index: number, patch: Partial<DraftTask>) {
    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }
  function addTask() {
    setTasks((prev) => [...prev, { ...EMPTY_TASK, lead_department_id: defaultDepartmentId || "" }]);
  }
  function removeTask(index: number) {
    setTasks((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }
  function updateSpecific(index: number, value: string) {
    setSpecifics((prev) => prev.map((s, i) => (i === index ? value : s)));
  }
  function addSpecific() {
    setSpecifics((prev) => [...prev, ""]);
  }
  function removeSpecific(index: number) {
    setSpecifics((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const cleanedSpecifics = specifics.map((s) => s.trim()).filter(Boolean);
      const cleanedTasks = tasks.filter((t) => t.title.trim());
      for (const t of cleanedTasks) {
        if (!t.lead_department_id) throw new Error(`Nhiệm vụ "${t.title}" thiếu Khoa/phòng chủ trì.`);
        if (!t.assignee_user_id) throw new Error(`Nhiệm vụ "${t.title}" thiếu Người phụ trách.`);
        if (!t.due_date) throw new Error(`Nhiệm vụ "${t.title}" thiếu Hạn hoàn thành.`);
        if (!t.expected_result.trim()) throw new Error(`Nhiệm vụ "${t.title}" thiếu Kết quả kỳ vọng.`);
      }
      const res = await fetch(`/api/plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: initialTitle,
          general_objective: generalObjective,
          specific_objectives: cleanedSpecifics,
          requirements,
          draft_actions: cleanedTasks,
          lead_department_id: defaultDepartmentId,
          owner_user_id: initialOwnerUserId,
          start_date: initialStartDate,
          end_date: initialEndDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không lưu được nội dung kế hoạch.");
      setMessage({ tone: "success", text: "Đã lưu nội dung kế hoạch." });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Có lỗi xảy ra." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="panel-title" style={{ padding: 0 }}>
        <div>
          <h2>Soạn nội dung kế hoạch</h2>
          <p>Hoàn thiện đủ Mục tiêu chung, Mục tiêu cụ thể, Yêu cầu và ít nhất 01 Nhiệm vụ trước khi gửi phê duyệt.</p>
        </div>
      </div>

      <label>Mục tiêu chung *<textarea rows={3} value={generalObjective} onChange={(e) => setGeneralObjective(e.target.value)} /></label>

      <div>
        <span className="tiny muted">Mục tiêu cụ thể *</span>
        {specifics.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <input style={{ flex: 1 }} value={s} onChange={(e) => updateSpecific(i, e.target.value)} placeholder={`Mục tiêu cụ thể ${i + 1}`} />
            <button type="button" className="button secondary small" onClick={() => removeSpecific(i)}>Xoá</button>
          </div>
        ))}
        <button type="button" className="button tertiary small" style={{ marginTop: 8 }} onClick={addSpecific}>+ Thêm mục tiêu cụ thể</button>
      </div>

      <label>Yêu cầu *<textarea rows={3} value={requirements} onChange={(e) => setRequirements(e.target.value)} /></label>

      <div>
        <span className="tiny muted">Nhiệm vụ / Action nháp * (sẽ được tạo thật khi kế hoạch được phê duyệt)</span>
        {tasks.map((t, i) => (
          <div key={i} className="panel" style={{ padding: 12, marginTop: 10, background: "#fbfdfd" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <strong>Nhiệm vụ {i + 1}</strong>
              <button type="button" className="button secondary small" onClick={() => removeTask(i)}>Xoá nhiệm vụ</button>
            </div>
            <div className="form-grid two">
              <label className="span-2">Tiêu đề *<input value={t.title} onChange={(e) => updateTask(i, { title: e.target.value })} /></label>
              <label>Khoa/phòng chủ trì *<select value={t.lead_department_id} onChange={(e) => updateTask(i, { lead_department_id: e.target.value })}><option value="">-- Chọn --</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.short_name || d.name}</option>)}</select></label>
              <label>Người phụ trách *<select value={t.assignee_user_id} onChange={(e) => updateTask(i, { assignee_user_id: e.target.value })}><option value="">-- Chọn --</option>{profiles.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email}</option>)}</select></label>
              <label>Ngày bắt đầu<input type="date" value={t.start_date} onChange={(e) => updateTask(i, { start_date: e.target.value })} /></label>
              <label>Hạn hoàn thành *<input type="date" value={t.due_date} onChange={(e) => updateTask(i, { due_date: e.target.value })} /></label>
              <label>Mức ưu tiên<select value={t.priority} onChange={(e) => updateTask(i, { priority: e.target.value as DraftTask["priority"] })}><option value="LOW">Thấp</option><option value="NORMAL">Bình thường</option><option value="HIGH">Cao</option><option value="URGENT">Khẩn</option><option value="CRITICAL">Rất khẩn</option></select></label>
              <label className="span-2">Kết quả kỳ vọng *<input value={t.expected_result} onChange={(e) => updateTask(i, { expected_result: e.target.value })} /></label>
              <label className="span-2">Yêu cầu minh chứng (không bắt buộc)<input value={t.verification_requirement} onChange={(e) => updateTask(i, { verification_requirement: e.target.value })} /></label>
              <label className="span-2">Mô tả thêm (không bắt buộc)<textarea rows={2} value={t.description} onChange={(e) => updateTask(i, { description: e.target.value })} /></label>
            </div>
          </div>
        ))}
        <button type="button" className="button tertiary small" style={{ marginTop: 10 }} onClick={addTask}>+ Thêm nhiệm vụ</button>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className="button primary" disabled={busy} onClick={save}><Icon name="save" size={16} /> {busy ? "Đang lưu..." : "Lưu nội dung kế hoạch"}</button>
      </div>
      {message ? <div className={`alert ${message.tone}`}>{message.text}</div> : null}
    </section>
  );
}
