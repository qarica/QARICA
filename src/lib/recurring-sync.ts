type RecurringTemplate = {
  id: string;
  title: string;
  recurrence_rule: string;
  start_date: string | null;
  end_date: string | null;
  lead_department_id: string | null;
  assignee_user_id: string | null;
  expected_result: string | null;
  evidence_requirement: string | null;
};

const DAY_CODE: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function parseIso(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function iso(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDays(value: string, days: number) {
  const date = parseIso(value);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

function lastDayOfMonth(year: number, monthOneBased: number) {
  return new Date(Date.UTC(year, monthOneBased, 0)).getUTCDate();
}

function dayInMonth(year: number, monthOneBased: number, requested: number) {
  return Math.min(Math.max(requested, 1), lastDayOfMonth(year, monthOneBased));
}

function nthWeekday(year: number, monthOneBased: number, weekday: number, nth: number) {
  const first = new Date(Date.UTC(year, monthOneBased - 1, 1));
  const delta = (weekday - first.getUTCDay() + 7) % 7;
  const day = 1 + delta + (nth - 1) * 7;
  return day <= lastDayOfMonth(year, monthOneBased) ? day : null;
}

export function hcmToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

export function recurringOccurrences(template: RecurringTemplate, from: string, to: string) {
  if (!template.start_date) return [] as string[];
  const start = template.start_date > from ? template.start_date : from;
  const hardEnd = template.end_date && template.end_date < to ? template.end_date : to;
  if (start > hardEnd) return [] as string[];

  const rule = template.recurrence_rule;
  const results: string[] = [];
  const accept = (candidate: string) => {
    if (candidate >= template.start_date! && candidate >= start && candidate <= hardEnd) results.push(candidate);
  };

  if (/^FREQ=DAILY;INTERVAL=1$/.test(rule)) {
    let cursor = start;
    while (cursor <= hardEnd) {
      accept(cursor);
      cursor = addDays(cursor, 1);
    }
    return results;
  }

  const weekly = rule.match(/^FREQ=WEEKLY;INTERVAL=1;BYDAY=(MO|TU|WE|TH|FR|SA|SU)$/);
  if (weekly) {
    const weekday = DAY_CODE[weekly[1]];
    let cursor = start;
    while (cursor <= hardEnd) {
      if (parseIso(cursor).getUTCDay() === weekday) accept(cursor);
      cursor = addDays(cursor, 1);
    }
    return results;
  }

  const monthlyWeek = rule.match(/^FREQ=MONTHLY;INTERVAL=1;BYDAY=(MO|TU|WE|TH|FR|SA|SU);BYSETPOS=([1-4])$/);
  if (monthlyWeek) {
    const first = parseIso(template.start_date);
    const end = parseIso(hardEnd);
    let monthIndex = first.getUTCFullYear() * 12 + first.getUTCMonth();
    const endIndex = end.getUTCFullYear() * 12 + end.getUTCMonth();
    for (; monthIndex <= endIndex; monthIndex += 1) {
      const year = Math.floor(monthIndex / 12);
      const month0 = monthIndex % 12;
      const day = nthWeekday(year, month0 + 1, DAY_CODE[monthlyWeek[1]], Number(monthlyWeek[2]));
      if (day) accept(`${year}-${String(month0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }
    return results;
  }

  const monthlyDate = rule.match(/^FREQ=MONTHLY;INTERVAL=(1|3);BYMONTHDAY=([1-9]|[12]\d|3[01])$/);
  if (monthlyDate) {
    const interval = Number(monthlyDate[1]);
    const requestedDay = Number(monthlyDate[2]);
    const anchor = parseIso(template.start_date);
    const end = parseIso(hardEnd);
    const anchorIndex = anchor.getUTCFullYear() * 12 + anchor.getUTCMonth();
    const endIndex = end.getUTCFullYear() * 12 + end.getUTCMonth();
    for (let monthIndex = anchorIndex; monthIndex <= endIndex; monthIndex += interval) {
      const year = Math.floor(monthIndex / 12);
      const month0 = monthIndex % 12;
      const day = dayInMonth(year, month0 + 1, requestedDay);
      accept(`${year}-${String(month0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }
    return results;
  }

  const yearly = rule.match(/^FREQ=YEARLY;INTERVAL=1;BYMONTH=([1-9]|1[0-2]);BYMONTHDAY=([1-9]|[12]\d|3[01])$/);
  if (yearly) {
    const month = Number(yearly[1]);
    const requestedDay = Number(yearly[2]);
    const firstYear = parseIso(template.start_date).getUTCFullYear();
    const endYear = parseIso(hardEnd).getUTCFullYear();
    for (let year = firstYear; year <= endYear; year += 1) {
      const day = dayInMonth(year, month, requestedDay);
      accept(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }
  }

  return results;
}

export type RecurringSyncResult = {
  ok: boolean;
  createdActions: number;
  createdMonitoringRounds: number;
  createdReports: number;
  existing?: number;
  errors: number;
  error?: string;
  errorDetails?: string[];
  horizonEnd?: string;
  skipped?: boolean;
};

export async function syncRecurringTemplateNow(input: {
  admin: any;
  templateId: string;
  organizationId: string;
  actorUserId: string;
  horizonDays?: number;
}): Promise<RecurringSyncResult> {
  const { admin, templateId, organizationId, actorUserId } = input;
  const horizonDays = Math.max(1, Math.min(365, Number(input.horizonDays || 90)));
  const today = hcmToday();
  const horizonEnd = addDays(today, horizonDays);

  const { data: template, error: templateError } = await admin
    .from("recurring_work_templates")
    .select("id,title,recurrence_rule,start_date,end_date,lead_department_id,assignee_user_id,expected_result,evidence_requirement,is_active,automation_kind")
    .eq("id", templateId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (templateError || !template) return { ok: false, createdActions: 0, createdMonitoringRounds: 0, createdReports: 0, errors: 1, error: templateError?.message || "Không tìm thấy mẫu định kỳ." };
  if (!template.is_active) return { ok: true, createdActions: 0, createdMonitoringRounds: 0, createdReports: 0, errors: 0, skipped: true };
  if (!template.start_date || !template.lead_department_id || !template.assignee_user_id || !template.expected_result || !template.evidence_requirement) {
    return { ok: false, createdActions: 0, createdMonitoringRounds: 0, createdReports: 0, errors: 1, error: "Mẫu định kỳ chưa đủ dữ liệu để đồng bộ lịch." };
  }

  const dates = recurringOccurrences(template as RecurringTemplate, today, horizonEnd);
  if (dates.length > 400) return { ok: false, createdActions: 0, createdMonitoringRounds: 0, createdReports: 0, errors: 1, error: "Số kỳ của một mẫu vượt 400 trong khoảng đồng bộ." };

  const { data: existingRows, error: existingError } = await admin
    .from("recurring_work_runs")
    .select("id,template_id,period_key,planned_date,generated_action_id,generated_output_record_id,status")
    .eq("template_id", templateId)
    .gte("planned_date", today)
    .lte("planned_date", horizonEnd);
  if (existingError) return { ok: false, createdActions: 0, createdMonitoringRounds: 0, createdReports: 0, errors: 1, error: existingError.message };

  const byKey = new Map((existingRows || []).map((row: any) => [String(row.period_key), row]));
  let createdActions = 0;
  let createdMonitoringRounds = 0;
  let createdReports = 0;
  let existing = 0;
  const errors: string[] = [];

  for (const plannedDate of dates) {
    let run: any = byKey.get(plannedDate);
    if (run?.generated_action_id || ["SKIPPED", "CANCELLED", "COMPLETED"].includes(String(run?.status || "").toUpperCase())) {
      existing += 1;
      continue;
    }

    if (!run) {
      const inserted = await admin.from("recurring_work_runs").insert({
        template_id: templateId,
        period_key: plannedDate,
        planned_date: plannedDate,
        status: "PENDING",
      }).select("id,template_id,period_key,planned_date,generated_action_id,generated_output_record_id,status").maybeSingle();
      if (inserted.error || !inserted.data) {
        const fallback = await admin.from("recurring_work_runs")
          .select("id,template_id,period_key,planned_date,generated_action_id,generated_output_record_id,status")
          .eq("template_id", templateId).eq("period_key", plannedDate).maybeSingle();
        if (fallback.error || !fallback.data) {
          errors.push(`${plannedDate}: ${inserted.error?.message || fallback.error?.message || "Không tạo được kỳ lịch"}`);
          continue;
        }
        run = fallback.data;
      } else {
        run = inserted.data;
      }
      byKey.set(plannedDate, run);
    }

    if (run.generated_action_id || String(run.status || "").toUpperCase() !== "PENDING") {
      existing += 1;
      continue;
    }

    const materialized = await admin.rpc("qlcl_materialize_recurring_run_v4", {
      p_run_id: run.id,
      p_actor_user_id: actorUserId,
    });
    if (materialized.error || !materialized.data?.ok) {
      errors.push(`${plannedDate}: ${materialized.error?.message || "Không sinh được kỳ công việc"}`);
      continue;
    }

    if (!materialized.data.already_generated) {
      createdActions += 1;
      if (materialized.data.output_record_id && template.automation_kind === "MONITORING") createdMonitoringRounds += 1;
      if (materialized.data.output_record_id && template.automation_kind === "REPORT") createdReports += 1;
    } else {
      existing += 1;
    }
  }

  return {
    ok: errors.length === 0,
    createdActions,
    createdMonitoringRounds,
    createdReports,
    existing,
    errors: errors.length,
    errorDetails: errors.slice(0, 10),
    horizonEnd,
  };
}
