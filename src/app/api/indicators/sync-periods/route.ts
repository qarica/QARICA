import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { expectedIndicatorPeriods } from "@/lib/indicator-periods";
import { createAdminClient } from "@/lib/supabase/admin";

function hcmToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("indicators.enter");
  if (!auth.ok) return auth.response;
  const actorUserId = actorUserId;

  const body = await request.json().catch(() => ({}));
  const today = hcmToday();
  const requestedYear = Number(body.work_year || today.slice(0, 4));
  if (!Number.isInteger(requestedYear) || requestedYear < 2000 || requestedYear > 2100) {
    return NextResponse.json({ error: "Năm vận hành không hợp lệ." }, { status: 400 });
  }

  const throughDate = typeof body.through_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.through_date)
    ? body.through_date
    : today;

  const admin = createAdminClient();
  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("user_id", actorUserId)
    .eq("is_active", true)
    .maybeSingle();
  if (callerError || !caller?.organization_id) {
    return NextResponse.json({ error: callerError?.message || "Tài khoản chưa gắn tổ chức." }, { status: 400 });
  }
  const organizationId = caller.organization_id;

  const { data: assignmentsRaw, error: assignmentsError } = await admin
    .from("indicator_assignments")
    .select("id,indicator_version_id,department_id,collector_user_id,work_year,frequency,status,active_from,active_to,auto_create_periods,source_reference")
    .eq("work_year", requestedYear)
    .eq("status", "ACTIVE")
    .eq("auto_create_periods", true);
  if (assignmentsError) return NextResponse.json({ error: assignmentsError.message }, { status: 400 });

  const assignments = assignmentsRaw ?? [];
  const versionIds = Array.from(new Set(assignments.map((row: any) => row.indicator_version_id).filter(Boolean)));
  const { data: versionsRaw, error: versionsError } = versionIds.length
    ? await admin.from("indicator_definition_versions").select("id,indicator_definition_id,unit").in("id", versionIds)
    : { data: [], error: null };
  if (versionsError) return NextResponse.json({ error: versionsError.message }, { status: 400 });

  const versionMap = new Map((versionsRaw ?? []).map((row: any) => [row.id, row]));
  const definitionIds = Array.from(new Set((versionsRaw ?? []).map((row: any) => row.indicator_definition_id).filter(Boolean)));
  const { data: definitionsRaw, error: definitionsError } = definitionIds.length
    ? await admin.from("indicator_definitions").select("id,organization_id,code,name,is_active").in("id", definitionIds)
    : { data: [], error: null };
  if (definitionsError) return NextResponse.json({ error: definitionsError.message }, { status: 400 });

  const definitionMap = new Map((definitionsRaw ?? []).map((row: any) => [row.id, row]));
  const assignmentIds = assignments.map((row: any) => row.id);
  const { data: existingRaw, error: existingError } = assignmentIds.length
    ? await admin.from("indicator_measurements").select("id,indicator_assignment_id,period_start,period_end,record_id").in("indicator_assignment_id", assignmentIds)
    : { data: [], error: null };
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 400 });

  const existing = new Set((existingRaw ?? []).map((row: any) => `${row.indicator_assignment_id}:${row.period_start}:${row.period_end}`));
  let created = 0;
  let alreadyExists = 0;
  let skipped = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  type Candidate = {
    assignment: any;
    definition: any;
    period: { key: string; label: string; start: string; end: string };
    key: string;
  };
  const candidates: Candidate[] = [];

  for (const assignment of assignments as any[]) {
    const version = versionMap.get(assignment.indicator_version_id) as any;
    const definition = version ? definitionMap.get(version.indicator_definition_id) as any : null;
    if (!version || !definition || !definition.is_active || (definition.organization_id && definition.organization_id !== organizationId)) {
      skipped += 1;
      continue;
    }
    if (!assignment.active_from) {
      skipped += 1;
      continue;
    }

    const periods = expectedIndicatorPeriods({
      workYear: Number(assignment.work_year),
      frequency: assignment.frequency,
      activeFrom: assignment.active_from,
      activeTo: assignment.active_to,
      throughDate,
    });

    for (const period of periods) {
      const key = assignment.id + ":" + period.start + ":" + period.end;
      if (existing.has(key)) {
        alreadyExists += 1;
        continue;
      }
      candidates.push({ assignment, definition, period, key });
    }
  }

  async function materialize(candidate: Candidate) {
    const { assignment, definition, period, key } = candidate;
    const { data: recordCode, error: codeError } = await admin.rpc("next_record_code", {
      p_org: organizationId,
      p_record_type: "INDICATOR_MEASUREMENT",
      p_work_year: Number(assignment.work_year),
    });
    if (codeError || !recordCode) {
      return { kind: "error" as const, detail: (definition.code || definition.name) + " · " + period.label + ": " + (codeError?.message || "Không cấp được mã hồ sơ") };
    }

    const title = (definition.code ? definition.code + " · " : "") + definition.name + " · " + period.label;
    const { data: record, error: recordError } = await admin.from("records").insert({
      organization_id: organizationId,
      record_type: "INDICATOR_MEASUREMENT",
      record_code: recordCode,
      title,
      work_year: Number(assignment.work_year),
      owner_department_id: assignment.department_id,
      owner_user_id: assignment.collector_user_id,
      lifecycle_status: "ACTIVE",
      created_by: actorUserId,
      metadata: {
        origin: "INDICATOR_PERIOD_AUTOMATION",
        indicator_assignment_id: assignment.id,
        indicator_period_key: period.key,
        source_reference: assignment.source_reference,
      },
    }).select("id").single();

    if (recordError || !record) {
      return { kind: "error" as const, detail: (definition.code || definition.name) + " · " + period.label + ": " + (recordError?.message || "Không tạo được hồ sơ") };
    }

    const { data: measurement, error: measurementError } = await admin.from("indicator_measurements").insert({
      record_id: record.id,
      indicator_assignment_id: assignment.id,
      period_start: period.start,
      period_end: period.end,
      source_mode: "SCHEDULED_AUTO",
      workflow_status: "DRAFT",
    }).select("id").single();

    if (measurementError || !measurement) {
      await admin.from("records").update({ lifecycle_status: "ARCHIVED" }).eq("id", record.id);
      if (measurementError?.code === "23505") {
        return { kind: "existing" as const, key };
      }
      return { kind: "error" as const, detail: (definition.code || definition.name) + " · " + period.label + ": " + (measurementError?.message || "Không tạo được kỳ đo") };
    }

    const sideEffects: PromiseLike<unknown>[] = [];
    if (assignment.collector_user_id) {
      sideEffects.push(admin.from("notifications").insert({
        recipient_user_id: assignment.collector_user_id,
        notification_type: "INDICATOR_PERIOD_CREATED",
        priority: "NORMAL",
        title: "Kỳ đo chỉ số đã được tạo",
        message: definition.name + " · " + period.label,
        target_record_id: record.id,
        target_route: "/indicators/measurements/" + record.id,
        notification_event_key: "indicator-period:" + assignment.id + ":" + period.key + ":" + assignment.collector_user_id,
      }));
    }
    sideEffects.push(admin.from("audit_logs").insert({
      actor_user_id: actorUserId,
      record_id: record.id,
      table_name: "indicator_measurements",
      row_id: measurement.id,
      action_type: "AUTO_CREATE_INDICATOR_PERIOD",
      new_value: {
        indicator_assignment_id: assignment.id,
        period_key: period.key,
        period_start: period.start,
        period_end: period.end,
        source_reference: assignment.source_reference,
      },
      request_meta: { source: "qlcl-ui", automation: "indicator-periods-v1" },
    }));
    await Promise.all(sideEffects);

    return { kind: "created" as const, key };
  }

  const CONCURRENCY = 4;
  for (let offset = 0; offset < candidates.length; offset += CONCURRENCY) {
    const batch = candidates.slice(offset, offset + CONCURRENCY);
    const results = await Promise.all(batch.map(materialize));
    for (const result of results) {
      if (result.kind === "created") {
        existing.add(result.key);
        created += 1;
      } else if (result.kind === "existing") {
        existing.add(result.key);
        alreadyExists += 1;
      } else {
        errors += 1;
        if (errorDetails.length < 10) errorDetails.push(result.detail);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    work_year: requestedYear,
    through_date: throughDate,
    configured_assignments: assignments.length,
    created_periods: created,
    existing_periods: alreadyExists,
    skipped_assignments: skipped,
    errors,
    error_details: errorDetails,
  });
}
