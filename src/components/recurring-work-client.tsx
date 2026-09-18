"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Department = { id: string; name: string; short_name?: string | null };
type Profile = { user_id: string; full_name?: string | null; email?: string | null; primary_department_id?: string | null };
type TemplateRow = {
  id: string;
  title: string;
  description?: string | null;
  recurrence_rule: string;
  start_date?: string | null;
  end_date?: string | null;
  due_offset_days: number;
  lead_department_id?: string | null;
  assignee_user_id?: string | null;
  expected_result?: string | null;
  evidence_requirement?: string | null;
  priority: string;
  is_active: boolean;
  department_name?: string | null;
  assignee_name?: string | null;
  generated_count: number;
  pending_count: number;
  latest_planned_date?: string | null;
  source_code?: string | null;
  source_label?: string | null;
  source_criteria?: string[];
  automation_kind?: "ACTION" | "MONITORING" | "REPORT";
  automation_ref_id?: string | null;
  automation_target_department_id?: string | null;
  automation_target_area?: string | null;
  automation_report_recipient?: string | null;
  automation_report_method?: string | null;
  automation_report_type?: string | null;
};

type BlueprintRow = {
  code: string;
  title: string;
  sourceLabel: string;
  cadence: Cadence;
  criteria: string[];
  departmentHint: string;
  ownerHint: string;
  expectedResult: string;
  evidenceRequirement: string;
  description: string;
  scheduleHint: string;
  scheduleNeedsChoice: boolean;
  weekday?: string;
  monthDay?: number;
  weekOfMonth?: number;
  startMonth?: number;
  priority?: string;
  automationKind?: "ACTION" | "MONITORING" | "REPORT";
  automationChecklistCode?: string;
  automationTargetArea?: string;
  automationReportRecipient?: string;
  automationReportMethod?: string;
  automationReportType?: string;
  endDate?: string;
  department_id?: string | null;
  department_name?: string | null;
  assignee_user_id?: string | null;
  assignee_name?: string | null;
  checklist_id?: string | null;
  checklist_label?: string | null;
  already_configured: boolean;
};

type ChecklistOption = { id: string; code: string; label: string };

type Cadence = "DAILY" | "WEEKLY" | "MONTHLY_DATE" | "MONTHLY_WEEK" | "QUARTERLY" | "YEARLY";

type FormState = {
  title: string;
  description: string;
  cadence: Cadence;
  weekday: string;
  monthDay: string;
  weekOfMonth: string;
  start_date: string;
  end_date: string;
  due_offset_days: string;
  lead_department_id: string;
  assignee_user_id: string;
  expected_result: string;
  evidence_requirement: string;
  priority: string;
  is_active: boolean;
  source_code: string;
  source_label: string;
  source_criteria: string[];
  automation_kind: "ACTION" | "MONITORING" | "REPORT";
  automation_ref_id: string;
  automation_target_department_id: string;
  automation_target_area: string;
  automation_report_recipient: string;
  automation_report_method: string;
  automation_report_type: string;
  schedule_note: string;
};

const WEEKDAYS = [
  ["MO", "Thứ Hai"], ["TU", "Thứ Ba"], ["WE", "Thứ Tư"], ["TH", "Thứ Năm"],
  ["FR", "Thứ Sáu"], ["SA", "Thứ Bảy"], ["SU", "Chủ nhật"],
];

function todayHcm() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

function defaultForm(): FormState {
  const today = todayHcm();
  return {
    title: "", description: "", cadence: "MONTHLY_DATE", weekday: "MO", monthDay: String(Number(today.slice(-2))), weekOfMonth: "1",
    start_date: today, end_date: "", due_offset_days: "0", lead_department_id: "", assignee_user_id: "",
    expected_result: "", evidence_requirement: "", priority: "NORMAL", is_active: true,
    source_code: "", source_label: "", source_criteria: [],
    automation_kind: "ACTION", automation_ref_id: "", automation_target_department_id: "", automation_target_area: "",
    automation_report_recipient: "", automation_report_method: "", automation_report_type: "",
    schedule_note: "",
  };
}

function cadenceLabel(rule: string) {
  if (rule.startsWith("FREQ=DAILY")) return "Hằng ngày";
  if (rule.startsWith("FREQ=WEEKLY")) return "Hằng tuần";
  if (rule.startsWith("FREQ=YEARLY")) return "Hằng năm";
  if (rule.includes("FREQ=MONTHLY;INTERVAL=3")) return "Hằng quý";
  if (rule.includes("FREQ=MONTHLY") && rule.includes("BYSETPOS=")) return "Hằng tháng theo tuần";
  if (rule.includes("FREQ=MONTHLY")) return "Hằng tháng";
  return rule;
}

