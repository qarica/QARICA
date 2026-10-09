import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { hasAnyPermission, hasPermission, requireUserContext } from "@/lib/auth";
import { EMR_CATEGORIES } from "@/lib/emr-categories";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";

type EventKind = "ACTION" | "PROGRAM" | "MONITORING" | "ASSESSMENT" | "REPORT" | "INSPECTION" | "RECURRING" | "REMINDER" | "EMR";
type EventTone = "danger" | "warning" | "info" | "success" | "neutral";

type CalendarEvent = {
  id: string;
  date: string;
  title: string;
  subtitle: string;
  href?: string | null;
  kind: EventKind;
  tone: EventTone;
};

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const MONTH_NAMES = ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"];
const CLOSED_ACTIONS = new Set(["COMPLETED", "CANCELLED", "NOT_APPLICABLE", "CLOSED"]);

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function hcmToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

function parseMonth(value: string | undefined, workYear: number, today: string) {
  const fallback = today.startsWith(`${workYear}-`) || today.startsWith(`${workYear + 1}-`) ? today.slice(0, 7) : `${workYear}-01`;
  const raw = /^\d{4}-\d{2}$/.test(value ?? "") ? value! : fallback;
  const [year, month] = raw.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return { year: workYear, month: 1 };
  const minKey = workYear * 12;
  const maxKey = (workYear + 1) * 12 + 2; // Cho phép chu kỳ năm kéo tới hết tháng 03 năm sau.
  const key = year * 12 + month - 1;
  if (key < minKey) return { year: workYear, month: 1 };
  if (key > maxKey) return { year: workYear + 1, month: 3 };
  return { year, month };
}

function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function monthParam(year: number, month: number) {
  return `${year}-${pad(month)}`;
}

function formatShortDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function cadenceLabel(rule?: string | null) {
  const value = String(rule || "");
  if (value.includes("FREQ=DAILY")) return "Hằng ngày";
  const dayMap: Record<string,string> = { MO:"thứ Hai", TU:"thứ Ba", WE:"thứ Tư", TH:"thứ Năm", FR:"thứ Sáu", SA:"thứ Bảy", SU:"Chủ nhật" };
  const byDay = value.match(/BYDAY=([A-Z]{2})/);
  const byMonthDay = value.match(/BYMONTHDAY=(\d+)/);
  const interval = Number(value.match(/INTERVAL=(\d+)/)?.[1] || 1);
  if (value.includes("FREQ=WEEKLY")) return `${interval > 1 ? `Mỗi ${interval} tuần` : "Hằng tuần"}${byDay ? `, ${dayMap[byDay[1]] || byDay[1]}` : ""}`;
  if (value.includes("FREQ=MONTHLY")) return `${interval > 1 ? `Mỗi ${interval} tháng` : "Hằng tháng"}${byMonthDay ? `, ngày ${byMonthDay[1]}` : ""}`;
  if (value.includes("FREQ=YEARLY")) return "Hằng năm";
  return "Theo lịch định kỳ";
}

function priorityText(value?: string | null) {
  if (value === "CRITICAL") return "Rất khẩn";
  if (value === "URGENT") return "Khẩn";
  if (value === "HIGH") return "Cao";
  if (value === "LOW") return "Thấp";
  return "Bình thường";
}

function kindClass(kind: EventKind) {
  return kind.toLowerCase();
}

function isVisibleCycleMonth(workYear: number, year: number, month: number) {
  const key = year * 12 + month - 1;
  return key >= workYear * 12 && key <= (workYear + 1) * 12 + 2;
}

type ViewMode = "month" | "week" | "quarter" | "year";

