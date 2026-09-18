"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { MultiCheckSelect } from "@/components/multi-check-select";
import {
  automationKindLabel,
  suggestPlanAutomationKind,
  suggestPlanAutomationResource,
  type PlanAutomationKind,
  type PlanAutomationResource,
} from "@/lib/plan-automation";

type Department = { id: string; name: string; short_name: string | null };
type Profile = { user_id: string; full_name: string | null; email: string | null; primary_department_id?: string | null };
type ReferenceOption = { id: string; label: string; description?: string | null };
type CriterionItem = { id: string; code: string; title: string };
type AutomationOption = { id: string; label: string };

type DraftTask = {
  client_id: string;
  title: string;
  lead_department_id: string;
  collaborating_department_ids: string[];
  assignee_user_id: string;
  collaborating_user_ids: string[];
  parent_client_id: string;
  start_date: string;
  due_date: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT" | "CRITICAL";
  expected_result: string;
  verification_requirement: string;
  description: string;
  criteria_refs: string[];
  automation_kind: PlanAutomationKind;
  automation_confirmed: boolean;
  automation_ref_id: string;
  automation_target_department_id: string;
  automation_target_area: string;
  automation_report_recipient: string;
  automation_report_method: string;
  automation_report_period: string;
  automation_report_recurrence_rule: string;
  automation_report_recurrence_end_date: string;
  automation_assessment_round_type: string;
  automation_audit_type: string;
};

const EMPTY_TASK: DraftTask = {
  client_id: "draft-1",
  title: "",
  lead_department_id: "",
  collaborating_department_ids: [],
  assignee_user_id: "",
  collaborating_user_ids: [],
  parent_client_id: "",
  start_date: "",
  due_date: "",
  priority: "NORMAL",
  expected_result: "",
  verification_requirement: "",
  description: "",
  criteria_refs: [],
  automation_kind: "ACTION",
  automation_confirmed: false,
  automation_ref_id: "",
  automation_target_department_id: "",
  automation_target_area: "",
  automation_report_recipient: "",
  automation_report_method: "",
  automation_report_period: "",
  automation_report_recurrence_rule: "",
  automation_report_recurrence_end_date: "",
  automation_assessment_round_type: "",
  automation_audit_type: "",
};

function toTask(raw: any): DraftTask {
  const kind = ["ACTION", "INDICATOR", "MONITORING", "REPORT", "ASSESSMENT", "AUDIT", "IMPROVEMENT"].includes(String(raw?.automation_kind || "").toUpperCase())
    ? String(raw.automation_kind).toUpperCase() as PlanAutomationKind
    : "ACTION";
  return {
    client_id: raw?.client_id || "draft-" + Math.random().toString(36).slice(2, 10),
    title: raw?.title || "",
    lead_department_id: raw?.lead_department_id || "",
    collaborating_department_ids: Array.isArray(raw?.collaborating_department_ids) ? raw.collaborating_department_ids : [],
    assignee_user_id: raw?.assignee_user_id || "",
    collaborating_user_ids: Array.isArray(raw?.collaborating_user_ids) ? raw.collaborating_user_ids : [],
    parent_client_id: raw?.parent_client_id || "",
    start_date: raw?.start_date || "",
    due_date: raw?.due_date || "",
    priority: raw?.priority || "NORMAL",
    expected_result: raw?.expected_result || "",
    verification_requirement: raw?.verification_requirement || "",
    description: raw?.description || "",
    criteria_refs: Array.isArray(raw?.criteria_refs) ? raw.criteria_refs : [],
    automation_kind: kind,
    automation_confirmed: raw?.automation_confirmed === true,
    automation_ref_id: raw?.automation_ref_id || "",
    automation_target_department_id: raw?.automation_target_department_id || "",
    automation_target_area: raw?.automation_target_area || "",
    automation_report_recipient: raw?.automation_report_recipient || "",
    automation_report_method: raw?.automation_report_method || "",
    automation_report_period: raw?.automation_report_period || "",
    automation_report_recurrence_rule: raw?.automation_report_recurrence_rule || "",
    automation_report_recurrence_end_date: raw?.automation_report_recurrence_end_date || "",
    automation_assessment_round_type: raw?.automation_assessment_round_type || "",
    automation_audit_type: raw?.automation_audit_type || "",
  };
}

