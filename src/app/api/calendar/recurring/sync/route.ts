import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Template = {
  id: string;
  title: string;
  description: string | null;
  recurrence_rule: string;
  start_date: string | null;
  end_date: string | null;
  due_offset_days: number;
  lead_department_id: string | null;
  assignee_user_id: string | null;
  expected_result: string | null;
  evidence_requirement: string | null;
  priority: string;
  automation_kind: "ACTION" | "MONITORING" | "REPORT";
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

function hcmToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

function occurrences(template: Template, from: string, to: string) {
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
    return results;
  }

  return [] as string[];
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("plans.manage");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const horizonDays = Math.max(1, Math.min(365, Number(body.horizon_days || 90)));
  const today = hcmToday();
  const horizonEnd = addDays(today, horizonDays);
  const admin = createAdminClient();

  const { data: caller, error: callerError } = await admin.from("profiles").select("organization_id").eq("user_id", auth.user.id).maybeSingle();
  if (callerError || !caller?.organization_id) return NextResponse.json({ error: callerError?.message || "Tài khoản chưa gắn bệnh viện." }, { status: 400 });

  const { data: templateRows, error: templateError } = await admin
    .from("recurring_work_templates")
    .select("id,title,description,recurrence_rule,start_date,end_date,due_offset_days,lead_department_id,assignee_user_id,expected_result,evidence_requirement,priority,automation_kind")
    .eq("organization_id", caller.organization_id)
    .eq("is_active", true);
  if (templateError) return NextResponse.json({ error: templateError.message }, { status: 400 });

  const templates = (templateRows ?? []) as Template[];
  const templateIds = templates.map((template) => template.id);
  const existingByKey = new Map<string, any>();
  if (templateIds.length) {
    const { data: existingRuns, error: runsError } = await admin
      .from("recurring_work_runs")
      .select("id,template_id,period_key,planned_date,generated_action_id,generated_output_record_id,status")
      .in("template_id", templateIds)
      .gte("planned_date", today)
      .lte("planned_date", horizonEnd);
    if (runsError) return NextResponse.json({ error: runsError.message }, { status: 400 });
    for (const run of existingRuns ?? []) existingByKey.set(`${(run as any).template_id}:${(run as any).period_key}`, run);
  }

  let createdActions = 0;
  let createdMonitoringRounds = 0;
  let createdReports = 0;
  let existingRunsCount = 0;
  let skippedTemplates = 0;
  let errors = 0;
  const errorDetails: string[] = [];
  let plannedTotal = 0;

  for (const template of templates) {
    if (!template.start_date || !template.lead_department_id || !template.assignee_user_id || !template.expected_result || !template.evidence_requirement) {
      skippedTemplates += 1;
      continue;
    }
    const dates = occurrences(template, today, horizonEnd);
    if (!dates.length) {
      const knownRule = /^(FREQ=DAILY|FREQ=WEEKLY|FREQ=MONTHLY|FREQ=YEARLY)/.test(template.recurrence_rule);
      if (!knownRule) skippedTemplates += 1;
      continue;
    }
    plannedTotal += dates.length;
    if (plannedTotal > 1000) return NextResponse.json({ error: "Số kỳ cần sinh vượt 1.000. Hãy giảm khoảng đồng bộ hoặc số mẫu đang bật." }, { status: 409 });

    for (const plannedDate of dates) {
      const periodKey = plannedDate;
      const key = `${template.id}:${periodKey}`;
      let run = existingByKey.get(key);
      if (run?.generated_action_id || ["SKIPPED", "CANCELLED", "COMPLETED"].includes(String(run?.status || "").toUpperCase())) {
        existingRunsCount += 1;
        continue;
      }

      if (!run) {
        const inserted = await admin.from("recurring_work_runs").insert({
          template_id: template.id,
          period_key: periodKey,
          planned_date: plannedDate,
          status: "PENDING",
        }).select("id,template_id,period_key,planned_date,generated_action_id,status").maybeSingle();
        if (inserted.error || !inserted.data) {
          const fallback = await admin.from("recurring_work_runs").select("id,template_id,period_key,planned_date,generated_action_id,generated_output_record_id,status").eq("template_id", template.id).eq("period_key", periodKey).maybeSingle();
          if (fallback.error || !fallback.data) {
            errors += 1;
            if (errorDetails.length < 10) errorDetails.push(`${template.title} · ${plannedDate}: ${inserted.error?.message || fallback.error?.message || "Không tạo được run"}`);
            continue;
          }
          run = fallback.data;
          existingRunsCount += 1;
          if (run.generated_action_id || String(run.status || "").toUpperCase() !== "PENDING") continue;
        } else {
          run = inserted.data;
          existingByKey.set(key, run);
        }
      } else {
        existingRunsCount += 1;
      }

      const materialized = await admin.rpc("qlcl_materialize_recurring_run_v3", {
        p_run_id: run.id,
        p_actor_user_id: auth.user.id,
      });

      if (materialized.error || !materialized.data?.ok) {
        errors += 1;
        if (errorDetails.length < 10) errorDetails.push(`${template.title} · ${plannedDate}: ${materialized.error?.message || "Không sinh được công việc định kỳ"}`);
        continue;
      }

      if (!materialized.data.already_generated) {
        createdActions += 1;
        if (materialized.data.output_record_id && template.automation_kind === "MONITORING") createdMonitoringRounds += 1;
        if (materialized.data.output_record_id && template.automation_kind === "REPORT") createdReports += 1;
      } else {
        existingRunsCount += 1;
      }
      existingByKey.set(key, {
        ...run,
        generated_action_id: materialized.data.action_id || run.generated_action_id,
        generated_output_record_id: materialized.data.output_record_id || run.generated_output_record_id,
        status: "GENERATED",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    from: today,
    to: horizonEnd,
    created_actions: createdActions,
    created_monitoring_rounds: createdMonitoringRounds,
    created_reports: createdReports,
    existing_runs: existingRunsCount,
    skipped_templates: skippedTemplates,
    errors,
    error_details: errorDetails,
  });
}