function addDays(date: string, delta: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// Tuần làm việc bắt đầu Thứ Hai, dùng ISO weekday (1=Mon..7=Sun).
function weekStartOf(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const isoDay = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return addDays(date, -(isoDay - 1));
}

function quarterOfMonth(month: number) {
  return Math.floor((month - 1) / 3); // 0..3
}

function quarterMonths(year: number, quarterIndex: number) {
  const startMonth = quarterIndex * 3 + 1;
  return [0, 1, 2].map((i) => ({ year, month: startMonth + i }));
}

export default async function QualityCalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; hidden?: string; view?: string; week?: string }> }) {
  const { user } = await requireUserContext();
  if (!hasAnyPermission(user, ["dashboard.view", "tasks.view", "plans.view", "plans.manage", "monitoring.view", "monitoring.perform", "reports.view", "inspections.view"])) redirect("/dashboard?forbidden=1");

  const workYear = await getWorkYear();
  const today = hcmToday();
  const query = await searchParams;
  const selected = parseMonth(query.month, workYear, today);
  const view: ViewMode = (["month","week","quarter","year"] as const).includes(query.view as ViewMode) ? (query.view as ViewMode) : "month";
  const weekAnchor = /^\d{4}-\d{2}-\d{2}$/.test(query.week ?? "") ? query.week! : today;
  const weekStart = weekStartOf(weekAnchor);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const allEventKinds: EventKind[] = ["ACTION","PROGRAM","MONITORING","ASSESSMENT","REPORT","INSPECTION","RECURRING","REMINDER","EMR"];
  const hiddenKinds = new Set<EventKind>(String(query.hidden || "").split(",").filter((x): x is EventKind => allEventKinds.includes(x as EventKind)));
  const selectedPrefix = `${selected.year}-${pad(selected.month)}-`;
  const cycleStart = `${workYear}-01-01`;
  const cycleEnd = `${workYear + 1}-03-31`;
  const supabase = await createClient();

  const [actionsRes, programsRes, monitoringRes, assessmentsRes, reportingRes, inspectionsRes, recurringRunsRes, recurringTemplatesRes, holidaysRes, remindersRes, emrRes] = await Promise.all([
    supabase
      .from("vw_actions_dashboard")
      .select("action_id,record_id,record_code,title,work_year,workflow_status,priority,due_date,is_overdue,days_to_due")
      .eq("work_year", workYear)
      .not("due_date", "is", null),
    supabase
      .from("work_programs")
      .select("id,record_id,start_date,end_date,workflow_status"),
    supabase
      .from("monitoring_rounds")
      .select("id,record_id,work_year,scheduled_date,workflow_status")
      .eq("work_year", workYear)
      .not("scheduled_date", "is", null),
    supabase
      .from("assessment_rounds")
      .select("id,record_id,work_year,start_date,submission_deadline,review_deadline,finalization_date,workflow_status")
      .eq("work_year", workYear),
    supabase
      .from("reporting_obligations")
      .select("id,record_id,due_date,workflow_status")
      .not("due_date", "is", null),
    supabase
      .from("inspection_events")
      .select("id,record_id,visit_date,workflow_status")
      .gte("visit_date", cycleStart)
      .lte("visit_date", cycleEnd),
    supabase
      .from("recurring_work_runs")
      .select("id,template_id,period_key,planned_date,generated_action_id,status,completion_note,completed_at")
      .gte("planned_date", cycleStart)
      .lte("planned_date", cycleEnd),
    supabase
      .from("recurring_work_templates")
      .select("id,title,recurrence_rule,start_date,end_date,priority,is_active,lead_department_id,assignee_user_id,automation_kind")
      .eq("is_active", true),
    user.organizationId ? supabase.from("work_calendar_holidays").select("id,name,start_date,end_date,holiday_type,note").eq("organization_id",user.organizationId).eq("is_active",true).lte("start_date",cycleEnd).gte("end_date",cycleStart) : Promise.resolve({ data: [] as any[], error: null }),
    supabase.from("personal_reminders").select("id,title,due_at,priority,status").eq("owner_user_id",user.id).neq("status","CANCELLED").not("due_at","is",null).gte("due_at",`${cycleStart}T00:00:00+07:00`).lte("due_at",`${cycleEnd}T23:59:59+07:00`),
    hasPermission(user, "emr.view") && user.organizationId
      ? supabase.from("emr_rollout_items").select("id,category,title,status,due_date,priority,publish_status").eq("organization_id", user.organizationId).not("due_date", "is", null).gte("due_date", cycleStart).lte("due_date", cycleEnd)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  const linkedRecordIds = Array.from(new Set([
    ...(programsRes.data ?? []).map((row: any) => row.record_id),
    ...(monitoringRes.data ?? []).map((row: any) => row.record_id),
    ...(assessmentsRes.data ?? []).map((row: any) => row.record_id),
    ...(reportingRes.data ?? []).map((row: any) => row.record_id),
    ...(inspectionsRes.data ?? []).map((row: any) => row.record_id),
  ].filter(Boolean))) as string[];

  const recordMap = new Map<string, any>();
  let recordsError: any = null;
  if (linkedRecordIds.length) {
    const recordsRes = await supabase
      .from("records")
      .select("id,record_code,title,work_year,lifecycle_status,record_type")
      .in("id", linkedRecordIds);
    recordsError = recordsRes.error;
    for (const record of recordsRes.data ?? []) recordMap.set((record as any).id, record);
  }

  const templateMap = new Map<string, any>();
  for (const template of recurringTemplatesRes.data ?? []) templateMap.set((template as any).id, template);

  const events: CalendarEvent[] = [];

  for (const action of (actionsRes.data ?? []) as any[]) {
    if (!action.due_date || ["CANCELLED", "NOT_APPLICABLE"].includes(action.workflow_status)) continue;
    const open = !CLOSED_ACTIONS.has(action.workflow_status);
    const overdue = open && action.due_date < today;
    const dueToday = open && action.due_date === today;
    events.push({
      id: `action:${action.action_id}`,
      date: action.due_date,
      title: action.title,
      subtitle: `${action.record_code} · ${open ? (overdue ? "Quá hạn thực hiện" : dueToday ? "Đến hạn thực hiện" : "Đang thực hiện") : "Đã hoàn tất"}`,
      href: `/tasks/${action.record_id}`,
      kind: "ACTION",
      tone: overdue ? "danger" : dueToday ? "warning" : action.workflow_status === "COMPLETED" ? "success" : "info",
    });
  }

  for (const program of (programsRes.data ?? []) as any[]) {
    const record = recordMap.get(program.record_id);
    if (!record || record.lifecycle_status === "ARCHIVED" || program.workflow_status === "CANCELLED") continue;
    if (program.start_date) {
      events.push({
        id: `program-start:${program.id}`,
        date: program.start_date,
        title: record.title,
        subtitle: `${record.record_code} · Bắt đầu kế hoạch`,
        href: `/plans/${program.id}`,
        kind: "PROGRAM",
        tone: "neutral",
      });
    }
    if (program.end_date && program.end_date !== program.start_date) {
      const overdue = program.end_date < today && !["COMPLETED", "CANCELLED"].includes(program.workflow_status);
      events.push({
        id: `program-end:${program.id}`,
        date: program.end_date,
        title: record.title,
        subtitle: `${record.record_code} · Kết thúc kế hoạch`,
        href: `/plans/${program.id}`,
        kind: "PROGRAM",
        tone: overdue ? "danger" : program.workflow_status === "COMPLETED" ? "success" : "neutral",
      });
    }
  }

  for (const round of (monitoringRes.data ?? []) as any[]) {
    const record = recordMap.get(round.record_id);
    if (!record || round.workflow_status === "CANCELLED" || !round.scheduled_date) continue;
    const open = !["CONFIRMED", "CLOSED", "CANCELLED"].includes(round.workflow_status);
    const overdue = open && round.scheduled_date < today;
    const dueToday = open && round.scheduled_date === today;
    events.push({
      id: `monitoring:${round.id}`,
      date: round.scheduled_date,
      title: record.title,
      subtitle: `${record.record_code} · Giám sát/Bảng kiểm`,
      href: `/monitoring/${round.id}`,
      kind: "MONITORING",
      tone: overdue ? "danger" : dueToday ? "warning" : ["CONFIRMED", "CLOSED"].includes(round.workflow_status) ? "success" : "info",
    });
  }

  for (const round of (assessmentsRes.data ?? []) as any[]) {
    const record = recordMap.get(round.record_id);
    if (!record || round.workflow_status === "CANCELLED") continue;
    if (round.start_date) {
      events.push({
        id: `assessment-start:${round.id}`,
        date: round.start_date,
        title: record.title,
        subtitle: `${record.record_code} · Bắt đầu tự đánh giá`,
        href: `/assessments/${round.record_id}`,
        kind: "ASSESSMENT",
        tone: round.start_date === today ? "warning" : "info",
      });
    }
    const finalized = ["FINALIZED", "CLOSED", "COMPLETED"].includes(round.workflow_status);
    if (round.submission_deadline) {
      const overdue = !finalized && round.submission_deadline < today;
      events.push({
        id: `assessment-submit:${round.id}`,
        date: round.submission_deadline,
        title: record.title,
        subtitle: `${record.record_code} · Hạn nộp tự đánh giá`,
        href: `/assessments/${round.record_id}`,
        kind: "ASSESSMENT",
        tone: overdue ? "danger" : round.submission_deadline === today ? "warning" : finalized ? "success" : "info",
      });
    }
    if (round.review_deadline) {
      const reviewDone = ["FINALIZED", "CLOSED", "COMPLETED"].includes(round.workflow_status);
      const overdue = !reviewDone && round.review_deadline < today;
      events.push({
        id: `assessment-review:${round.id}`,
        date: round.review_deadline,
        title: record.title,
        subtitle: `${record.record_code} · Hạn rà soát đánh giá`,
        href: `/assessments/${round.record_id}`,
        kind: "ASSESSMENT",
        tone: overdue ? "danger" : round.review_deadline === today ? "warning" : reviewDone ? "success" : "info",
      });
    }
    if (round.finalization_date) {
      events.push({
        id: `assessment-finalize:${round.id}`,
        date: round.finalization_date,
        title: record.title,
        subtitle: `${record.record_code} · Ngày chốt đánh giá`,
        href: `/assessments/${round.record_id}`,
        kind: "ASSESSMENT",
        tone: finalized ? "success" : round.finalization_date < today ? "danger" : "info",
      });
    }
  }

  for (const report of (reportingRes.data ?? []) as any[]) {
    const record = recordMap.get(report.record_id);
    if (!record || !report.due_date || report.workflow_status === "CANCELLED") continue;
    const completed = ["SUBMITTED", "COMPLETED"].includes(report.workflow_status);
    const overdue = !completed && report.due_date < today;
    const dueToday = !completed && report.due_date === today;
    events.push({
      id: `report:${report.id}`,
      date: report.due_date,
      title: record.title,
      subtitle: `${record.record_code} · Hạn báo cáo`,
      href: `/reports/${report.record_id}`,
      kind: "REPORT",
      tone: overdue ? "danger" : dueToday ? "warning" : completed ? "success" : "info",
    });
  }

  for (const inspection of (inspectionsRes.data ?? []) as any[]) {
    const record = recordMap.get(inspection.record_id);
    if (!record || !inspection.visit_date || ["CANCELLED", "ARCHIVED"].includes(inspection.workflow_status)) continue;
    events.push({
      id: `inspection:${inspection.id}`,
      date: inspection.visit_date,
      title: record.title,
      subtitle: `${record.record_code} · Tiếp đoàn/Kiểm tra ngoài`,
      href: `/inspections/${inspection.record_id}`,
      kind: "INSPECTION",
      tone: inspection.visit_date === today ? "warning" : "info",
    });
  }

  // Sổ tay QLCL là reminder vận hành độc lập; không dùng Action làm wrapper.
  for (const run of (recurringRunsRes.data ?? []) as any[]) {
    if (!run.planned_date) continue;
    const template = templateMap.get(run.template_id);
    if (!template || template.automation_kind !== "REMINDER") continue;
    const overdue = run.planned_date < today && !["COMPLETED", "SKIPPED", "CANCELLED"].includes(String(run.status || "").toUpperCase());
    events.push({
      id: `recurring:${run.id}`,
      date: run.planned_date,
      title: template.title,
      subtitle: `Sổ tay QLCL · ${run.period_key || template.recurrence_rule}${run.completion_note ? ` · ${run.completion_note}` : ""}`,
      kind: "RECURRING",
      tone: run.completed_at || String(run.status || "").toUpperCase() === "COMPLETED" ? "success" : overdue ? "danger" : run.planned_date === today ? "warning" : "info",
    });
  }

  for (const reminder of (remindersRes.data ?? []) as any[]) { if (!reminder.due_at) continue; const date=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}).format(new Date(reminder.due_at)); const open=reminder.status==="OPEN"; events.push({id:`reminder:${reminder.id}`,date,title:reminder.title,subtitle:"Nhắc việc cá nhân",href:"/tasks",kind:"REMINDER",tone:!open?"success":date<today?"danger":date===today?"warning":"neutral"}); }

  // Hạng mục dự án triển khai EMR có hạn — hiển thị chung trong lịch QLCL
  // thay vì chỉ nằm riêng ở menu EMR, theo yêu cầu "vừa phụ trách QLCL vừa
  // EMR thì chỉ cần nhìn 1 lịch". emr_rollout_items vẫn là nguồn dữ liệu duy
  // nhất (không copy/nhân bản) — lịch chỉ đọc, không quản lý hạng mục ở đây.
  for (const item of (emrRes.data ?? []) as any[]) {
    if (!item.due_date) continue;
    // Báo cáo thực tế "Tổng quan EMR chưa đồng bộ": Biểu mẫu còn Nháp (chưa
    // duyệt phát hành) chưa được coi là đang triển khai chính thức — không
    // hiện "Đang triển khai/Quá hạn triển khai" trên lịch chung cho hạng mục
    // còn chưa duyệt, nhất quán với Tổng quan EMR và nhắc hạn.
    if (item.category === "BIEU_MAU" && item.publish_status === "DRAFT") continue;
    const open = item.status !== "DONE";
    const overdue = open && item.due_date < today;
    const dueToday = open && item.due_date === today;
    const category = EMR_CATEGORIES.find((c) => c.code === item.category);
    events.push({
      id: `emr:${item.id}`,
      date: item.due_date,
      title: item.title,
      subtitle: `${category?.label || "EMR"} · ${open ? (overdue ? "Quá hạn triển khai" : dueToday ? "Đến hạn triển khai" : "Đang triển khai") : "Đã hoàn tất"}`,
      href: category ? `/emr/${category.slug}` : "/emr",
      kind: "EMR",
      tone: overdue ? "danger" : dueToday ? "warning" : item.status === "DONE" ? "success" : "info",
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "vi"));

  const visibleEvents = events.filter((event) => !hiddenKinds.has(event.kind));
  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const event of visibleEvents) {
    const list = eventsByDate.get(event.date) ?? [];
    list.push(event);
    eventsByDate.set(event.date, list);
  }
  const monthEvents = visibleEvents.filter((event) => event.date.startsWith(selectedPrefix));
  const weekEvents = visibleEvents.filter((event) => weekDates.includes(event.date));
  const activeQuarterIndex = quarterOfMonth(selected.month);
  const quarterMonthList = quarterMonths(selected.year, activeQuarterIndex);
  const quarterPrefixes = quarterMonthList.map((m) => `${m.year}-${pad(m.month)}-`);
  const quarterEvents = visibleEvents.filter((event) => quarterPrefixes.some((p) => event.date.startsWith(p)));
  const yearMonthList = Array.from({ length: 12 }, (_, i) => ({ year: workYear, month: i + 1 }));
  const yearPrefix = `${workYear}-`;
  const yearEvents = visibleEvents.filter((event) => event.date.startsWith(yearPrefix));
  const periodEvents = view === "week" ? weekEvents : view === "quarter" ? quarterEvents : view === "year" ? yearEvents : monthEvents;
  const periodLabel = view === "week" ? "trong tuần" : view === "quarter" ? "trong quý" : view === "year" ? "trong năm" : "trong tháng";

  const holidayForDate=(date:string)=>(holidaysRes.data??[]).find((h:any)=>h.start_date<=date&&h.end_date>=date) as any|undefined;
  const isSunday=(date:string)=>new Date(`${date}T00:00:00Z`).getUTCDay()===0;

  const firstWeekdaySundayZero = new Date(Date.UTC(selected.year, selected.month - 1, 1)).getUTCDay();
  const leadingBlanks = (firstWeekdaySundayZero + 6) % 7;
  const daysInMonth = new Date(Date.UTC(selected.year, selected.month, 0)).getUTCDate();
  const totalCells = Math.ceil((leadingBlanks + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: totalCells }, (_, index) => {
    const day = index - leadingBlanks + 1;
    if (day < 1 || day > daysInMonth) return null;
    return `${selected.year}-${pad(selected.month)}-${pad(day)}`;
  });

  const previous = shiftMonth(selected.year, selected.month, -1);
  const next = shiftMonth(selected.year, selected.month, 1);
  const hiddenParam = allEventKinds.filter((k) => hiddenKinds.has(k)).join(",");
  function buildHref(opts: { month?: string; week?: string; view?: ViewMode }) {
    const params = new URLSearchParams();
    params.set("month", opts.month ?? monthParam(selected.year, selected.month));
    const nextView = opts.view ?? view;
    if (nextView !== "month") params.set("view", nextView);
    if (nextView === "week") params.set("week", opts.week ?? weekAnchor);
    if (hiddenParam) params.set("hidden", hiddenParam);
    return `/calendar?${params.toString()}`;
  }
  const monthHref = (year: number, month: number) => buildHref({ month: monthParam(year, month) });
  const viewHref = (v: ViewMode) => buildHref({ view: v });
  const weekHref = (dateAnchor: string) => buildHref({ view: "week", week: dateAnchor, month: monthParam(Number(dateAnchor.slice(0,4)), Number(dateAnchor.slice(5,7))) });
  const toggleKindHref = (kind: EventKind) => {
    const next = new Set(hiddenKinds); if (next.has(kind)) next.delete(kind); else next.add(kind);
    const list = allEventKinds.filter((k) => next.has(k)).join(",");
    const params = new URLSearchParams(); params.set("month", monthParam(selected.year, selected.month));
    if (view !== "month") params.set("view", view);
    if (view === "week") params.set("week", weekAnchor);
    if (list) params.set("hidden", list);
    return `/calendar?${params.toString()}`;
  };
  const currentTodayYear = Number(today.slice(0, 4));
  const currentTodayMonth = Number(today.slice(5, 7));
  const KIND_LABEL: Record<EventKind, string> = { ACTION: "Action", REMINDER: "Nhắc việc cá nhân", PROGRAM: "Kế hoạch", ASSESSMENT: "Đánh giá", REPORT: "Báo cáo", MONITORING: "Giám sát", INSPECTION: "Tiếp đoàn", RECURRING: "Sổ tay QLCL", EMR: "Dự án EMR" };
  const kindCounts = new Map<EventKind, number>();
  for (const event of periodEvents) kindCounts.set(event.kind, (kindCounts.get(event.kind) ?? 0) + 1);
  const overdueOpen = events.filter((event) => event.tone === "danger").length;
  const todayCount = events.filter((event) => event.date === today && !["success"].includes(event.tone)).length;
  const recurringMonthCount = periodEvents.filter((event) => event.kind === "RECURRING" || event.kind === "MONITORING").length;
  const firstError = [actionsRes, programsRes, monitoringRes, reportingRes, inspectionsRes, recurringRunsRes, recurringTemplatesRes, holidaysRes, remindersRes, emrRes]
    .find((result: any) => result.error)?.error || recordsError;
  const activeTemplates = ((recurringTemplatesRes.data ?? []) as any[]).filter((template) => template.automation_kind === "REMINDER");

  const renderEvent = (event: CalendarEvent, mobile = false) => {
    const className = `${mobile ? "calendar-agenda-item" : "calendar-event"} ${kindClass(event.kind)} ${event.tone}`;
    const content = <><strong>{event.title}</strong><small>{event.subtitle}</small></>;
    return event.href
      ? <Link key={event.id} href={event.href} className={className} title={`${event.title} · ${event.subtitle}`}>{content}</Link>
      : <div key={event.id} className={className} title={`${event.title} · ${event.subtitle}`}>{content}</div>;
  };

  function renderMiniMonth(y: number, m: number) {
    const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const lead = (firstDow + 6) % 7;
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const total = Math.ceil((lead + dim) / 7) * 7;
    const miniCells = Array.from({ length: total }, (_, i) => { const day = i - lead + 1; return day < 1 || day > dim ? null : `${y}-${pad(m)}-${pad(day)}`; });
    return <article className="calendar-mini-month" key={`${y}-${m}`}>
      <div className="calendar-mini-month-head"><Link href={monthHref(y, m)}>{MONTH_NAMES[m - 1]}{y !== workYear ? ` /${String(y).slice(-2)}` : ""} →</Link></div>
      <div className="calendar-mini-grid">
        {WEEKDAYS.map((d) => <span className="calendar-mini-weekday" key={d}>{d[1]}</span>)}
        {miniCells.map((date, i) => {
          if (!date) return <span className="calendar-mini-cell blank" key={`b-${i}`} />;
          const dayEvents = eventsByDate.get(date) ?? [];
          const kinds = Array.from(new Set(dayEvents.map((e) => e.kind))).slice(0, 3);
          const hasDanger = dayEvents.some((e) => e.tone === "danger");
          return <Link href={weekHref(date)} key={date} className={`calendar-mini-cell ${date === today ? "today" : ""} ${hasDanger ? "danger" : ""}`} title={dayEvents.length ? `${dayEvents.length} mốc` : undefined}>
            <span>{Number(date.slice(-2))}</span>
            {kinds.length ? <i className="calendar-mini-dots">{kinds.map((k) => <b key={k} className={`calendar-dot ${kindClass(k)}`} />)}</i> : null}
          </Link>;
        })}
      </div>
    </article>;
  }

  return <div className="page-stack quality-calendar-page">
    <style>{`
      .quality-calendar-page{width:100%;max-width:1500px;margin:0 auto;gap:14px!important}
      .quality-calendar-page .kpi-icon{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;margin-bottom:11px}
      .quality-calendar-page .kpi-icon.amber{background:#f59e0b}.quality-calendar-page .kpi-icon.red{background:#ef4444}.quality-calendar-page .kpi-icon.blue{background:#3b82f6}.quality-calendar-page .kpi-icon.green{background:#22c55e}
      .calendar-kind-filters{display:flex;gap:6px;flex-wrap:wrap;padding:0 15px 13px}.calendar-kind-filter{display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:5px 9px;border:1px solid #d7e1e5;border-radius:999px;background:#fff;color:#52656d;text-decoration:none;font-size:10px;font-weight:800}.calendar-kind-filter:hover{border-color:#94a3b8;background:#f8fafc}.calendar-kind-filter.active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}
      .calendar-kind-toggle.off{opacity:.5}.calendar-kind-switch{display:inline-block;width:22px;height:13px;border-radius:999px;background:#cbd5e1;position:relative;margin-left:2px;transition:background .15s ease}.calendar-kind-switch::after{content:"";position:absolute;top:1.5px;left:1.5px;width:10px;height:10px;border-radius:50%;background:#fff;transition:left .15s ease}.calendar-kind-toggle.on .calendar-kind-switch{background:#22c55e}.calendar-kind-toggle.on .calendar-kind-switch::after{left:10.5px}.calendar-source-note{display:flex;align-items:flex-start;gap:9px;padding:11px 13px;border:1px solid #dbe5ec;border-left:4px solid #2563eb;border-radius:12px;background:#f8fbff;color:#475569;font-size:11px;line-height:1.45}
      .calendar-source-note strong{color:#1e3a5f}
      .calendar-roadmap{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
      .calendar-roadmap-card{border:1px solid #dfe7ec;border-left:4px solid #2563eb;border-radius:12px;padding:11px 12px;background:#fff;min-height:100px}
      .calendar-roadmap-card.active{border-left-color:#d69a24;background:#fffdf7}.calendar-roadmap-card.done{border-left-color:#2b8b5b;opacity:.8}
      .calendar-roadmap-card strong{display:flex;justify-content:space-between;gap:8px;color:#1e293b;font-size:12px}.calendar-roadmap-card strong span{font-size:10px;color:#64748b;font-weight:700;white-space:nowrap}.calendar-roadmap-card p{margin:7px 0 0;color:#64748b;font-size:10.5px;line-height:1.45}
      .calendar-body{display:grid;grid-template-columns:1fr 220px;gap:0}
      .calendar-legend-side{border-left:1px solid #e2e8f0;padding:14px 14px}
      .calendar-legend-side h3{margin:0 0 10px;font-size:11px;font-weight:850;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
      .calendar-legend-side-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 0;font-size:11.5px;color:#334155;border-bottom:1px solid #f1f5f9}
      .calendar-legend-side-row:last-child{border-bottom:0}
      .calendar-legend-side-row span{display:inline-flex;align-items:center;gap:7px}
      .calendar-legend-side-row b{font-weight:800;color:#1e293b}
      @media(max-width:1100px){.calendar-body{grid-template-columns:1fr}.calendar-legend-side{border-left:0;border-top:1px solid #e2e8f0}}
      .calendar-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:13px 15px}
      .calendar-toolbar-left,.calendar-toolbar-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .calendar-view-switch{display:flex;border:1px solid #d7e1e5;border-radius:10px;overflow:hidden}.calendar-view-switch a{padding:7px 12px;font-size:11px;font-weight:800;color:#52656d;text-decoration:none;border-right:1px solid #d7e1e5}.calendar-view-switch a:last-child{border-right:0}.calendar-view-switch a:hover{background:#f8fafc}.calendar-view-switch a.active{background:#2563eb;color:#fff}
      .calendar-week-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;padding:10px 14px 14px;overflow-x:auto}.calendar-week-col{border:1px solid #e2e8f0;border-radius:12px;padding:8px;min-height:220px;background:#fff;min-width:140px}.calendar-week-col.sunday{background:#fff7ed}.calendar-week-col.holiday{background:#fef2f2}.calendar-week-col.today{box-shadow:inset 0 0 0 2px #f2c94c}.calendar-week-col-head{display:flex;justify-content:space-between;align-items:baseline;padding-bottom:6px;margin-bottom:6px;border-bottom:1px solid #eef2f3}.calendar-week-col-head strong{font-size:11px;color:#334155}.calendar-week-col-head span{font-size:10px;color:#64748b}.calendar-week-empty{font-size:10px;color:#94a3b8;padding:6px 2px}
      .calendar-mini-month-grid{display:grid;gap:12px;padding:12px 14px 16px}.calendar-mini-month-grid.quarter{grid-template-columns:repeat(3,minmax(0,1fr))}.calendar-mini-month-grid.year{grid-template-columns:repeat(4,minmax(0,1fr))}
      .calendar-mini-month{border:1px solid #e2e8f0;border-radius:12px;padding:9px;background:#fff}.calendar-mini-month-head{display:flex;justify-content:space-between;padding-bottom:7px;margin-bottom:6px;border-bottom:1px solid #eef2f3}.calendar-mini-month-head a{font-size:11px;font-weight:800;color:#1d4ed8;text-decoration:none}
      .calendar-mini-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}.calendar-mini-weekday{text-align:center;font-size:8px;font-weight:800;color:#94a3b8;padding-bottom:2px}
      .calendar-mini-cell{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;min-height:26px;border-radius:6px;font-size:9.5px;color:#334155;text-decoration:none}.calendar-mini-cell.blank{visibility:hidden}.calendar-mini-cell:hover{background:#f1f5f9}.calendar-mini-cell.today{background:#fef3c7;font-weight:800}.calendar-mini-cell.danger{box-shadow:inset 0 0 0 1px #ce4b4b}
      .calendar-mini-dots{display:flex;gap:1px}.calendar-mini-dots b{width:4px;height:4px;border-radius:50%;margin:0}
      @media(max-width:1100px){.calendar-mini-month-grid.year{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:700px){.calendar-mini-month-grid.quarter,.calendar-mini-month-grid.year{grid-template-columns:1fr}.calendar-week-grid{grid-template-columns:repeat(7,minmax(120px,1fr))}}.calendar-month-title{font-size:16px;font-weight:850;color:#1e293b;min-width:190px;text-align:center;cursor:pointer;list-style:none}.calendar-month-picker{position:relative}.calendar-month-picker summary::-webkit-details-marker{display:none}.calendar-month-popover{position:absolute;z-index:20;top:38px;left:50%;transform:translateX(-50%);width:300px;padding:12px;border:1px solid #dbe5ec;border-radius:12px;background:#fff;box-shadow:0 12px 30px #0f172a20}.calendar-picker-year{text-align:center;margin-bottom:9px}.calendar-picker-months{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
      .calendar-dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:0 0 auto}.calendar-dot.action{background:#2563eb}.calendar-dot.program{background:#7c3aed}.calendar-dot.monitoring{background:#2b8b5b}.calendar-dot.report{background:#0891b2}.calendar-dot.inspection{background:#ea580c}.calendar-dot.recurring{background:#0f766e}.calendar-dot.plan{background:#64748b}.calendar-dot.reminder{background:#a855f7}.calendar-dot.emr{background:#4f46e5}.calendar-dot.attention{background:#ce4b4b}
      .calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border-top:1px solid #e2e8f0;border-left:1px solid #e2e8f0}.calendar-weekday{padding:9px;text-align:center;font-size:10px;font-weight:850;color:#64748b;background:#f8fafc;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0}
      .calendar-cell{min-height:142px;padding:7px;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;background:#fff;overflow:hidden}.calendar-cell.blank{background:#f8fafc}.calendar-cell.sunday{background:#fff7ed;box-shadow:inset 0 3px 0 #f59e0b}.calendar-cell.holiday{background:#fef2f2;box-shadow:inset 0 3px 0 #dc2626}.calendar-cell.holiday.sunday{background:#fff1f2;box-shadow:inset 0 3px 0 #dc2626}.calendar-holiday-name{font-size:8.5px;font-weight:850;color:#b42318;margin:-2px 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.calendar-holiday-note{font-size:8px;line-height:1.25;color:#52766b;margin-bottom:5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.calendar-cell.today{box-shadow:inset 0 0 0 2px #f2c94c}.calendar-day-number{font-size:12px;font-weight:850;color:#334155;margin-bottom:6px}.calendar-cell.today .calendar-day-number{color:#9a5b00}
      .calendar-event{display:block;margin-top:4px;padding:5px 6px;border-radius:7px;border-left:3px solid #2563eb;background:#eff6ff;color:#1e3a8a;font-size:9.3px;line-height:1.25;overflow:hidden}.calendar-event strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.calendar-event small{display:block;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:inherit;opacity:.76}.calendar-event.program{border-left-color:#7c3aed;background:#f5f3ff;color:#5b21b6}.calendar-event.monitoring{border-left-color:#2b8b5b;background:#ecfdf5;color:#166534}.calendar-event.report{border-left-color:#0891b2;background:#ecfeff;color:#155e75}.calendar-event.inspection{border-left-color:#ea580c;background:#fff7ed;color:#9a3412}.calendar-event.recurring{border-left-color:#0f766e;background:#f0fdfa;color:#115e59}.calendar-event.plan{border-left-color:#64748b;background:#f8fafc;color:#475569}.calendar-event.reminder{border-left-color:#a855f7;background:#faf5ff;color:#7e22ce}.calendar-event.emr{border-left-color:#4f46e5;background:#eef2ff;color:#3730a3}.calendar-event.danger{border-left-color:#ce4b4b;background:#fff1f2;color:#b42318}.calendar-event.warning{border-left-color:#d69a24;background:#fff8e8;color:#8a5a00}.calendar-event.success{opacity:.62}.calendar-more{font-size:9px;color:#64748b;margin-top:5px;font-weight:750}
      .calendar-mobile-agenda{display:none}.calendar-agenda-row{display:grid;grid-template-columns:72px 1fr;gap:10px;padding:11px 12px;border-bottom:1px solid #eef2f3}.calendar-agenda-row:last-child{border-bottom:0}.calendar-agenda-date{font-size:10.5px;font-weight:850;color:#475569}.calendar-agenda-items{display:grid;gap:7px}.calendar-agenda-item{display:block;border:1px solid #e2e8f0;border-left:4px solid #2563eb;border-radius:11px;padding:9px 10px;background:#fff}.calendar-agenda-item.program{border-left-color:#7c3aed}.calendar-agenda-item.monitoring{border-left-color:#2b8b5b}.calendar-agenda-item.report{border-left-color:#0891b2}.calendar-agenda-item.inspection{border-left-color:#ea580c}.calendar-agenda-item.recurring{border-left-color:#0f766e}.calendar-agenda-item.plan{border-left-color:#64748b}.calendar-agenda-item.reminder{border-left-color:#a855f7}.calendar-agenda-item.emr{border-left-color:#4f46e5}.calendar-agenda-item.danger{border-left-color:#ce4b4b;background:#fffafa}.calendar-agenda-item.warning{border-left-color:#d69a24;background:#fffdf6}.calendar-agenda-item.success{opacity:.68}.calendar-agenda-item strong{display:block;font-size:12px;line-height:1.35;color:#27364a}.calendar-agenda-item small{display:block;margin-top:3px;color:#64748b;font-size:9.5px}
      .calendar-recurrence-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:0 14px 14px}.calendar-recurrence-card{border:1px solid #e2e8f0;border-left:4px solid #0f766e;border-radius:11px;padding:10px 11px;background:#fff}.calendar-recurrence-card .cadence{font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.04em;color:#0f766e}.calendar-recurrence-card strong{display:block;margin-top:4px;font-size:11.5px;color:#27364a}.calendar-recurrence-card small{display:block;margin-top:3px;font-size:9.5px;color:#64748b}.calendar-section-head{padding:13px 14px 9px;display:flex;justify-content:space-between;align-items:flex-end;gap:10px}.calendar-section-head strong{font-size:13px;color:#243247}.calendar-section-head span{font-size:9.5px;color:#64748b}
      @media(max-width:900px){.calendar-roadmap{grid-template-columns:1fr}.calendar-roadmap-card{min-height:0}}
      @media(max-width:760px){.quality-calendar-page{gap:10px!important}.quality-calendar-page .page-header h1{font-size:23px!important}.quality-calendar-page .kpi-grid{grid-template-columns:1fr 1fr!important;gap:8px!important}.quality-calendar-page .kpi-card{min-height:86px!important;padding:11px!important}.calendar-toolbar{display:grid;gap:10px;padding:12px}.calendar-toolbar-left{display:grid;grid-template-columns:auto 1fr auto}.calendar-toolbar-right{display:grid;grid-template-columns:1fr 1fr}.calendar-toolbar-right .button{width:100%}.calendar-month-title{font-size:16px;min-width:0}.calendar-grid,.calendar-legend-side{display:none!important}.calendar-mobile-agenda{display:block}.calendar-agenda-row{grid-template-columns:58px 1fr;padding:10px}.calendar-recurrence-grid{grid-template-columns:1fr;padding:0 10px 10px}.calendar-source-note{font-size:10.5px}.calendar-roadmap-card p{font-size:10px}}
    `}</style>

    <PageHeader
      eyebrow={`KẾ HOẠCH & ĐIỀU HÀNH · CHU KỲ ${workYear}`}
      title="Lịch công tác QLCL"
      description="Một lịch chung lấy trực tiếp từ dữ liệu vận hành: hạn Action, kế hoạch, báo cáo, giám sát, tiếp đoàn và công việc định kỳ. Không hiển thị mốc tĩnh ngoài dữ liệu đã cấu hình trên hệ thống."
      icon="calendar-days"
      actions={<Link className="button secondary" href="/calendar/gantt">Gantt tiến độ →</Link>}
    />

    {firstError ? <div className="alert error">Một phần dữ liệu lịch chưa tải được: {firstError.message}</div> : null}

    <section className="kpi-grid">
      <article className="kpi-card warning"><span className="kpi-icon amber"><Icon name="calendar-days" size={17}/></span><span>Cần xử lý hôm nay</span><strong>{todayCount}</strong><small>Từ dữ liệu vận hành</small></article>
      <article className="kpi-card danger"><span className="kpi-icon red"><Icon name="triangle-alert" size={17}/></span><span>Đang quá hạn</span><strong>{overdueOpen}</strong><small>Action/hồ sơ vận hành</small></article>
      <article className="kpi-card info"><span className="kpi-icon blue"><Icon name="list-checks" size={17}/></span><span>Mốc {periodLabel}</span><strong>{periodEvents.length}</strong><small>Từ dữ liệu hệ thống</small></article>
      <article className="kpi-card success"><span className="kpi-icon green"><Icon name="refresh-cw" size={17}/></span><span>Giám sát/định kỳ</span><strong>{recurringMonthCount}</strong><small>Đợt đã lập hoặc run định kỳ</small></article>
    </section>

    <section className="panel">
      <div className="calendar-toolbar">
        <div className="calendar-toolbar-left">
          {view === "month" ? <>
            {isVisibleCycleMonth(workYear, currentTodayYear, currentTodayMonth) ? <Link className="button tertiary small" href={monthHref(currentTodayYear, currentTodayMonth)}>Hôm nay</Link> : null}
            {isVisibleCycleMonth(workYear, previous.year, previous.month) ? <Link className="button secondary small" href={monthHref(previous.year, previous.month)}>←</Link> : <span className="button secondary small" style={{ opacity: .35 }}>←</span>}
            <details className="calendar-month-picker"><summary className="calendar-month-title">{MONTH_NAMES[selected.month - 1]} năm {selected.year} ▾</summary><div className="calendar-month-popover"><div className="calendar-picker-year"><strong>Chọn tháng · Chu kỳ {workYear}</strong></div><div className="calendar-picker-months">{Array.from({length:15},(_,i)=>{const d=shiftMonth(workYear,1,i);return d;}).map(({year,month})=><Link key={`${year}-${month}`} className={`button small ${year===selected.year&&month===selected.month?"primary":"secondary"}`} href={monthHref(year,month)}>{month <= 12 ? `T${month}` : `T${month}`} {year !== workYear ? `/${String(year).slice(-2)}` : ""}</Link>)}</div></div></details>
            {isVisibleCycleMonth(workYear, next.year, next.month) ? <Link className="button secondary small" href={monthHref(next.year, next.month)}>→</Link> : <span className="button secondary small" style={{ opacity: .35 }}>→</span>}
          </> : null}
          {view === "week" ? <>
            <Link className="button tertiary small" href={weekHref(today)}>Hôm nay</Link>
            <Link className="button secondary small" href={weekHref(addDays(weekStart, -7))}>←</Link>
            <span className="calendar-month-title">Tuần {formatShortDate(weekStart)} – {formatShortDate(weekDates[6])}</span>
            <Link className="button secondary small" href={weekHref(addDays(weekStart, 7))}>→</Link>
          </> : null}
          {view === "quarter" ? <>
            <Link className="button tertiary small" href={buildHref({ view: "quarter", month: monthParam(currentTodayYear, currentTodayMonth) })}>Hôm nay</Link>
            <Link className="button secondary small" href={buildHref({ view: "quarter", month: monthParam(shiftMonth(selected.year, quarterMonthList[0].month, -1).year, shiftMonth(selected.year, quarterMonthList[0].month, -1).month) })}>←</Link>
            <span className="calendar-month-title">Quý {activeQuarterIndex + 1} năm {selected.year}</span>
            <Link className="button secondary small" href={buildHref({ view: "quarter", month: monthParam(shiftMonth(selected.year, quarterMonthList[0].month, 3).year, shiftMonth(selected.year, quarterMonthList[0].month, 3).month) })}>→</Link>
          </> : null}
          {view === "year" ? <span className="calendar-month-title">Năm {workYear} <small style={{fontWeight:600,fontSize:11,color:"#64748b"}}>· theo năm công tác đang chọn</small></span> : null}
        </div>
        <div className="calendar-toolbar-right">
          <nav className="calendar-view-switch" aria-label="Chọn chế độ xem lịch">
            <Link href={viewHref("month")} className={view === "month" ? "active" : ""}>Tháng</Link>
            <Link href={viewHref("week")} className={view === "week" ? "active" : ""}>Tuần</Link>
            <Link href={viewHref("quarter")} className={view === "quarter" ? "active" : ""}>Quý</Link>
            <Link href={viewHref("year")} className={view === "year" ? "active" : ""}>Năm</Link>
          </nav>
          <Link className="button secondary small" href="/tasks">Việc của tôi</Link>
        </div>
      </div>
      <nav className="calendar-kind-filters" aria-label="Ẩn/hiện nguồn dữ liệu trên lịch">
        {(Object.keys(KIND_LABEL) as EventKind[]).map((kind) => {
          const on = !hiddenKinds.has(kind);
          return <Link key={kind} href={toggleKindHref(kind)} className={`calendar-kind-filter calendar-kind-toggle ${on ? "on" : "off"}`} aria-pressed={on}>
            <i className={`calendar-dot ${kindClass(kind)}`} /> {KIND_LABEL[kind]} <span className="calendar-kind-switch" />
          </Link>;
        })}
      </nav>
      <div className="calendar-body">
        <div>
          {view === "month" ? <><div className="calendar-grid">
            {WEEKDAYS.map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}
            {cells.map((date, index) => {
              if (!date) return <div className="calendar-cell blank" key={`blank-${index}`} />;
              const dayEvents = eventsByDate.get(date) ?? [];
              const holiday=holidayForDate(date); const nonWorking=`${holiday?"holiday":""} ${isSunday(date)?"sunday":""}`.trim();
              return <div className={`calendar-cell ${nonWorking} ${date === today ? "today" : ""}`} key={date}>
                <div className="calendar-day-number">{Number(date.slice(-2))}</div>{holiday?<><div className="calendar-holiday-name" title={holiday.note?`${holiday.name} · ${holiday.note}`:holiday.name}>{holiday.name}</div>{holiday.note?<div className="calendar-holiday-note">{holiday.note}</div>:null}</>:null}
                {dayEvents.slice(0, 4).map((event) => renderEvent(event))}
                {dayEvents.length > 4 ? <div className="calendar-more">+{dayEvents.length - 4} mốc khác</div> : null}
              </div>;
            })}
          </div>

          <div className="calendar-mobile-agenda">
            {Array.from({ length: daysInMonth }, (_, i) => `${selected.year}-${pad(selected.month)}-${pad(i + 1)}`).map((date) => {
              const dayEvents = eventsByDate.get(date) ?? []; const holiday=holidayForDate(date);
              if (!dayEvents.length && !holiday) return null;
              return <div className="calendar-agenda-row" key={date}><div className="calendar-agenda-date">{formatShortDate(date).slice(0, 5)}</div><div className="calendar-agenda-items">{holiday?<div className="calendar-agenda-item plan"><strong>{holiday.name}</strong><small>{holiday.note||"Ngày nghỉ"}</small></div>:null}{dayEvents.map((event) => renderEvent(event, true))}</div></div>;
            })}
            {!monthEvents.length ? <div className="empty-state compact"><strong>Tháng này chưa có mốc nào.</strong><p>Khi Action, báo cáo, giám sát hoặc công việc định kỳ được tạo, lịch sẽ tự tổng hợp ở đây.</p></div> : null}
          </div></> : null}

          {view === "week" ? <div className="calendar-week-grid">
            {weekDates.map((date) => {
              const dayEvents = eventsByDate.get(date) ?? [];
              const holiday = holidayForDate(date); const nonWorking = `${holiday ? "holiday" : ""} ${isSunday(date) ? "sunday" : ""}`.trim();
              return <div className={`calendar-week-col ${nonWorking} ${date === today ? "today" : ""}`} key={date}>
                <div className="calendar-week-col-head"><strong>{WEEKDAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]}</strong><span>{formatShortDate(date).slice(0, 5)}</span></div>
                {holiday ? <div className="calendar-holiday-name" title={holiday.note ? `${holiday.name} · ${holiday.note}` : holiday.name}>{holiday.name}</div> : null}
                {dayEvents.length ? dayEvents.map((event) => renderEvent(event)) : <div className="calendar-week-empty">Không có mốc</div>}
              </div>;
            })}
          </div> : null}

          {view === "quarter" ? <div className="calendar-mini-month-grid quarter">{quarterMonthList.map((m) => renderMiniMonth(m.year, m.month))}</div> : null}
          {view === "year" ? <div className="calendar-mini-month-grid year">{yearMonthList.map((m) => renderMiniMonth(m.year, m.month))}</div> : null}
        </div>
        <aside className="calendar-legend-side">
          <h3>Chú giải · {periodLabel}</h3>
          {(Object.keys(KIND_LABEL) as EventKind[]).map((kind) => <div className="calendar-legend-side-row" key={kind}><span><i className={`calendar-dot ${kindClass(kind)}`} />{KIND_LABEL[kind]}</span><b>{kindCounts.get(kind) ?? 0}</b></div>)}
        </aside>
      </div>
    </section>

    <section className="panel">
      <div className="calendar-section-head"><div><strong>Sổ tay QLCL · Công việc định kỳ</strong><div><span>Lịch nhắc vận hành; không phải Action/CAPA.</span></div></div><span>{activeTemplates.length} công việc đang bật</span></div>
      {activeTemplates.length ? <div className="calendar-recurrence-grid">{activeTemplates.map((template: any) => <article className="calendar-recurrence-card" key={template.id}><div className="cadence">{cadenceLabel(template.recurrence_rule)}</div><strong>{template.title}</strong><small>Ưu tiên {priorityText(template.priority)}{template.end_date ? ` · đến ${formatShortDate(template.end_date)}` : ""}</small></article>)}</div> : <div className="empty-state compact"><strong>Chưa có công việc định kỳ được kích hoạt.</strong><p>Khi cấu hình Sổ tay QLCL, lịch sẽ tự tổng hợp ở đây.</p></div>}
    </section>
  </div>;
}