export function PlanComposerClient({
  planId,
  departments,
  profiles,
  criteriaItems,
  indicatorAssignments,
  monitoringChecklists,
  assessmentCriteriaVersions,
  initialTitle,
  initialProgramType,
  initialDescription,
  initialGeneralObjective,
  initialSpecificObjectives,
  initialRequirements,
  initialDraftActions,
  defaultDepartmentId,
  initialDepartmentIds,
  initialOwnerUserId,
  initialOwnerUserIds,
  referenceOptions,
  initialReferenceIds,
  initialStartDate,
  initialEndDate,
}: {
  planId: string;
  departments: Department[];
  profiles: Profile[];
  criteriaItems: CriterionItem[];
  indicatorAssignments: AutomationOption[];
  monitoringChecklists: AutomationOption[];
  assessmentCriteriaVersions: AutomationOption[];
  initialTitle: string;
  initialProgramType: string;
  initialDescription: string | null;
  initialGeneralObjective: string | null;
  initialSpecificObjectives: unknown;
  initialRequirements: string | null;
  initialDraftActions: unknown;
  defaultDepartmentId: string | null;
  initialDepartmentIds: string[];
  initialOwnerUserId: string | null;
  initialOwnerUserIds: string[];
  referenceOptions: ReferenceOption[];
  initialReferenceIds: string[];
  initialStartDate: string | null;
  initialEndDate: string | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [programType, setProgramType] = useState(initialProgramType || "ANNUAL_PLAN");
  const [description, setDescription] = useState(initialDescription || "");
  const [planStartDate, setPlanStartDate] = useState(initialStartDate || "");
  const [planEndDate, setPlanEndDate] = useState(initialEndDate || "");
  const [generalObjective, setGeneralObjective] = useState(initialGeneralObjective || "");
  const [specifics, setSpecifics] = useState<string[]>(
    Array.isArray(initialSpecificObjectives) && initialSpecificObjectives.length
      ? (initialSpecificObjectives as string[])
      : [""],
  );
  const [requirements, setRequirements] = useState(initialRequirements || "");
  const [planDepartmentIds, setPlanDepartmentIds] = useState<string[]>(initialDepartmentIds.length ? initialDepartmentIds : (defaultDepartmentId ? [defaultDepartmentId] : []));
  const [planOwnerUserIds, setPlanOwnerUserIds] = useState<string[]>(initialOwnerUserIds.length ? initialOwnerUserIds : (initialOwnerUserId ? [initialOwnerUserId] : []));
  const [referenceIds, setReferenceIds] = useState<string[]>(initialReferenceIds);
  const [tasks, setTasks] = useState<DraftTask[]>(
    Array.isArray(initialDraftActions) && initialDraftActions.length
      ? (initialDraftActions as any[]).map(toTask)
      : [{ ...EMPTY_TASK, client_id: "draft-1", lead_department_id: defaultDepartmentId || "", assignee_user_id: initialOwnerUserId || "" }],
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const deptOptions = useMemo(() => departments.map((d) => ({ id: d.id, label: d.short_name || d.name })), [departments]);
  const planProfileOptions = useMemo(() => profiles.filter((p) => !planDepartmentIds.length || !p.primary_department_id || planDepartmentIds.includes(p.primary_department_id)).map((p) => ({ id: p.user_id, label: p.full_name || p.email || p.user_id })), [profiles, planDepartmentIds]);
  const allProfileOptions = useMemo(() => profiles.map((p) => ({ id: p.user_id, label: p.full_name || p.email || p.user_id })), [profiles]);

  function updateTask(index: number, patch: Partial<DraftTask>) {
    setTasks((prev) => prev.map((task, i) => (i === index ? { ...task, ...patch } : task)));
  }

  function toggleCriterion(index: number, code: string) {
    setTasks((prev) =>
      prev.map((task, i) => {
        if (i !== index) return task;
        const has = task.criteria_refs.includes(code);
        return { ...task, criteria_refs: has ? task.criteria_refs.filter((c) => c !== code) : [...task.criteria_refs, code] };
      }),
    );
  }

  function addTask(parentClientId = "") {
    setTasks((prev) => {
      const parent = parentClientId ? prev.find((x) => x.client_id === parentClientId) : null;
      return [...prev, {
        ...EMPTY_TASK,
        client_id: "draft-ui-" + Date.now() + "-" + (prev.length + 1),
        parent_client_id: parentClientId,
        lead_department_id: parent?.lead_department_id || planDepartmentIds[0] || defaultDepartmentId || "",
        assignee_user_id: parent?.assignee_user_id || planOwnerUserIds[0] || initialOwnerUserId || "",
        due_date: parent?.due_date || "",
      }];
    });
  }

  function removeTask(index: number) {
    setTasks((prev) => {
      if (prev.length <= 1) return prev;
      const removed = prev[index];
      return prev.filter((_, i) => i !== index).map((task) => task.parent_client_id === removed.client_id ? { ...task, parent_client_id: "" } : task);
    });
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

  function taskText(task: DraftTask) {
    return [task.title, task.description, task.expected_result].filter(Boolean).join(" ");
  }

  function acceptSuggestion(index: number, kind: PlanAutomationKind, candidate: PlanAutomationResource | null) {
    updateTask(index, {
      automation_kind: kind,
      automation_confirmed: true,
      automation_ref_id: candidate?.id || "",
      automation_target_department_id: "",
      automation_target_area: "",
      automation_report_recipient: "",
      automation_report_method: "",
      automation_report_period: "",
      automation_report_recurrence_rule: "",
      automation_report_recurrence_end_date: "",
      automation_assessment_round_type: "",
      automation_audit_type: "",
    });
  }

  function chooseAutomationKind(index: number, kind: PlanAutomationKind) {
    updateTask(index, {
      automation_kind: kind,
      automation_confirmed: true,
      automation_ref_id: "",
      automation_target_department_id: "",
      automation_target_area: "",
      automation_report_recipient: "",
      automation_report_method: "",
      automation_report_period: "",
      automation_report_recurrence_rule: "",
      automation_report_recurrence_end_date: "",
      automation_assessment_round_type: "",
      automation_audit_type: "",
    });
  }

  async function save() {
    setMessage(null);
    if (!title.trim()) {
      setMessage({ tone: "error", text: "Tên kế hoạch là bắt buộc." });
      return;
    }
    if (!generalObjective.trim()) {
      setMessage({ tone: "error", text: "Mục tiêu chung là bắt buộc." });
      return;
    }
    if (!planDepartmentIds.length) {
      setMessage({ tone: "error", text: "Cần chọn ít nhất một khoa/phòng chủ trì hoặc phối hợp." });
      return;
    }
    if (planStartDate && planEndDate && planEndDate < planStartDate) {
      setMessage({ tone: "error", text: "Ngày kết thúc kế hoạch không được trước ngày bắt đầu." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const cleanedSpecifics = specifics.map((s) => s.trim()).filter(Boolean);
      const cleanedTasks = tasks.filter((task) => task.title.trim());
      const res = await fetch(`/api/plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          program_type: programType,
          description: description.trim() || null,
          general_objective: generalObjective,
          specific_objectives: cleanedSpecifics,
          requirements,
          draft_actions: cleanedTasks,
          lead_department_id: planDepartmentIds[0] || defaultDepartmentId,
          lead_department_ids: planDepartmentIds,
          owner_user_id: planOwnerUserIds[0] || initialOwnerUserId,
          owner_user_ids: planOwnerUserIds,
          reference_ids: referenceIds,
          start_date: planStartDate || null,
          end_date: planEndDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không lưu được nội dung kế hoạch.");
      setMessage({ tone: "success", text: "Đã lưu nội dung kế hoạch và cấu hình tự động hoá." });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Có lỗi xảy ra." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel plan-composer" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`
        .plan-composer .qarica-assist{grid-column:1/-1;border:1px solid #cbdced;border-radius:14px;background:linear-gradient(135deg,#f9fcff,#f1f7fc);padding:12px 13px}
        .plan-composer .qa-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}
        .plan-composer .qa-eyebrow{font-size:9px;font-weight:900;letter-spacing:.08em;color:#315f91;text-transform:uppercase}
        .plan-composer .qa-title{margin-top:3px;font-size:13px;font-weight:850;color:#173b64}
        .plan-composer .qa-copy{margin-top:4px;color:#66788a;font-size:10px;line-height:1.45}
        .plan-composer .qa-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
        .plan-composer .qa-confirmed{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 8px;background:#e9f5ef;color:#246d4a;font-size:9px;font-weight:850}
        .plan-composer .qa-fields{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:10px;padding-top:10px;border-top:1px solid #dce7f0}
        .plan-composer .qa-note{grid-column:1/-1;border-radius:10px;background:#fff8ea;color:#7a571e;padding:8px 10px;font-size:10px;line-height:1.45}
        .plan-composer .qa-preview{grid-column:1/-1;border-radius:10px;background:#fff;padding:9px 10px;border:1px dashed #cbd7e2;font-size:10px;color:#52677a;line-height:1.45}
        @media(max-width:760px){.plan-composer .qa-fields{grid-template-columns:1fr}}
      `}</style>

      <div className="panel-title" style={{ padding: 0 }}>
        <div>
          <h2>Soạn nội dung kế hoạch</h2>
          <p>Nhập một lần tại kế hoạch. QARICA sẽ gợi ý đầu ra và kế thừa dữ liệu sang Action, Chỉ số, Giám sát, Báo cáo, Tự đánh giá, Audit hoặc Đề án cải tiến sau khi anh/chị xác nhận.</p>
        </div>
      </div>

      <section className="panel" style={{ padding: 13, background: "#fbfdfd" }}>
        <strong>3. Phân công & căn cứ</strong>
        <div style={{ marginBottom: 10 }}>
          <strong>1. Thông tin kế hoạch</strong>
          <div className="tiny muted" style={{ marginTop: 3 }}>Khi kế hoạch còn ở trạng thái Nháp, có thể sửa toàn bộ thông tin dưới đây. Sau khi Gửi duyệt, nội dung mới được khóa.</div>
        </div>
        <div className="form-grid two">
          <label className="span-2">Tên kế hoạch *
            <textarea rows={2} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>Loại kế hoạch
            <select value={programType} onChange={(e) => setProgramType(e.target.value)}>
              <option value="ANNUAL_PLAN">Kế hoạch năm</option>
              <option value="THEMATIC_PLAN">Kế hoạch chuyên đề</option>
              <option value="DEPARTMENT_PLAN">Kế hoạch khoa/phòng</option>
              <option value="PROGRAM">Chương trình</option>
              <option value="OTHER">Khác</option>
            </select>
          </label>
          <label>Mô tả / phạm vi
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Phạm vi áp dụng hoặc ghi chú triển khai" />
          </label>
          <label>Ngày bắt đầu
            <input type="date" value={planStartDate} onChange={(e) => setPlanStartDate(e.target.value)} />
          </label>
          <label>Ngày kết thúc
            <input type="date" min={planStartDate || undefined} value={planEndDate} onChange={(e) => setPlanEndDate(e.target.value)} />
          </label>
        </div>
      </section>

      <section>
        <strong>2. Mục tiêu & yêu cầu</strong>
        <div style={{ marginTop: 10 }}>
          <label>Mục tiêu chung *<textarea rows={3} value={generalObjective} onChange={(e) => setGeneralObjective(e.target.value)} /></label>
        </div>
      </section>

      <div>
        <span className="tiny muted">Mục tiêu cụ thể (không bắt buộc)</span>
        {specifics.map((specific, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <textarea rows={2} style={{ flex: 1 }} value={specific} onChange={(e) => updateSpecific(i, e.target.value)} placeholder={`Mục tiêu cụ thể ${i + 1}`} />
            <button type="button" className="button secondary small" onClick={() => removeSpecific(i)}>Xoá</button>
          </div>
        ))}
        <button type="button" className="button tertiary small" style={{ marginTop: 8 }} onClick={addSpecific}>+ Thêm mục tiêu cụ thể</button>
      </div>

      <label>Yêu cầu (không bắt buộc)<textarea rows={3} value={requirements} onChange={(e) => setRequirements(e.target.value)} /></label>

      <section className="panel" style={{ padding: 13, background: "#fbfdfd" }}>
        <div className="form-grid two">
          <label>Khoa/phòng chủ trì & phối hợp *
            <MultiCheckSelect options={deptOptions} value={planDepartmentIds} onChange={(ids) => { setPlanDepartmentIds(ids); setPlanOwnerUserIds((current) => current.filter((id) => { const p = profiles.find((x) => x.user_id === id); return !p?.primary_department_id || ids.includes(p.primary_department_id); })); }} placeholder="Chọn một hoặc nhiều khoa/phòng" />
          </label>
          <label>Người phụ trách / phối hợp
            <MultiCheckSelect options={planProfileOptions} value={planOwnerUserIds} onChange={setPlanOwnerUserIds} placeholder="Chọn một hoặc nhiều người" />
          </label>
          <label className="span-2">Căn cứ lập kế hoạch
            <MultiCheckSelect options={referenceOptions} value={referenceIds} onChange={setReferenceIds} placeholder="Chọn văn bản BYT/SYT/Bệnh viện..." emptyText="Chưa có văn bản trong module Văn bản / Chỉ đạo." />
          </label>
        </div>
        <div className="tiny muted" style={{ marginTop: 8 }}>Mục đầu tiên là đầu mối chính để tương thích workflow; các mục còn lại được lưu là đơn vị/người phối hợp.</div>
      </section>

      <div>
        <span className="tiny muted"><strong>4. Nhiệm vụ kế hoạch *</strong> · Action được tạo khi kế hoạch phê duyệt; đầu ra liên quan được tạo tự động nếu đã đủ dữ liệu.</span>

        {tasks.map((task, i) => {
          const suggestion = suggestPlanAutomationKind({ title: task.title, description: task.description, expectedResult: task.expected_result });
          const resources = suggestion === "INDICATOR" ? indicatorAssignments : suggestion === "MONITORING" ? monitoringChecklists : suggestion === "ASSESSMENT" ? assessmentCriteriaVersions : [];
          const candidate = ["INDICATOR", "MONITORING", "ASSESSMENT"].includes(suggestion) ? suggestPlanAutomationResource(taskText(task), resources) : null;
          const selectedResources = task.automation_kind === "INDICATOR" ? indicatorAssignments : task.automation_kind === "MONITORING" ? monitoringChecklists : task.automation_kind === "ASSESSMENT" ? assessmentCriteriaVersions : [];
          const selectedLabel = selectedResources.find((item) => item.id === task.automation_ref_id)?.label;

          return (
            <div key={i} className="panel" style={{ padding: 12, marginTop: 10, background: "#fbfdfd" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
                <div><strong>{task.parent_client_id ? "↳ Nhiệm vụ con" : "Nhiệm vụ"} {i + 1}</strong>{task.parent_client_id ? <div className="tiny muted">Kế thừa trong nhóm nhiệm vụ lớn</div> : null}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button type="button" className="button tertiary small" onClick={() => addTask(task.client_id)}>+ Nhiệm vụ con</button>
                  <button type="button" className="button secondary small" onClick={() => removeTask(i)}>Xoá nhiệm vụ</button>
                </div>
              </div>

              <div className="form-grid two">
                <label className="span-2">Tiêu đề *<input value={task.title} onChange={(e) => updateTask(i, { title: e.target.value })} /></label>
                <label>Khoa/phòng đầu mối *<select value={task.lead_department_id} onChange={(e) => updateTask(i, { lead_department_id: e.target.value })}><option value="">-- Chọn --</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.short_name || d.name}</option>)}</select></label>
                <label>Người đầu mối *<select value={task.assignee_user_id} onChange={(e) => updateTask(i, { assignee_user_id: e.target.value })}><option value="">-- Chọn --</option>{profiles.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email}</option>)}</select></label>
                <label>Khoa/phòng phối hợp
                  <MultiCheckSelect options={deptOptions.filter((x) => x.id !== task.lead_department_id)} value={task.collaborating_department_ids} onChange={(ids) => updateTask(i, { collaborating_department_ids: ids })} placeholder="Chọn nhiều đơn vị phối hợp" />
                </label>
                <label>Người phối hợp
                  <MultiCheckSelect options={allProfileOptions.filter((x) => x.id !== task.assignee_user_id)} value={task.collaborating_user_ids} onChange={(ids) => updateTask(i, { collaborating_user_ids: ids })} placeholder="Chọn nhiều người phối hợp" />
                </label>
                <label className="span-2">Thuộc nhiệm vụ lớn
                  <select value={task.parent_client_id} onChange={(e) => updateTask(i, { parent_client_id: e.target.value })}>
                    <option value="">— Nhiệm vụ cấp 1 —</option>
                    {tasks.filter((x) => x.client_id !== task.client_id).map((x, taskIndex) => <option key={x.client_id} value={x.client_id}>{taskIndex + 1}. {x.title || "Nhiệm vụ chưa đặt tên"}</option>)}
                  </select>
                </label>
                <label>Ngày bắt đầu<input type="date" value={task.start_date} onChange={(e) => updateTask(i, { start_date: e.target.value })} /></label>
                <label>Hạn hoàn thành *<input type="date" value={task.due_date} onChange={(e) => updateTask(i, { due_date: e.target.value })} /></label>
                <label>Mức ưu tiên<select value={task.priority} onChange={(e) => updateTask(i, { priority: e.target.value as DraftTask["priority"] })}><option value="LOW">Thấp</option><option value="NORMAL">Bình thường</option><option value="HIGH">Cao</option><option value="URGENT">Khẩn</option><option value="CRITICAL">Rất khẩn</option></select></label>
                <label className="span-2">Kết quả kỳ vọng *<textarea rows={2} value={task.expected_result} onChange={(e) => updateTask(i, { expected_result: e.target.value })} /></label>
                <label className="span-2">Yêu cầu minh chứng (không bắt buộc)<textarea rows={2} value={task.verification_requirement} onChange={(e) => updateTask(i, { verification_requirement: e.target.value })} /></label>
                <label className="span-2">Mô tả thêm (không bắt buộc)<textarea rows={2} value={task.description} onChange={(e) => updateTask(i, { description: e.target.value })} /></label>

                <div className="qarica-assist">
                  <div className="qa-head">
                    <div>
                      <div className="qa-eyebrow">TRỢ LÝ QARICA · KẾ THỪA DỮ LIỆU</div>
                      {task.automation_confirmed ? (
                        <>
                          <div className="qa-title">Đã xác nhận: {automationKindLabel(task.automation_kind)}</div>
                          <div className="qa-copy">QARICA sẽ dùng lại tiêu đề, khoa/phòng, người phụ trách và thời hạn; không yêu cầu nhập lại ở module đích.</div>
                        </>
                      ) : suggestion !== "ACTION" ? (
                        <>
                          <div className="qa-title">Gợi ý: {automationKindLabel(suggestion)}</div>
                          <div className="qa-copy">
                            {candidate
                              ? `Tìm thấy 01 dữ liệu phù hợp: ${candidate.label}. Xác nhận một lần để dùng lại.`
                              : suggestion === "INDICATOR"
                                ? "Nhiệm vụ có dấu hiệu theo dõi chỉ số. Chọn một chỉ số đã tồn tại; QARICA không tự tạo master chỉ số mới."
                                : suggestion === "MONITORING"
                                  ? "Nhiệm vụ có dấu hiệu giám sát. QARICA sẽ hỏi bảng kiểm và đối tượng giám sát còn thiếu."
                                  : suggestion === "ASSESSMENT"
                                    ? "Nhiệm vụ có dấu hiệu tự đánh giá. Chọn bộ tiêu chí đã phát hành; QARICA không tự tạo bộ tiêu chí."
                                    : suggestion === "REPORT"
                                      ? "Nhiệm vụ có dấu hiệu báo cáo. QARICA chỉ hỏi nơi nhận, phương thức và kỳ báo cáo."
                                      : suggestion === "AUDIT"
                                        ? "Nhiệm vụ có dấu hiệu Audit/Tracer. Xác nhận loại đánh giá để tạo hồ sơ đúng workflow."
                                        : "Nhiệm vụ có dấu hiệu cải tiến. QARICA sẽ tạo đề án Nháp, không tự suy diễn baseline, SMART hoặc PDSA."}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="qa-title">Đầu ra mặc định: Action</div>
                          <div className="qa-copy">Nếu đây chỉ là đầu việc thông thường, không cần khai báo thêm.</div>
                        </>
                      )}
                    </div>

                    <div className="qa-actions">
                      {task.automation_confirmed ? <span className="qa-confirmed">✓ Đã xác nhận</span> : null}
                      {!task.automation_confirmed && suggestion !== "ACTION" ? (
                        <button type="button" className="button primary small" onClick={() => acceptSuggestion(i, suggestion, candidate)}>
                          {candidate ? "Xác nhận gợi ý" : "Dùng gợi ý"}
                        </button>
                      ) : null}
                      <select
                        aria-label="Chọn đầu ra tự động"
                        value={task.automation_confirmed ? task.automation_kind : "ACTION"}
                        onChange={(e) => chooseAutomationKind(i, e.target.value as PlanAutomationKind)}
                        style={{ minWidth: 145 }}
                      >
                        <option value="ACTION">Chỉ Action</option>
                        <option value="INDICATOR">Chỉ số</option>
                        <option value="MONITORING">Đợt giám sát</option>
                        <option value="REPORT">Báo cáo</option>
                        <option value="ASSESSMENT">Tự đánh giá</option>
                        <option value="AUDIT">Audit / Tracer</option>
                        <option value="IMPROVEMENT">Đề án cải tiến</option>
                      </select>
                    </div>
                  </div>

                  {task.automation_confirmed && task.automation_kind !== "ACTION" ? (
                    <div className="qa-fields">
                      {task.automation_kind === "INDICATOR" ? (
                        <>
                          <label className="span-2">Chỉ số hiện có *
                            <select value={task.automation_ref_id} onChange={(e) => updateTask(i, { automation_ref_id: e.target.value })}>
                              <option value="">-- Chọn chỉ số đã có --</option>
                              {indicatorAssignments.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                            </select>
                          </label>
                          {!indicatorAssignments.length ? <div className="qa-note">Chưa có chỉ số/phân công chỉ số phù hợp trong năm. QARICA không tự tạo master chỉ số; cần tạo hoặc phân công chỉ số trước.</div> : null}
                        </>
                      ) : task.automation_kind === "MONITORING" ? (
                        <>
                          <label>Bảng kiểm đã phát hành *
                            <select value={task.automation_ref_id} onChange={(e) => updateTask(i, { automation_ref_id: e.target.value })}>
                              <option value="">-- Chọn bảng kiểm --</option>
                              {monitoringChecklists.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                            </select>
                          </label>
                          <label>Khoa/phòng được giám sát
                            <select value={task.automation_target_department_id} onChange={(e) => updateTask(i, { automation_target_department_id: e.target.value, automation_target_area: e.target.value ? "" : task.automation_target_area })}>
                              <option value="">-- Không cố định theo khoa/phòng --</option>
                              {deptOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                            </select>
                          </label>
                          <label className="span-2">Hoặc phạm vi/khu vực giám sát
                            <input value={task.automation_target_area} onChange={(e) => updateTask(i, { automation_target_area: e.target.value, automation_target_department_id: e.target.value.trim() ? "" : task.automation_target_department_id })} placeholder="Ví dụ: Toàn bộ Tòa A và Tòa B" />
                          </label>
                          {!task.automation_target_department_id && !task.automation_target_area.trim() ? <div className="qa-note">Cần chọn <strong>một trong hai</strong>: khoa/phòng cụ thể hoặc phạm vi/khu vực giám sát. Không cần nhập cả hai.</div> : null}
                        </>
                      ) : task.automation_kind === "ASSESSMENT" ? (
                        <>
                          <label className="span-2">Bộ tiêu chí đã phát hành * <small className="muted">({assessmentCriteriaVersions.length} bộ khả dụng)</small>
                            <select value={task.automation_ref_id} onChange={(e) => updateTask(i, { automation_ref_id: e.target.value })}>
                              <option value="">-- Chọn bộ tiêu chí / phiên bản --</option>
                              {assessmentCriteriaVersions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                            </select>
                          </label>
                          <label className="span-2">Loại đợt tự đánh giá
                            <input value={task.automation_assessment_round_type} onChange={(e) => updateTask(i, { automation_assessment_round_type: e.target.value })} placeholder="Ví dụ: Tự đánh giá định kỳ" />
                          </label>
                          {!assessmentCriteriaVersions.length ? <div className="qa-note">Chưa có bộ tiêu chí PUBLISHED. QARICA không tạo bộ tiêu chí từ câu chữ; cần phát hành bộ tiêu chí trước.</div> : null}
                        </>
                      ) : task.automation_kind === "REPORT" ? (
                        <>
                          <label>Nơi nhận *
                            <input value={task.automation_report_recipient} onChange={(e) => updateTask(i, { automation_report_recipient: e.target.value })} placeholder="Ví dụ: Sở Y tế TP.HCM" />
                          </label>
                          <label>Phương thức gửi *
                            <input value={task.automation_report_method} onChange={(e) => updateTask(i, { automation_report_method: e.target.value })} placeholder="Phần mềm / Email / Văn bản..." />
                          </label>
                          <label>Kỳ báo cáo *
                            <input value={task.automation_report_period} onChange={(e) => updateTask(i, { automation_report_period: e.target.value })} placeholder="Ví dụ: Tháng 9/2026" />
                          </label>
                          <label>Chu kỳ
                            <select value={task.automation_report_recurrence_rule} onChange={(e) => updateTask(i, { automation_report_recurrence_rule: e.target.value })}>
                              <option value="">Một lần</option>
                              <option value="MONTHLY">Hàng tháng</option>
                              <option value="QUARTERLY">Hàng quý</option>
                              <option value="SEMIANNUAL">6 tháng</option>
                              <option value="ANNUAL">Hàng năm</option>
                            </select>
                          </label>
                          {task.automation_report_recurrence_rule ? <label className="span-2">Kết thúc chu kỳ
                            <input type="date" value={task.automation_report_recurrence_end_date} onChange={(e) => updateTask(i, { automation_report_recurrence_end_date: e.target.value })} />
                          </label> : null}
                        </>
                      ) : task.automation_kind === "AUDIT" ? (
                        <label className="span-2">Loại Audit / Tracer *
                          <input value={task.automation_audit_type} onChange={(e) => updateTask(i, { automation_audit_type: e.target.value })} placeholder="Ví dụ: Audit nội bộ / Tracer / Kiểm tra chéo" />
                        </label>
                      ) : (
                        <div className="qa-note">QARICA sẽ tạo hồ sơ Đề án cải tiến ở trạng thái Nháp, kế thừa owner và thời gian. Baseline, SMART và PDSA phải được người phụ trách hoàn thiện trong workflow đề án; hệ thống không tự suy diễn.</div>
                      )}
                      <div className="qa-preview">
                        Khi kế hoạch được phê duyệt: <strong>Action</strong> + <strong>{automationKindLabel(task.automation_kind)}</strong> được tạo và liên kết cùng nguồn.
                        {selectedLabel ? <> Dữ liệu nguồn: <strong>{selectedLabel}</strong>.</> : null}
                      </div>
                    </div>
                  ) : null}
                </div>

                {criteriaItems.length ? <div className="span-2">
                  <span className="tiny muted">Liên quan đến tiêu chí nào trong 83 tiêu chí (không bắt buộc)</span>
                  <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8, padding: 8, marginTop: 6, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 4 }}>
                    {criteriaItems.map((criterion) => (
                      <label key={criterion.id} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, fontWeight: 400 }}>
                        <input type="checkbox" checked={task.criteria_refs.includes(criterion.code)} onChange={() => toggleCriterion(i, criterion.code)} style={{ marginTop: 2 }} />
                        <span><strong>{criterion.code}</strong> — {criterion.title}</span>
                      </label>
                    ))}
                  </div>
                  {task.criteria_refs.length ? <div style={{ marginTop: 4, fontSize: 11.5, color: "#0f766e" }}>Đã chọn: {task.criteria_refs.join(", ")}</div> : null}
                </div> : null}
              </div>
            </div>
          );
        })}

        <button type="button" className="button tertiary small" style={{ marginTop: 10 }} onClick={addTask}>+ Thêm nhiệm vụ</button>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className="button primary" disabled={busy} onClick={save}><Icon name="save" size={16} /> {busy ? "Đang lưu..." : "Lưu nội dung kế hoạch"}</button>
      </div>
      {message ? <div className={`alert ${message.tone}`}>{message.text}</div> : null}
    </section>
  );
}
