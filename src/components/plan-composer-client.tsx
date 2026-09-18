"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import {
  automationKindLabel,
  suggestPlanAutomationKind,
  suggestPlanAutomationResource,
  type PlanAutomationKind,
  type PlanAutomationResource,
} from "@/lib/plan-automation";

type Department = { id: string; name: string; short_name: string | null };
type Profile = { user_id: string; full_name: string | null; email: string | null };
type CriterionItem = { id: string; code: string; title: string };
type AutomationOption = { id: string; label: string };

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
  title: "",
  lead_department_id: "",
  assignee_user_id: "",
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
    title: raw?.title || "",
    lead_department_id: raw?.lead_department_id || "",
    assignee_user_id: raw?.assignee_user_id || "",
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
  criteriaItems: CriterionItem[];
  indicatorAssignments: AutomationOption[];
  monitoringChecklists: AutomationOption[];
  assessmentCriteriaVersions: AutomationOption[];
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
  const [specifics, setSpecifics] = useState<string[]>(
    Array.isArray(initialSpecificObjectives) && initialSpecificObjectives.length
      ? (initialSpecificObjectives as string[])
      : [""],
  );
  const [requirements, setRequirements] = useState(initialRequirements || "");
  const [tasks, setTasks] = useState<DraftTask[]>(
    Array.isArray(initialDraftActions) && initialDraftActions.length
      ? (initialDraftActions as any[]).map(toTask)
      : [{ ...EMPTY_TASK, lead_department_id: defaultDepartmentId || "" }],
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const deptOptions = useMemo(() => departments.map((d) => ({ id: d.id, label: d.short_name || d.name })), [departments]);

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
    setBusy(true);
    setMessage(null);
    try {
      const cleanedSpecifics = specifics.map((s) => s.trim()).filter(Boolean);
      const cleanedTasks = tasks.filter((task) => task.title.trim());
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

      <label>Mục tiêu chung *<textarea rows={3} value={generalObjective} onChange={(e) => setGeneralObjective(e.target.value)} /></label>

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

      <div>
        <span className="tiny muted">Nhiệm vụ kế hoạch * · Action được tạo khi kế hoạch phê duyệt; đầu ra liên quan được tạo tự động nếu đã đủ dữ liệu.</span>

        {tasks.map((task, i) => {
          const suggestion = suggestPlanAutomationKind({ title: task.title, description: task.description, expectedResult: task.expected_result });
          const resources = suggestion === "INDICATOR" ? indicatorAssignments : suggestion === "MONITORING" ? monitoringChecklists : suggestion === "ASSESSMENT" ? assessmentCriteriaVersions : [];
          const candidate = ["INDICATOR", "MONITORING", "ASSESSMENT"].includes(suggestion) ? suggestPlanAutomationResource(taskText(task), resources) : null;
          const selectedResources = task.automation_kind === "INDICATOR" ? indicatorAssignments : task.automation_kind === "MONITORING" ? monitoringChecklists : task.automation_kind === "ASSESSMENT" ? assessmentCriteriaVersions : [];
          const selectedLabel = selectedResources.find((item) => item.id === task.automation_ref_id)?.label;

          return (
            <div key={i} className="panel" style={{ padding: 12, marginTop: 10, background: "#fbfdfd" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
                <strong>Nhiệm vụ {i + 1}</strong>
                <button type="button" className="button secondary small" onClick={() => removeTask(i)}>Xoá nhiệm vụ</button>
              </div>

              <div className="form-grid two">
                <label className="span-2">Tiêu đề *<input value={task.title} onChange={(e) => updateTask(i, { title: e.target.value })} /></label>
                <label>Khoa/phòng chủ trì *<select value={task.lead_department_id} onChange={(e) => updateTask(i, { lead_department_id: e.target.value })}><option value="">-- Chọn --</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.short_name || d.name}</option>)}</select></label>
                <label>Người phụ trách *<select value={task.assignee_user_id} onChange={(e) => updateTask(i, { assignee_user_id: e.target.value })}><option value="">-- Chọn --</option>{profiles.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email}</option>)}</select></label>
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
                          <label className="span-2">Bộ tiêu chí đã phát hành *
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
