"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { MultiCheckSelect } from "@/components/multi-check-select";
import {
  automationKindLabel,
  suggestPlanAutomationKinds,
  suggestPlanAutomationResource,
  type PlanAutomationKind
} from "@/lib/plan-automation";

type Department = { id: string; name: string; short_name: string | null };
type Profile = { user_id: string; full_name: string | null; email: string | null; primary_department_id?: string | null };
type ReferenceOption = { id: string; label: string; description?: string | null };
type WorkGroupOption = { id: string; label: string; description?: string | null; memberUserIds: string[]; leaderUserId: string | null; leadDepartmentId: string | null };
type CriterionItem = { id: string; code: string; title: string };
type AutomationOption = { id: string; label: string };
const OUTPUT_KIND_OPTIONS = [
  { id: "INDICATOR", label: "Chỉ số chất lượng" },
  { id: "MONITORING", label: "Đợt giám sát" },
  { id: "REPORT", label: "Nghĩa vụ báo cáo" },
  { id: "ASSESSMENT", label: "Tự đánh giá chất lượng" },
  { id: "AUDIT", label: "Audit / Tracer" },
  { id: "IMPROVEMENT", label: "Đề án cải tiến" },
];
type AutomationOutputKind = Exclude<PlanAutomationKind, "ACTION">;
type AutomationOutput = {
  kind: AutomationOutputKind;
  ref_id: string;
  target_department_id: string;
  target_area: string;
  monitoring_recurrence: "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  monitoring_recurrence_end_date: string;
  report_recipient: string;
  report_method: string;
  report_period: string;
  report_recurrence_rule: string;
  report_recurrence_end_date: string;
  assessment_round_type: string;
  audit_type: string;
};