function parseRule(rule: string, startDate?: string | null): Pick<FormState, "cadence" | "weekday" | "monthDay" | "weekOfMonth"> {
  const day = rule.match(/BYDAY=([A-Z]{2})/)?.[1] || "MO";
  const monthDay = rule.match(/BYMONTHDAY=(\d{1,2})/)?.[1] || String(Number(startDate?.slice(-2) || "1"));
  const week = rule.match(/BYSETPOS=(\d)/)?.[1] || "1";
  if (rule.startsWith("FREQ=DAILY")) return { cadence: "DAILY", weekday: day, monthDay, weekOfMonth: week };
  if (rule.startsWith("FREQ=WEEKLY")) return { cadence: "WEEKLY", weekday: day, monthDay, weekOfMonth: week };
  if (rule.startsWith("FREQ=YEARLY")) return { cadence: "YEARLY", weekday: day, monthDay, weekOfMonth: week };
  if (rule.includes("FREQ=MONTHLY;INTERVAL=3")) return { cadence: "QUARTERLY", weekday: day, monthDay, weekOfMonth: week };
  if (rule.includes("BYSETPOS=")) return { cadence: "MONTHLY_WEEK", weekday: day, monthDay, weekOfMonth: week };
  return { cadence: "MONTHLY_DATE", weekday: day, monthDay, weekOfMonth: week };
}

function buildRule(form: FormState) {
  const startMonth = Number(form.start_date.slice(5, 7) || "1");
  const startDay = Number(form.start_date.slice(8, 10) || "1");
  const monthDay = Math.max(1, Math.min(31, Number(form.monthDay || startDay || 1)));
  if (form.cadence === "DAILY") return "FREQ=DAILY;INTERVAL=1";
  if (form.cadence === "WEEKLY") return `FREQ=WEEKLY;INTERVAL=1;BYDAY=${form.weekday}`;
  if (form.cadence === "MONTHLY_WEEK") return `FREQ=MONTHLY;INTERVAL=1;BYDAY=${form.weekday};BYSETPOS=${form.weekOfMonth}`;
  if (form.cadence === "QUARTERLY") return `FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=${monthDay}`;
  if (form.cadence === "YEARLY") return `FREQ=YEARLY;INTERVAL=1;BYMONTH=${startMonth};BYMONTHDAY=${startDay}`;
  return `FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=${monthDay}`;
}

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}