type DraftTask = {
  client_id: string;
  title: string;
  lead_department_id: string;
  collaborating_department_ids: string[];
  collaborating_group_ids: string[];
  assignment_target_type: "USER" | "GROUP";
  assignee_user_id: string;
  assignee_group_id: string;
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
  automation_outputs: AutomationOutput[];
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
  collaborating_group_ids: [],
  assignment_target_type: "USER",
  assignee_user_id: "",
  assignee_group_id: "",
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
  automation_outputs: [],
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

function emptyOutput(kind: AutomationOutputKind, refId = ""): AutomationOutput {
  return {
    kind,
    ref_id: refId,
    target_department_id: "",
    target_area: "",
    monitoring_recurrence: "ONCE",
    monitoring_recurrence_end_date: "",
    report_recipient: "",
    report_method: "",
    report_period: "",
    report_recurrence_rule: "",
    report_recurrence_end_date: "",
    assessment_round_type: "",
    audit_type: "",
  };
}

function toTask(raw: any): DraftTask {
  const legacyKind = ["ACTION", "INDICATOR", "MONITORING", "REPORT", "ASSESSMENT", "AUDIT", "IMPROVEMENT"].includes(String(raw?.automation_kind || "").toUpperCase())
    ? String(raw.automation_kind).toUpperCase() as PlanAutomationKind
    : "ACTION";
  const rawOutputs = Array.isArray(raw?.automation_outputs) ? raw.automation_outputs : [];
  const parsedOutputs: AutomationOutput[] = rawOutputs
    .map((row: any) => {
      const kind = String(row?.kind || "").toUpperCase();
      if (!["INDICATOR","MONITORING","REPORT","ASSESSMENT","AUDIT","IMPROVEMENT"].includes(kind)) return null;
      return {
        kind: kind as AutomationOutputKind,
        ref_id: row?.ref_id || "",
        target_department_id: row?.target_department_id || "",
        target_area: row?.target_area || "",
        monitoring_recurrence: ["DAILY","WEEKLY","MONTHLY","QUARTERLY","YEARLY"].includes(String(row?.monitoring_recurrence || "").toUpperCase()) ? String(row.monitoring_recurrence).toUpperCase() as AutomationOutput["monitoring_recurrence"] : "ONCE",
        monitoring_recurrence_end_date: row?.monitoring_recurrence_end_date || "",
        report_recipient: row?.report_recipient || "",
        report_method: row?.report_method || "",
        report_period: row?.report_period || "",
        report_recurrence_rule: row?.report_recurrence_rule || "",
        report_recurrence_end_date: row?.report_recurrence_end_date || "",
        assessment_round_type: row?.assessment_round_type || "",
        audit_type: row?.audit_type || "",
      } as AutomationOutput;
    })
    .filter((x: AutomationOutput | null): x is AutomationOutput => !!x);

  if (!parsedOutputs.length && raw?.automation_confirmed === true && legacyKind !== "ACTION") {
    parsedOutputs.push({
      kind: legacyKind as AutomationOutputKind,
      ref_id: raw?.automation_ref_id || "",
      target_department_id: raw?.automation_target_department_id || "",
      target_area: raw?.automation_target_area || "",
      monitoring_recurrence: "ONCE",
      monitoring_recurrence_end_date: "",
      report_recipient: raw?.automation_report_recipient || "",
      report_method: raw?.automation_report_method || "",
      report_period: raw?.automation_report_period || "",
      report_recurrence_rule: raw?.automation_report_recurrence_rule || "",
      report_recurrence_end_date: raw?.automation_report_recurrence_end_date || "",
      assessment_round_type: raw?.automation_assessment_round_type || "",
      audit_type: raw?.automation_audit_type || "",
    });
  }

  const uniqueOutputs = Array.from(new Map(parsedOutputs.map((row) => [row.kind, row])).values());
  const first = uniqueOutputs[0];
  return {
    client_id: raw?.client_id || "draft-" + Math.random().toString(36).slice(2, 10),
    title: raw?.title || "",
    lead_department_id: raw?.lead_department_id || "",
    collaborating_department_ids: Array.isArray(raw?.collaborating_department_ids) ? raw.collaborating_department_ids : [],
    collaborating_group_ids: Array.isArray(raw?.collaborating_group_ids) ? raw.collaborating_group_ids : [],
    assignment_target_type: String(raw?.assignment_target_type || "").toUpperCase() === "GROUP" || raw?.assignee_group_id ? "GROUP" : "USER",
    assignee_user_id: raw?.assignee_user_id || "",
    assignee_group_id: raw?.assignee_group_id || "",
    collaborating_user_ids: Array.isArray(raw?.collaborating_user_ids) ? raw.collaborating_user_ids : [],
    parent_client_id: raw?.parent_client_id || "",
    start_date: raw?.start_date || "",
    due_date: raw?.due_date || "",
    priority: raw?.priority || "NORMAL",
    expected_result: raw?.expected_result || "",
    verification_requirement: raw?.verification_requirement || "",
    description: raw?.description || "",
    criteria_refs: Array.isArray(raw?.criteria_refs) ? raw.criteria_refs : [],
    automation_kind: first?.kind || legacyKind,
    automation_confirmed: uniqueOutputs.length > 0,
    automation_outputs: uniqueOutputs,
    automation_ref_id: first?.ref_id || raw?.automation_ref_id || "",
    automation_target_department_id: first?.target_department_id || raw?.automation_target_department_id || "",
    automation_target_area: first?.target_area || raw?.automation_target_area || "",
    automation_report_recipient: first?.report_recipient || raw?.automation_report_recipient || "",
    automation_report_method: first?.report_method || raw?.automation_report_method || "",
    automation_report_period: first?.report_period || raw?.automation_report_period || "",
    automation_report_recurrence_rule: first?.report_recurrence_rule || raw?.automation_report_recurrence_rule || "",
    automation_report_recurrence_end_date: first?.report_recurrence_end_date || raw?.automation_report_recurrence_end_date || "",
    automation_assessment_round_type: first?.assessment_round_type || raw?.automation_assessment_round_type || "",
    automation_audit_type: first?.audit_type || raw?.automation_audit_type || "",
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
  workGroupOptions,
  initialAssignedGroupIds,
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
  workGroupOptions: WorkGroupOption[];
  initialAssignedGroupIds: string[];
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
  const [planAssignedGroupIds, setPlanAssignedGroupIds] = useState<string[]>(initialAssignedGroupIds);
  const [tasks, setTasks] = useState<DraftTask[]>(
    Array.isArray(initialDraftActions) && initialDraftActions.length
      ? (initialDraftActions as any[]).map(toTask)
      : [{ ...EMPTY_TASK, client_id: "draft-1", lead_department_id: defaultDepartmentId || "", assignee_user_id: initialOwnerUserId || "" }],
  );
  const [childEnabledIds, setChildEnabledIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const deptOptions = useMemo(() => departments.map((d) => ({ id: d.id, label: d.short_name || d.name })), [departments]);
  const planProfileOptions = useMemo(() => profiles.filter((p) => !planDepartmentIds.length || !p.primary_department_id || planDepartmentIds.includes(p.primary_department_id)).map((p) => ({ id: p.user_id, label: p.full_name || p.email || p.user_id })), [profiles, planDepartmentIds]);
  const allProfileOptions = useMemo(() => profiles.map((p) => ({ id: p.user_id, label: p.full_name || p.email || p.user_id })), [profiles]);
  const taskTreeRows = useMemo(() => {
    const taskIds = new Set(tasks.map((task) => task.client_id));
    const roots = tasks
      .map((task, index) => ({ task, index }))
      .filter(({ task }) => !task.parent_client_id || !taskIds.has(task.parent_client_id));
    const rows: Array<{ task: DraftTask; index: number; depth: 0 | 1; label: string; parentTitle: string | null; childCount: number }> = [];
    const handled = new Set<string>();

    roots.forEach((root, rootIndex) => {
      const children = tasks
        .map((task, index) => ({ task, index }))
        .filter(({ task }) => task.parent_client_id === root.task.client_id);
      rows.push({ task: root.task, index: root.index, depth: 0, label: String(rootIndex + 1), parentTitle: null, childCount: children.length });
      handled.add(root.task.client_id);
      children.forEach((child, childIndex) => {
        rows.push({
          task: child.task,
          index: child.index,
          depth: 1,
          label: `${rootIndex + 1}.${childIndex + 1}`,
          parentTitle: root.task.title || `Nhiệm vụ ${rootIndex + 1}`,
          childCount: 0,
        });
        handled.add(child.task.client_id);
      });
    });

    tasks.forEach((task, index) => {
      if (handled.has(task.client_id)) return;
      rows.push({ task, index, depth: 0, label: String(rows.filter((row) => row.depth === 0).length + 1), parentTitle: null, childCount: 0 });
    });
    return rows;
  }, [tasks]);

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
      const parentIndex = parentClientId ? prev.findIndex((x) => x.client_id === parentClientId) : -1;
      const parent = parentIndex >= 0 ? prev[parentIndex] : null;
      const newTask: DraftTask = {
        ...EMPTY_TASK,
        client_id: "draft-ui-" + Date.now() + "-" + (prev.length + 1),
        parent_client_id: parentClientId,
        lead_department_id: parent?.lead_department_id || planDepartmentIds[0] || defaultDepartmentId || "",
        assignment_target_type: parent?.assignment_target_type || "USER",
        assignee_user_id: parent?.assignment_target_type === "GROUP" ? "" : (parent?.assignee_user_id || planOwnerUserIds[0] || initialOwnerUserId || ""),
        assignee_group_id: parent?.assignment_target_type === "GROUP" ? (parent?.assignee_group_id || "") : "",
        start_date: parent?.start_date || "",
        due_date: parent?.due_date || "",
      };
      if (!parent) return [...prev, newTask];

      let insertAt = parentIndex + 1;
      while (insertAt < prev.length && prev[insertAt].parent_client_id === parentClientId) insertAt += 1;
      return [...prev.slice(0, insertAt), newTask, ...prev.slice(insertAt)];
    });
  }

  function promoteTask(index: number) {
    updateTask(index, { parent_client_id: "" });
  }

  function setChildMode(task: DraftTask, enabled: boolean) {
    const childCount = tasks.filter((item) => item.parent_client_id === task.client_id).length;
    if (!enabled && childCount > 0) {
      setMessage({ tone: "error", text: `Nhiệm vụ này đang có ${childCount} nhiệm vụ con. Hãy xóa hoặc đưa các nhiệm vụ con lên cấp 1 trước khi bỏ chọn.` });
      return;
    }
    setChildEnabledIds((current) => enabled
      ? Array.from(new Set([...current, task.client_id]))
      : current.filter((id) => id !== task.client_id));
  }

  function removeTask(index: number) {
    const target = tasks[index];
    if (!target) return;
    const childCount = tasks.filter((task) => task.parent_client_id === target.client_id).length;
    if (childCount > 0) {
      setMessage({ tone: "error", text: `Nhiệm vụ này đang có ${childCount} nhiệm vụ con. Hãy xóa hoặc đưa các nhiệm vụ con lên cấp 1 trước.` });
      return;
    }
    if (tasks.length <= 1) {
      setMessage({ tone: "error", text: "Kế hoạch cần còn ít nhất một nhiệm vụ." });
      return;
    }
    setTasks((prev) => prev.filter((_, i) => i !== index));
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

  function resourcesForKind(kind: AutomationOutputKind) {
    if (kind === "INDICATOR") return indicatorAssignments;
    if (kind === "MONITORING") return monitoringChecklists;
    if (kind === "ASSESSMENT") return assessmentCriteriaVersions;
    return [] as AutomationOption[];
  }

  function updateAutomationOutput(index: number, kind: AutomationOutputKind, patch: Partial<AutomationOutput>) {
    setTasks((prev) => prev.map((task, i) => {
      if (i !== index) return task;
      const outputs = task.automation_outputs.map((output) => output.kind === kind ? { ...output, ...patch } : output);
      const first = outputs[0];
      return {
        ...task,
        automation_outputs: outputs,
        automation_kind: first?.kind || "ACTION",
        automation_confirmed: outputs.length > 0,
      };
    }));
  }

  function setAutomationKinds(index: number, kinds: string[]) {
    const selected = kinds.filter((kind): kind is AutomationOutputKind => ["INDICATOR","MONITORING","REPORT","ASSESSMENT","AUDIT","IMPROVEMENT"].includes(kind));
    setTasks((prev) => prev.map((task, i) => {
      if (i !== index) return task;
      const current = new Map(task.automation_outputs.map((output) => [output.kind, output]));
      const outputs = selected.map((kind) => current.get(kind) || emptyOutput(kind));
      const first = outputs[0];
      return {
        ...task,
        automation_outputs: outputs,
        automation_kind: first?.kind || "ACTION",
        automation_confirmed: outputs.length > 0,
      };
    }));
  }

  function acceptSuggestions(index: number, kinds: AutomationOutputKind[]) {
    setTasks((prev) => prev.map((task, i) => {
      if (i !== index) return task;
      const current = new Map(task.automation_outputs.map((output) => [output.kind, output]));
      for (const kind of kinds) {
        if (current.has(kind)) continue;
        const candidate = suggestPlanAutomationResource(taskText(task), resourcesForKind(kind));
        current.set(kind, emptyOutput(kind, candidate?.id || ""));
      }
      const outputs = Array.from(current.values());
      const first = outputs[0];
      return {
        ...task,
        automation_outputs: outputs,
        automation_kind: first?.kind || "ACTION",
        automation_confirmed: outputs.length > 0,
      };
    }));
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
      const cleanedTasks = taskTreeRows.map((row) => row.task).filter((task) => task.title.trim());
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
          assigned_group_ids: planAssignedGroupIds,
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
        .plan-composer .task-tree{display:grid;gap:10px;margin-top:10px}
        .plan-composer .task-card{position:relative;padding:12px;background:#fbfdfd}
        .plan-composer .task-card.child{margin-left:30px;background:#fff;border-color:#d9e5e8}
        .plan-composer .task-card.child:before{content:"";position:absolute;left:-18px;top:-11px;width:14px;height:31px;border-left:2px solid #c8d8dd;border-bottom:2px solid #c8d8dd;border-bottom-left-radius:8px}
        .plan-composer .task-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap}
        .plan-composer .task-title-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .plan-composer .task-index{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:24px;padding:0 7px;border-radius:999px;background:#eaf2f4;color:#24424b;font-size:10px;font-weight:900}
        .plan-composer .task-card.child .task-index{background:#f1f5f9;color:#475569}
        .plan-composer .task-parent-note{font-size:10px;color:#71828a;margin-top:3px}
        .plan-composer .task-actions{display:flex;gap:6px;flex-wrap:wrap}
        @media(max-width:760px){.plan-composer .qa-fields{grid-template-columns:1fr}.plan-composer .task-card.child{margin-left:14px}.plan-composer .task-card.child:before{left:-9px;width:7px}}
      `}</style>

      <div className="panel-title" style={{ padding: 0 }}>
        <div>
          <h2>Soạn nội dung kế hoạch</h2>
          <p>Nhập một lần tại kế hoạch. QARICA sẽ gợi ý đầu ra và kế thừa dữ liệu sang Action, Chỉ số, Giám sát, Báo cáo, Tự đánh giá, Audit hoặc Đề án cải tiến sau khi anh/chị xác nhận.</p>
        </div>
      </div>

      <section className="panel" style={{ padding: 13, background: "#fbfdfd" }}>
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
        <div style={{ marginBottom: 10 }}><strong>3. Phân công & căn cứ</strong></div>
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
          <label className="span-2">Nhóm thực hiện
            <MultiCheckSelect options={workGroupOptions} value={planAssignedGroupIds} onChange={setPlanAssignedGroupIds} placeholder="Chọn nhóm đã cấu hình" emptyText="Chưa có nhóm được cấu hình. Quản trị viên tạo tại Quản trị hệ thống → Nhóm phân công." />
          </label>
        </div>
        <div className="tiny muted" style={{ marginTop: 8 }}>Mục đầu tiên là đầu mối chính để tương thích workflow; các mục còn lại được lưu là đơn vị/người phối hợp.</div>
      </section>

      <div>
        <span className="tiny muted"><strong>4. Nhiệm vụ kế hoạch *</strong> · Action được tạo khi kế hoạch phê duyệt; đầu ra liên quan được tạo tự động nếu đã đủ dữ liệu.</span>

        <div className="task-tree">
        {taskTreeRows.map((row) => {
          const task = row.task;
          const i = row.index;
          const suggestions = suggestPlanAutomationKinds({ title: task.title, description: task.description, expectedResult: task.expected_result }) as AutomationOutputKind[];
          const selectedKinds = task.automation_outputs.map((output) => output.kind);
          const missingSuggestions = suggestions.filter((kind) => !selectedKinds.includes(kind));

          return (
            <div key={task.client_id} className={`panel task-card ${row.depth === 1 ? "child" : "root"}`}>
              <div className="task-heading">
                <div>
                  <div className="task-title-line">
                    <span className="task-index">{row.label}</span>
                    <strong>{row.depth === 1 ? "Nhiệm vụ con" : (row.childCount > 0 ? "Nhiệm vụ lớn" : "Nhiệm vụ")}</strong>
                    {row.depth === 0 ? <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, color: "#52677a" }}>
                      <input
                        type="checkbox"
                        checked={row.childCount > 0 || childEnabledIds.includes(task.client_id)}
                        onChange={(e) => setChildMode(task, e.target.checked)}
                      />
                      Có nhiệm vụ con
                    </label> : null}
                    {row.depth === 0 && row.childCount > 0 ? <span className="tiny muted">{row.childCount} nhiệm vụ con</span> : null}
                  </div>
                  {row.depth === 1 ? <div className="task-parent-note">Thuộc: {row.parentTitle}</div> : null}
                </div>
                <div className="task-actions">
                  {row.depth === 0 && (row.childCount > 0 || childEnabledIds.includes(task.client_id)) ? <button type="button" className="button tertiary small" onClick={() => addTask(task.client_id)}>+ Thêm nhiệm vụ con</button> : null}
                  {row.depth === 1 ? <button type="button" className="button tertiary small" onClick={() => promoteTask(i)}>Đưa lên cấp 1</button> : null}
                  <button type="button" className="button secondary small" onClick={() => removeTask(i)}>Xoá</button>
                </div>
              </div>

              <div className="form-grid two">
                <label className="span-2">Tiêu đề *<input value={task.title} onChange={(e) => updateTask(i, { title: e.target.value })} /></label>
                <label>Khoa/phòng đầu mối *<select value={task.lead_department_id} onChange={(e) => updateTask(i, { lead_department_id: e.target.value })}><option value="">-- Chọn --</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.short_name || d.name}</option>)}</select></label>
                <label>Phân công cho *
                  <select
                    value={task.assignment_target_type}
                    onChange={(e) => {
                      const targetType = e.target.value as DraftTask["assignment_target_type"];
                      updateTask(i, {
                        assignment_target_type: targetType,
                        assignee_user_id: targetType === "USER" ? task.assignee_user_id : "",
                        assignee_group_id: targetType === "GROUP" ? task.assignee_group_id : "",
                      });
                    }}
                  >
                    <option value="USER">Cá nhân</option>
                    <option value="GROUP">Nhóm</option>
                  </select>
                </label>
                {task.assignment_target_type === "USER" ? <label className="span-2">Người phụ trách *
                  <select value={task.assignee_user_id} onChange={(e) => updateTask(i, { assignee_user_id: e.target.value })}>
                    <option value="">-- Chọn người phụ trách --</option>
                    {profiles.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email}</option>)}
                  </select>
                </label> : <label className="span-2">Nhóm phụ trách *
                  <select
                    value={task.assignee_group_id}
                    onChange={(e) => {
                      const group = workGroupOptions.find((item) => item.id === e.target.value);
                      updateTask(i, {
                        assignee_group_id: e.target.value,
                        lead_department_id: task.lead_department_id || group?.leadDepartmentId || "",
                      });
                    }}
                  >
                    <option value="">-- Chọn nhóm đã cấu hình --</option>
                    {workGroupOptions.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
                  </select>
                  <span className="tiny muted">Thành viên và trưởng nhóm lấy từ Quản trị hệ thống → Nhóm phân công. Không khai báo lại trong kế hoạch.</span>
                </label>}
                <label>Khoa/phòng phối hợp
                  <MultiCheckSelect options={deptOptions.filter((x) => x.id !== task.lead_department_id)} value={task.collaborating_department_ids} onChange={(ids) => updateTask(i, { collaborating_department_ids: ids })} placeholder="Chọn nhiều đơn vị phối hợp" />
                </label>
                <label>Người phối hợp
                  <MultiCheckSelect options={allProfileOptions.filter((x) => task.assignment_target_type !== "USER" || x.id !== task.assignee_user_id)} value={task.collaborating_user_ids} onChange={(ids) => updateTask(i, { collaborating_user_ids: ids })} placeholder="Chọn nhiều người phối hợp" />
                </label>
                <label className="span-2">Nhóm phối hợp
                  <MultiCheckSelect
                    options={workGroupOptions.filter((group) => group.id !== task.assignee_group_id)}
                    value={task.collaborating_group_ids}
                    onChange={(ids) => updateTask(i, { collaborating_group_ids: ids })}
                    placeholder="Chọn nhóm phối hợp (nếu có)"
                    emptyText="Chưa có nhóm đang hoạt động. Quản trị viên cấu hình tại Quản trị hệ thống → Nhóm phân công."
                  />
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
                      <div className="qa-eyebrow">TRỢ LÝ QARICA · NHIỀU ĐẦU RA</div>
                      {task.automation_outputs.length ? (
                        <>
                          <div className="qa-title">Đã chọn {task.automation_outputs.length} đầu ra bổ sung</div>
                          <div className="qa-copy">Một nhiệm vụ luôn tạo 01 Action. Các đầu ra dưới đây được tạo thêm và liên kết cùng Action khi kế hoạch được phê duyệt.</div>
                        </>
                      ) : suggestions.length ? (
                        <>
                          <div className="qa-title">Gợi ý: {suggestions.map((kind) => automationKindLabel(kind)).join(" + ")}</div>
                          <div className="qa-copy">Có thể chọn một hoặc nhiều đầu ra. QARICA chỉ gợi ý từ nội dung; người dùng quyết định và hoàn thiện cấu hình còn thiếu.</div>
                        </>
                      ) : (
                        <>
                          <div className="qa-title">Đầu ra mặc định: Chỉ Action</div>
                          <div className="qa-copy">Nếu đây là đầu việc thông thường, không cần chọn thêm đầu ra.</div>
                        </>
                      )}
                    </div>
                    <div className="qa-actions">
                      {task.automation_outputs.length ? <span className="qa-confirmed">✓ {task.automation_outputs.length} đầu ra</span> : null}
                      {missingSuggestions.length ? (
                        <button type="button" className="button primary small" onClick={() => acceptSuggestions(i, missingSuggestions)}>
                          Dùng {missingSuggestions.length > 1 ? (missingSuggestions.length + " gợi ý") : "gợi ý"}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <label>Đầu ra bổ sung
                      <MultiCheckSelect
                        options={OUTPUT_KIND_OPTIONS}
                        value={selectedKinds}
                        onChange={(ids) => setAutomationKinds(i, ids)}
                        placeholder="Chọn một hoặc nhiều đầu ra"
                        emptyText="Không có loại đầu ra."
                      />
                    </label>
                    <div className="tiny muted" style={{ marginTop: 5 }}>Không chọn mục nào = chỉ tạo Action. Có thể chọn đồng thời Giám sát, Báo cáo, Tự đánh giá, Audit, Chỉ số hoặc Đề án cải tiến.</div>
                  </div>

                  {task.automation_outputs.map((output) => {
                    const outputResources = resourcesForKind(output.kind);
                    const selectedLabel = outputResources.find((item) => item.id === output.ref_id)?.label;
                    return (
                      <div className="qa-fields" key={output.kind}>
                        <div className="span-2" style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                          <strong>{automationKindLabel(output.kind)}</strong>
                          <button type="button" className="button tertiary small" onClick={() => setAutomationKinds(i, selectedKinds.filter((kind) => kind !== output.kind))}>Bỏ đầu ra</button>
                        </div>

                        {output.kind === "INDICATOR" ? (
                          <>
                            <label className="span-2">Chỉ số hiện có *
                              <select value={output.ref_id} onChange={(e) => updateAutomationOutput(i, output.kind, { ref_id: e.target.value })}>
                                <option value="">-- Chọn chỉ số đã có --</option>
                                {indicatorAssignments.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                              </select>
                            </label>
                            {!indicatorAssignments.length ? <div className="qa-note">Chưa có chỉ số/phân công chỉ số phù hợp trong năm. QARICA không tự tạo master chỉ số.</div> : null}
                          </>
                        ) : output.kind === "MONITORING" ? (
                          <>
                            <label>Bảng kiểm đã phát hành *
                              <select value={output.ref_id} onChange={(e) => updateAutomationOutput(i, output.kind, { ref_id: e.target.value })}>
                                <option value="">-- Chọn bảng kiểm --</option>
                                {monitoringChecklists.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                              </select>
                            </label>
                            <label>Khoa/phòng được giám sát
                              <select value={output.target_department_id} onChange={(e) => updateAutomationOutput(i, output.kind, { target_department_id: e.target.value, target_area: e.target.value ? "" : output.target_area })}>
                                <option value="">-- Không cố định theo khoa/phòng --</option>
                                {deptOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                              </select>
                            </label>
                            <label className="span-2">Hoặc phạm vi/khu vực giám sát
                              <input value={output.target_area} onChange={(e) => updateAutomationOutput(i, output.kind, { target_area: e.target.value, target_department_id: e.target.value.trim() ? "" : output.target_department_id })} placeholder="Ví dụ: Toàn bộ Tòa A và Tòa B" />
                            </label>
                            {!output.target_department_id && !output.target_area.trim() ? <div className="qa-note">Cần chọn một trong hai: khoa/phòng cụ thể hoặc phạm vi/khu vực giám sát.</div> : null}
                            <label>Lịch thực hiện
                              <select value={output.monitoring_recurrence} onChange={(e) => updateAutomationOutput(i, output.kind, { monitoring_recurrence: e.target.value as AutomationOutput["monitoring_recurrence"] })}>
                                <option value="ONCE">Một lần</option>
                                <option value="DAILY">Hằng ngày</option>
                                <option value="WEEKLY">Hằng tuần · cùng thứ với đợt đầu</option>
                                <option value="MONTHLY">Hằng tháng · cùng ngày với đợt đầu</option>
                                <option value="QUARTERLY">Hằng quý · cùng ngày với đợt đầu</option>
                                <option value="YEARLY">Hằng năm · cùng ngày/tháng với đợt đầu</option>
                              </select>
                            </label>
                            {output.monitoring_recurrence !== "ONCE" ? <label>Kết thúc lịch
                              <input type="date" min={task.due_date || undefined} value={output.monitoring_recurrence_end_date} onChange={(e) => updateAutomationOutput(i, output.kind, { monitoring_recurrence_end_date: e.target.value })} />
                              <span className="tiny muted">{output.monitoring_recurrence_end_date ? "Dùng ngày kết thúc riêng của lịch này." : planEndDate ? `Để trống = kết thúc cùng kế hoạch (${planEndDate}).` : "Kế hoạch chưa có ngày kết thúc — cần nhập ngày kết thúc lịch."}</span>
                            </label> : null}
                            {output.monitoring_recurrence !== "ONCE" && !task.verification_requirement.trim() ? <div className="qa-note">Giám sát lặp lại cần nhập <strong>Yêu cầu minh chứng</strong> của nhiệm vụ để mỗi kỳ sinh ra có điều kiện hoàn thành rõ ràng.</div> : null}
                            {output.monitoring_recurrence !== "ONCE" ? <div className="qa-preview">Đợt đầu dùng hạn nhiệm vụ <strong>{task.due_date || "chưa chọn ngày"}</strong>. Các kỳ sau được đồng bộ qua Recurring Work Engine và tự hiển thị trên Lịch QLCL; hệ thống chống tạo trùng kỳ đầu.</div> : null}
                          </>
                        ) : output.kind === "ASSESSMENT" ? (
                          <>
                            <label className="span-2">Bộ tiêu chí đã phát hành * <small className="muted">({assessmentCriteriaVersions.length} bộ khả dụng)</small>
                              <select value={output.ref_id} onChange={(e) => updateAutomationOutput(i, output.kind, { ref_id: e.target.value })}>
                                <option value="">-- Chọn bộ tiêu chí / phiên bản --</option>
                                {assessmentCriteriaVersions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                              </select>
                            </label>
                            <label className="span-2">Loại đợt tự đánh giá
                              <input value={output.assessment_round_type} onChange={(e) => updateAutomationOutput(i, output.kind, { assessment_round_type: e.target.value })} placeholder="Ví dụ: Tự đánh giá định kỳ" />
                            </label>
                            {!assessmentCriteriaVersions.length ? <div className="qa-note">Chưa có bộ tiêu chí PUBLISHED. Cần phát hành bộ tiêu chí trước.</div> : null}
                          </>
                        ) : output.kind === "REPORT" ? (
                          <>
                            <label>Nơi nhận *
                              <input value={output.report_recipient} onChange={(e) => updateAutomationOutput(i, output.kind, { report_recipient: e.target.value })} placeholder="Ví dụ: Sở Y tế TP.HCM" />
                            </label>
                            <label>Phương thức gửi *
                              <input value={output.report_method} onChange={(e) => updateAutomationOutput(i, output.kind, { report_method: e.target.value })} placeholder="Phần mềm / Email / Văn bản..." />
                            </label>
                            <label>Kỳ báo cáo *
                              <input value={output.report_period} onChange={(e) => updateAutomationOutput(i, output.kind, { report_period: e.target.value })} placeholder="Ví dụ: Tháng 9/2026" />
                            </label>
                            <label>Chu kỳ
                              <select value={output.report_recurrence_rule} onChange={(e) => updateAutomationOutput(i, output.kind, { report_recurrence_rule: e.target.value })}>
                                <option value="">Một lần</option>
                                <option value="MONTHLY">Hàng tháng</option>
                                <option value="QUARTERLY">Hàng quý</option>
                                <option value="SEMIANNUAL">6 tháng</option>
                                <option value="ANNUAL">Hàng năm</option>
                              </select>
                            </label>
                            {output.report_recurrence_rule ? <label className="span-2">Kết thúc chu kỳ
                              <input type="date" value={output.report_recurrence_end_date} onChange={(e) => updateAutomationOutput(i, output.kind, { report_recurrence_end_date: e.target.value })} />
                            </label> : null}
                          </>
                        ) : output.kind === "AUDIT" ? (
                          <label className="span-2">Loại Audit / Tracer *
                            <input value={output.audit_type} onChange={(e) => updateAutomationOutput(i, output.kind, { audit_type: e.target.value })} placeholder="Ví dụ: Audit nội bộ / Tracer / Kiểm tra chéo" />
                          </label>
                        ) : (
                          <div className="qa-note">QARICA sẽ tạo hồ sơ Đề án cải tiến ở trạng thái Nháp, kế thừa người phụ trách và thời gian. Baseline, SMART và PDSA phải được hoàn thiện trong workflow đề án.</div>
                        )}

                        <div className="qa-preview">
                          Khi phê duyệt: <strong>Action</strong> + <strong>{automationKindLabel(output.kind)}</strong>.
                          {selectedLabel ? <> Dữ liệu nguồn: <strong>{selectedLabel}</strong>.</> : null}
                        </div>
                      </div>
                    );
                  })}
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
        </div>

        <button type="button" className="button tertiary small" style={{ marginTop: 10 }} onClick={() => addTask()}>+ Thêm nhiệm vụ cấp 1</button>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className="button primary" disabled={busy} onClick={save}><Icon name="save" size={16} /> {busy ? "Đang lưu..." : "Lưu nội dung kế hoạch"}</button>
      </div>
      {message ? <div className={`alert ${message.tone}`}>{message.text}</div> : null}
    </section>
  );
}