export function RecurringWorkClient({
  templates,
  departments,
  profiles,
  canManage,
  blueprints,
  checklists,
}: {
  templates: TemplateRow[];
  departments: Department[];
  profiles: Profile[];
  canManage: boolean;
  blueprints: BlueprintRow[];
  checklists: ChecklistOption[];
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  const filteredProfiles = useMemo(() => {
    if (!form.lead_department_id) return profiles;
    const sameDepartment = profiles.filter((p) => p.primary_department_id === form.lead_department_id);
    return sameDepartment.length ? sameDepartment : profiles;
  }, [profiles, form.lead_department_id]);

  function openCreate() {
    setEditing(null);
    setForm(defaultForm());
    setMessage(null);
    setModalOpen(true);
  }

  function openBlueprint(row: BlueprintRow) {
    const today = todayHcm();
    const year = Number(today.slice(0, 4));
    const month = row.startMonth || Number(today.slice(5, 7));
    const day = Math.max(1, Math.min(28, row.monthDay || Number(today.slice(8, 10))));
    const startDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setEditing(null);
    setForm({
      ...defaultForm(),
      title: row.title,
      description: row.description,
      cadence: row.cadence,
      weekday: row.weekday || "MO",
      monthDay: String(row.monthDay || day),
      weekOfMonth: String(row.weekOfMonth || 1),
      start_date: startDate < today ? today : startDate,
      end_date: row.endDate || "",
      lead_department_id: row.department_id || "",
      assignee_user_id: row.assignee_user_id || "",
      expected_result: row.expectedResult,
      evidence_requirement: row.evidenceRequirement,
      priority: row.priority || "NORMAL",
      source_code: row.code,
      source_label: row.sourceLabel,
      source_criteria: row.criteria,
      automation_kind: row.automationKind || "ACTION",
      automation_ref_id: row.checklist_id || "",
      automation_target_department_id: "",
      automation_target_area: row.automationTargetArea || "",
      automation_report_recipient: row.automationReportRecipient || "",
      automation_report_method: row.automationReportMethod || "",
      automation_report_type: row.automationReportType || "",
      schedule_note: row.scheduleHint,
    });
    setMessage(row.department_id && row.assignee_user_id
      ? { tone: "info", text: row.scheduleNeedsChoice ? "QARICA đã điền dữ liệu nguồn. Anh/chị chỉ cần xác nhận lịch vận hành trước khi lưu." : "QARICA đã điền đủ dữ liệu nguồn; kiểm tra và xác nhận để kích hoạt." }
      : { tone: "info", text: "QARICA đã kế thừa dữ liệu nguồn. Chỉ còn chọn phần chưa xác định rõ trước khi lưu." });
    setModalOpen(true);
  }

  function openEdit(row: TemplateRow) {
    const parsed = parseRule(row.recurrence_rule, row.start_date);
    setEditing(row);
    setForm({
      title: row.title,
      description: row.description || "",
      cadence: parsed.cadence,
      weekday: parsed.weekday,
      monthDay: parsed.monthDay,
      weekOfMonth: parsed.weekOfMonth,
      start_date: row.start_date || todayHcm(),
      end_date: row.end_date || "",
      due_offset_days: String(row.due_offset_days ?? 0),
      lead_department_id: row.lead_department_id || "",
      assignee_user_id: row.assignee_user_id || "",
      expected_result: row.expected_result || "",
      evidence_requirement: row.evidence_requirement || "",
      priority: row.priority || "NORMAL",
      is_active: row.is_active,
      source_code: row.source_code || "",
      source_label: row.source_label || "",
      source_criteria: Array.isArray(row.source_criteria) ? row.source_criteria : [],
      automation_kind: row.automation_kind || "ACTION",
      automation_ref_id: row.automation_ref_id || "",
      automation_target_department_id: row.automation_target_department_id || "",
      automation_target_area: row.automation_target_area || "",
      automation_report_recipient: row.automation_report_recipient || "",
      automation_report_method: row.automation_report_method || "",
      automation_report_type: row.automation_report_type || "",
      schedule_note: "",
    });
    setMessage(null);
    setModalOpen(true);
  }

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    if (!form.title.trim() || !form.start_date || !form.lead_department_id || !form.assignee_user_id || !form.expected_result.trim() || !form.evidence_requirement.trim()) {
      setMessage({ tone: "error", text: "Vui lòng nhập đủ tên công việc, ngày bắt đầu, đơn vị, người phụ trách, kết quả mong đợi và minh chứng yêu cầu." });
      return;
    }
    if (form.end_date && form.end_date < form.start_date) {
      setMessage({ tone: "error", text: "Ngày kết thúc không được trước ngày bắt đầu." });
      return;
    }
    if (form.automation_kind === "MONITORING" && !form.automation_ref_id) {
      setMessage({ tone: "error", text: "Để tự tạo đợt giám sát, cần chọn bảng kiểm đã phát hành." });
      return;
    }
    if (form.automation_kind === "MONITORING" && !form.automation_target_department_id && !form.automation_target_area.trim()) {
      setMessage({ tone: "error", text: "Để tự tạo đợt giám sát, cần khoa/phòng hoặc phạm vi giám sát." });
      return;
    }
    if (form.automation_kind === "REPORT" && !form.automation_report_recipient.trim()) {
      setMessage({ tone: "error", text: "Để tự tạo báo cáo từng kỳ, cần xác định nơi nhận." });
      return;
    }
    if (form.automation_kind === "REPORT" && !form.automation_report_method.trim()) {
      setMessage({ tone: "error", text: "Để tự tạo báo cáo từng kỳ, cần xác nhận phương thức gửi." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        recurrence_rule: buildRule(form),
        start_date: form.start_date,
        end_date: form.end_date || null,
        due_offset_days: Number(form.due_offset_days || 0),
        lead_department_id: form.lead_department_id,
        assignee_user_id: form.assignee_user_id,
        expected_result: form.expected_result.trim(),
        evidence_requirement: form.evidence_requirement.trim(),
        priority: form.priority,
        is_active: form.is_active,
        source_code: form.source_code || null,
        source_label: form.source_label || null,
        source_criteria: form.source_criteria,
        automation_kind: form.automation_kind,
        automation_ref_id: form.automation_ref_id || null,
        automation_target_department_id: form.automation_target_department_id || null,
        automation_target_area: form.automation_target_area.trim() || null,
        automation_report_recipient: form.automation_report_recipient.trim() || null,
        automation_report_method: form.automation_report_method.trim() || null,
        automation_report_type: form.automation_report_type.trim() || null,
      };
      const response = await fetch(editing ? `/api/calendar/recurring/${editing.id}` : "/api/calendar/recurring", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Không lưu được mẫu định kỳ.");
      setModalOpen(false);
      const sync = json.sync;
      const syncText = sync
        ? ` Lịch đã đồng bộ 90 ngày tới: ${Number(sync.createdActions || 0)} Action mới${Number(sync.createdMonitoringRounds || 0) ? `, ${sync.createdMonitoringRounds} đợt giám sát` : ""}${Number(sync.createdReports || 0) ? `, ${sync.createdReports} báo cáo` : ""}.`
        : "";
      if (json.sync_warning) {
        setMessage({ tone: "info", text: `${editing ? "Đã cập nhật" : "Đã tạo"} cấu hình. ${json.sync_warning} Có thể dùng nút “Đồng bộ lại 90 ngày” để thử lại.` });
      } else {
        setMessage({ tone: "success", text: `${editing ? "Đã cập nhật" : "Đã tạo"} công việc định kỳ.${syncText}` });
      }
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Không lưu được mẫu định kỳ." });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(row: TemplateRow) {
    if (!canManage) return;
    const nextActive = !row.is_active;
    if (!nextActive && !window.confirm("Ngưng mẫu này? Các Action đã sinh vẫn được giữ nguyên để bảo toàn lịch sử.")) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/calendar/recurring/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextActive }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Không cập nhật được trạng thái.");
      if (nextActive && json.sync_warning) {
        setMessage({ tone: "info", text: `Đã kích hoạt mẫu nhưng đồng bộ lịch chưa hoàn tất: ${json.sync_warning}` });
      } else if (nextActive) {
        const sync = json.sync;
        setMessage({ tone: "success", text: `Đã kích hoạt và đồng bộ lịch: ${Number(sync?.createdActions || 0)} Action mới${Number(sync?.createdMonitoringRounds || 0) ? `, ${sync.createdMonitoringRounds} đợt giám sát` : ""}${Number(sync?.createdReports || 0) ? `, ${sync.createdReports} báo cáo` : ""}.` });
      } else {
        setMessage({ tone: "success", text: "Đã ngưng mẫu; lịch sử cũ được giữ nguyên." });
      }
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Không cập nhật được trạng thái." });
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    if (!canManage) return;
    setBusy(true);
    setMessage({ tone: "info", text: "Đang đồng bộ các công việc định kỳ trong 90 ngày tới…" });
    try {
      const response = await fetch("/api/calendar/recurring/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horizon_days: 90 }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Không đồng bộ được công việc định kỳ.");
      const skipped = Number(json.skipped_templates || 0);
      const errors = Number(json.errors || 0);
      setMessage({
        tone: errors ? "error" : "success",
        text: `Đồng bộ xong: tạo ${json.created_actions || 0} Action mới${Number(json.created_monitoring_rounds || 0) ? ` + ${json.created_monitoring_rounds} đợt giám sát` : ""}${Number(json.created_reports || 0) ? ` + ${json.created_reports} báo cáo` : ""}, ${json.existing_runs || 0} kỳ đã tồn tại${skipped ? `, ${skipped} mẫu chưa đủ điều kiện` : ""}${errors ? `, ${errors} lỗi cần kiểm tra` : ""}.`,
      });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Không đồng bộ được công việc định kỳ." });
    } finally {
      setBusy(false);
    }
  }

  return <div className="recurring-work-client">
    <style>{`
      .recurring-toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:13px 15px;border-bottom:1px solid #eef2f3;flex-wrap:wrap}
      .recurring-toolbar-copy{display:grid;gap:3px}.recurring-toolbar-copy strong{font-size:14px;color:#243247}.recurring-toolbar-copy span{font-size:10.5px;color:#64748b}.recurring-toolbar-actions{display:flex;gap:8px;flex-wrap:wrap}
      .recurring-title{display:grid;gap:3px}.recurring-title strong{font-size:13px}.recurring-title small{font-size:10px;color:#64748b;line-height:1.35}.recurring-muted{color:#64748b;font-size:11px}.recurring-run-stat{display:grid;gap:2px}.recurring-run-stat strong{font-size:12px}.recurring-run-stat span{font-size:9.5px;color:#64748b}
      .recurring-status{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:800;padding:4px 7px;border-radius:999px}.recurring-status.active{background:#ecfdf5;color:#166534}.recurring-status.inactive{background:#f1f5f9;color:#64748b}
      .recurring-actions{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}.recurring-actions .button{min-height:34px}
      .recurring-help{padding:12px 14px;border-top:1px solid #eef2f3;background:#f8fafc;color:#64748b;font-size:10.5px;line-height:1.5}.recurring-help strong{color:#334155}.blueprint-panel{margin-bottom:14px;overflow:hidden}.blueprint-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:15px 16px;border-bottom:1px solid #e6edf3;background:linear-gradient(135deg,#f8fbff,#eef5fb)}.blueprint-head h2{margin:0;color:#173b64;font-size:15px}.blueprint-head p{margin:4px 0 0;color:#64748b;font-size:10.5px;line-height:1.45}.blueprint-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;padding:12px}.blueprint-card{border:1px solid #dde7ef;border-radius:13px;padding:11px;background:#fff;display:grid;gap:8px}.blueprint-card.done{background:#f7faf9;border-color:#cde4d8}.blueprint-code{display:inline-flex;width:max-content;padding:3px 6px;border-radius:999px;background:#eaf2fb;color:#315f91;font-size:9px;font-weight:900;letter-spacing:.04em}.blueprint-card.done .blueprint-code{background:#e7f4ed;color:#26704c}.blueprint-title{font-size:11.5px;font-weight:850;color:#25384c;line-height:1.35}.blueprint-meta{font-size:9.5px;color:#6b7d8e;line-height:1.45}.blueprint-note{font-size:9.5px;border-radius:9px;padding:7px 8px;background:#fff8ea;color:#7a571e}.blueprint-actions{display:flex;justify-content:space-between;align-items:center;gap:8px}.blueprint-done{font-size:9.5px;color:#2b6d4f;font-weight:850}
      .recurring-modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.recurring-modal-grid .span-2{grid-column:1/-1}.recurring-field{display:grid;gap:5px}.recurring-field label{font-size:10px;font-weight:850;color:#475569}.recurring-field small{font-size:9px;color:#64748b;line-height:1.35}.recurring-field input,.recurring-field select,.recurring-field textarea{width:100%}.recurring-field textarea{min-height:80px;resize:vertical}.recurring-inline{display:grid;grid-template-columns:1fr 1fr;gap:8px}.recurring-switch{display:flex;align-items:center;gap:8px;padding:10px 11px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;font-size:11px;font-weight:750}.recurring-switch input{width:auto}
      @media(max-width:1050px){.blueprint-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.blueprint-grid{grid-template-columns:1fr}.recurring-toolbar{align-items:stretch}.recurring-toolbar-actions{display:grid;grid-template-columns:1fr;width:100%}.recurring-toolbar-actions .button{width:100%;justify-content:center;min-height:42px}.recurring-work-client .table-wrap{overflow:visible!important;padding:0 10px 10px}.recurring-work-client table,.recurring-work-client tbody{display:block;width:100%}.recurring-work-client thead{display:none}.recurring-work-client tbody tr{display:block;margin:10px 0;border:1px solid #e2e8f0;border-left:4px solid #2563eb;border-radius:14px;background:#fff;overflow:hidden}.recurring-work-client tbody tr:has(.recurring-status.inactive){border-left-color:#94a3b8}.recurring-work-client tbody td{display:grid;grid-template-columns:90px minmax(0,1fr);gap:8px;padding:8px 11px;border:0;border-bottom:1px solid #eef2f3;white-space:normal}.recurring-work-client tbody td:last-child{border-bottom:0}.recurring-work-client tbody td::before{font-size:9px;font-weight:850;color:#7b8794;text-transform:uppercase;letter-spacing:.04em}.recurring-work-client tbody td:nth-child(1)::before{content:"Công việc"}.recurring-work-client tbody td:nth-child(2)::before{content:"Chu kỳ"}.recurring-work-client tbody td:nth-child(3)::before{content:"Phụ trách"}.recurring-work-client tbody td:nth-child(4)::before{content:"Run"}.recurring-work-client tbody td:nth-child(5)::before{content:"Trạng thái"}.recurring-work-client tbody td:nth-child(6)::before{content:"Thao tác"}.recurring-actions{justify-content:flex-start}.recurring-modal-grid{grid-template-columns:1fr}.recurring-modal-grid .span-2{grid-column:auto}.recurring-inline{grid-template-columns:1fr}}
    `}</style>

    {message ? <div className={`alert ${message.tone === "error" ? "error" : message.tone === "success" ? "success" : "info"}`} style={{ margin: "0 0 10px" }}>{message.text}</div> : null}

    <section className="panel blueprint-panel">
      <div className="blueprint-head"><div><h2>QARICA gợi ý từ Kế hoạch/Sổ tay tác nghiệp</h2><p>Không nhập lại từ đầu: chọn một đầu việc nguồn, QARICA điền sẵn nội dung, đơn vị, người phụ trách (khi xác định được), kết quả và minh chứng. Phần nguồn chưa quy định ngày cụ thể sẽ yêu cầu xác nhận đúng 1 lần.</p></div><span className="recurring-status active">{blueprints.filter((x) => x.already_configured).length}/{blueprints.length} đã cấu hình</span></div>
      <div className="blueprint-grid">
        {blueprints.map((row) => <article key={row.code} className={`blueprint-card ${row.already_configured ? "done" : ""}`}>
          <span className="blueprint-code">{row.code}</span>
          <div className="blueprint-title">{row.title}</div>
          <div className="blueprint-meta">{row.scheduleHint}<br/>{row.department_name || row.departmentHint}{row.assignee_name ? ` · ${row.assignee_name}` : " · cần xác nhận người phụ trách"}{row.criteria.length ? ` · TC: ${row.criteria.join(", ")}` : ""}</div>
          {row.automationKind === "MONITORING" ? <div className="blueprint-note">Tự động tạo cả <strong>Action + Đợt giám sát</strong>{row.checklist_label ? ` bằng ${row.checklist_label}` : "; chưa tìm thấy bảng kiểm nguồn"}.</div> : row.automationKind === "REPORT" ? <div className="blueprint-note">Tự động tạo <strong>Action + hồ sơ Báo cáo riêng cho từng kỳ</strong>. Trường nguồn chưa quy định sẽ được hỏi đúng 1 lần.</div> : row.scheduleNeedsChoice ? <div className="blueprint-note">Nguồn chưa ấn định ngày cụ thể — chỉ cần xác nhận lịch một lần.</div> : null}
          <div className="blueprint-actions">{row.already_configured ? <span className="blueprint-done">✓ Đã kế thừa vào hệ thống</span> : <span className="recurring-muted">{row.sourceLabel}</span>}{canManage && !row.already_configured ? <button className="button primary small" disabled={busy} onClick={() => openBlueprint(row)}>Thiết lập 1 click</button> : null}</div>
        </article>)}
      </div>
    </section>

    <section className="panel">
      <div className="recurring-toolbar">
        <div className="recurring-toolbar-copy"><strong>Recurring Work Engine</strong><span>Mỗi mẫu chỉ định nghĩa một lần; khi lưu/kích hoạt, hệ thống tự đồng bộ 90 ngày tới vào Lịch chất lượng và chống trùng theo từng kỳ.</span></div>
        {canManage ? <div className="recurring-toolbar-actions"><button className="button secondary" disabled={busy} onClick={sync}>Đồng bộ lại 90 ngày</button><button className="button primary" disabled={busy} onClick={openCreate}>+ Tạo công việc định kỳ</button></div> : null}
      </div>
      <div className="table-wrap"><table><thead><tr><th>Công việc</th><th>Chu kỳ</th><th>Phụ trách</th><th>Run</th><th>Trạng thái</th><th></th></tr></thead><tbody>
        {templates.map((row) => <tr key={row.id}>
          <td><div className="recurring-title"><strong>{row.title}</strong><small>{row.expected_result || "Chưa mô tả kết quả mong đợi"}</small></div></td>
          <td><strong>{cadenceLabel(row.recurrence_rule)}</strong><div className="recurring-muted">{fmtDate(row.start_date)}{row.end_date ? ` → ${fmtDate(row.end_date)}` : " → không giới hạn"} · hạn +{row.due_offset_days || 0} ngày</div></td>
          <td><strong>{row.department_name || "—"}</strong><div className="recurring-muted">{row.assignee_name || "Chưa gán người"}</div></td>
          <td><div className="recurring-run-stat"><strong>{row.generated_count} Action đã sinh</strong><span>{row.pending_count ? `${row.pending_count} run chờ xử lý · ` : ""}{row.latest_planned_date ? `gần nhất ${fmtDate(row.latest_planned_date)}` : "chưa có run"}</span></div></td>
          <td><span className={`recurring-status ${row.is_active ? "active" : "inactive"}`}>{row.is_active ? "Đang bật" : "Đã ngưng"}</span></td>
          <td><div className="recurring-actions">{canManage ? <><button className="button tertiary small" disabled={busy} onClick={() => openEdit(row)}>Sửa</button><button className="button secondary small" disabled={busy} onClick={() => toggle(row)}>{row.is_active ? "Ngưng" : "Kích hoạt"}</button></> : <span className="recurring-muted">Chỉ xem</span>}</div></td>
        </tr>)}
        {!templates.length ? <tr><td colSpan={6}><div className="empty-state"><strong>Chưa có công việc định kỳ.</strong><p>Tạo mẫu đầu tiên rồi dùng “Đồng bộ 90 ngày tới” để sinh Action thật.</p></div></td></tr> : null}
      </tbody></table></div>
      <div className="recurring-help"><strong>Nguyên tắc:</strong> Ngưng mẫu không xóa các Action đã sinh. Đồng bộ chỉ tạo kỳ từ hôm nay trở đi; không tự dựng lịch sử quá khứ. Nếu một kỳ đã tồn tại, hệ thống bỏ qua để tránh tạo trùng.</div>
    </section>

    {modalOpen ? <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setModalOpen(false); }}>
      <div className="modal-card" style={{ maxWidth: 820 }}>
        <div className="modal-head"><div><h2>{editing ? "Cập nhật công việc định kỳ" : form.source_code ? `Thiết lập ${form.source_code}` : "Tạo công việc định kỳ"}</h2><p>{form.source_code ? "Dữ liệu đã được kế thừa từ nguồn; chỉ xác nhận phần còn thiếu hoặc lịch vận hành." : "Mỗi kỳ sẽ sinh một Action có người chịu trách nhiệm và yêu cầu minh chứng rõ ràng."}</p></div><button className="icon-button" disabled={busy} onClick={() => setModalOpen(false)}>×</button></div>
        <div className="modal-body">
          <div className="recurring-modal-grid">
            {form.source_code ? <div className="span-2 scope-note" style={{margin:0}}><strong>{form.source_code} · {form.source_label}</strong>{form.source_criteria.length ? <> · Tiêu chí: {form.source_criteria.join(", ")}</> : null}{form.schedule_note ? <div style={{marginTop:4}}>{form.schedule_note}</div> : null}</div> : null}
            <div className="recurring-field span-2"><label>Tên công việc *</label><input value={form.title} onChange={(e) => patch("title", e.target.value)} placeholder="Ví dụ: Báo cáo sự cố cấp cứu ngoại viện (115)" /></div>
            <div className="recurring-field span-2"><label>Mô tả / hướng dẫn</label><textarea value={form.description} onChange={(e) => patch("description", e.target.value)} placeholder="Nội dung thực hiện, phạm vi, cách phối hợp…" /></div>
            <div className="recurring-field"><label>Chu kỳ *</label><select value={form.cadence} onChange={(e) => patch("cadence", e.target.value as Cadence)}><option value="DAILY">Hằng ngày</option><option value="WEEKLY">Hằng tuần</option><option value="MONTHLY_DATE">Hằng tháng theo ngày</option><option value="MONTHLY_WEEK">Hằng tháng theo tuần</option><option value="QUARTERLY">Hằng quý</option><option value="YEARLY">Hằng năm</option></select></div>
            {form.cadence === "WEEKLY" || form.cadence === "MONTHLY_WEEK" ? <div className="recurring-field"><label>Thứ thực hiện</label><select value={form.weekday} onChange={(e) => patch("weekday", e.target.value)}>{WEEKDAYS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div> : null}
            {form.cadence === "MONTHLY_WEEK" ? <div className="recurring-field"><label>Tuần trong tháng</label><select value={form.weekOfMonth} onChange={(e) => patch("weekOfMonth", e.target.value)}><option value="1">Tuần 1</option><option value="2">Tuần 2</option><option value="3">Tuần 3</option><option value="4">Tuần 4</option></select><small>Phù hợp lịch giám sát luân phiên tuần 1–4.</small></div> : null}
            {form.cadence === "MONTHLY_DATE" || form.cadence === "QUARTERLY" ? <div className="recurring-field"><label>Ngày trong tháng</label><input type="number" min="1" max="31" value={form.monthDay} onChange={(e) => patch("monthDay", e.target.value)} /><small>Nếu tháng không có ngày này, engine dùng ngày cuối tháng.</small></div> : null}
            <div className="recurring-field"><label>Ngày bắt đầu hiệu lực *</label><input type="date" value={form.start_date} onChange={(e) => patch("start_date", e.target.value)} /></div>
            <div className="recurring-field"><label>Ngày kết thúc</label><input type="date" value={form.end_date} onChange={(e) => patch("end_date", e.target.value)} /></div>
            <div className="recurring-field"><label>Hạn sau ngày kế hoạch</label><input type="number" min="0" max="365" value={form.due_offset_days} onChange={(e) => patch("due_offset_days", e.target.value)} /><small>0 = đến hạn đúng ngày được sinh trên lịch.</small></div>
            <div className="recurring-field"><label>Mức ưu tiên</label><select value={form.priority} onChange={(e) => patch("priority", e.target.value)}><option value="LOW">Thấp</option><option value="NORMAL">Bình thường</option><option value="HIGH">Cao</option><option value="URGENT">Khẩn</option><option value="CRITICAL">Rất khẩn / trọng yếu</option></select></div>
            <div className="recurring-field"><label>Khoa/Phòng chủ trì *</label><select value={form.lead_department_id} onChange={(e) => { patch("lead_department_id", e.target.value); patch("assignee_user_id", ""); }}><option value="">— Chọn đơn vị —</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
            <div className="recurring-field"><label>Người phụ trách *</label><select value={form.assignee_user_id} onChange={(e) => patch("assignee_user_id", e.target.value)}><option value="">— Chọn người —</option>{filteredProfiles.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email || p.user_id}</option>)}</select></div>
            <div className="recurring-field span-2"><label>Kết quả mong đợi *</label><textarea value={form.expected_result} onChange={(e) => patch("expected_result", e.target.value)} placeholder="Sản phẩm/kết quả phải hoàn thành ở mỗi kỳ" /></div>
            <div className="recurring-field span-2"><label>Minh chứng bắt buộc *</label><textarea value={form.evidence_requirement} onChange={(e) => patch("evidence_requirement", e.target.value)} placeholder="Ví dụ: báo cáo, biên bản, bảng kiểm, file số liệu…" /></div>
            <div className="recurring-field span-2"><label>Đầu ra tự động</label><select value={form.automation_kind} onChange={(e) => patch("automation_kind", e.target.value as "ACTION" | "MONITORING" | "REPORT")}><option value="ACTION">Chỉ tạo Action</option><option value="MONITORING">Tạo Action + Đợt giám sát</option><option value="REPORT">Tạo Action + Báo cáo từng kỳ</option></select><small>QARICA chỉ tự tạo hồ sơ nghiệp vụ khi đã đủ dữ liệu nguồn bắt buộc; phần còn thiếu sẽ được hỏi ngay bên dưới.</small></div>
            {form.automation_kind === "MONITORING" ? <>
              <div className="recurring-field"><label>Bảng kiểm đã phát hành *</label><select value={form.automation_ref_id} onChange={(e) => patch("automation_ref_id", e.target.value)}><option value="">— Chọn bảng kiểm —</option>{checklists.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
              <div className="recurring-field"><label>Khoa/phòng được giám sát</label><select value={form.automation_target_department_id} onChange={(e) => patch("automation_target_department_id", e.target.value)}><option value="">— Không cố định theo khoa —</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
              <div className="recurring-field span-2"><label>Phạm vi/khu vực giám sát</label><input value={form.automation_target_area} onChange={(e) => patch("automation_target_area", e.target.value)} placeholder="Ví dụ: Toàn bộ Tòa A và Tòa B" /><small>Cần ít nhất một trong hai: khoa/phòng hoặc phạm vi khu vực.</small></div>
            </> : form.automation_kind === "REPORT" ? <>
              <div className="recurring-field"><label>Nơi nhận báo cáo *</label><input value={form.automation_report_recipient} onChange={(e) => patch("automation_report_recipient", e.target.value)} placeholder="Ví dụ: Sở Y tế / Ban Giám đốc" /></div>
              <div className="recurring-field"><label>Phương thức gửi *</label><input value={form.automation_report_method} onChange={(e) => patch("automation_report_method", e.target.value)} placeholder="Ví dụ: Phần mềm / Email / Văn bản" /></div>
              <div className="recurring-field span-2"><label>Loại báo cáo</label><input value={form.automation_report_type} onChange={(e) => patch("automation_report_type", e.target.value)} placeholder="Ví dụ: Báo cáo KSK định kỳ" /><small>Mỗi kỳ lịch sẽ sinh một hồ sơ Báo cáo riêng và liên kết với Action của kỳ đó. QARICA không tự suy diễn kỳ dữ liệu từ ngày đến hạn.</small></div>
            </> : null}
            <label className="recurring-switch span-2"><input type="checkbox" checked={form.is_active} onChange={(e) => patch("is_active", e.target.checked)} /> Kích hoạt mẫu ngay sau khi lưu</label>
          </div>
          {message?.tone === "error" ? <div className="alert error" style={{ marginTop: 12 }}>{message.text}</div> : null}
        </div>
        <div className="modal-footer"><button className="button secondary" disabled={busy} onClick={() => setModalOpen(false)}>Hủy</button><button className="button primary" disabled={busy} onClick={submit}>{busy ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Tạo mẫu"}</button></div>
      </div>
    </div> : null}
  </div>;
}
