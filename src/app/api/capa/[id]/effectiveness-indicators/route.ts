import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function getVisibleCapa(supabase: any, recordId: string) {
  return supabase.from("records").select("id,lifecycle_status").eq("id", recordId).eq("record_type", "CAPA").maybeSingle();
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { id: recordId } = await params;
  const { data: capaRecord } = await getVisibleCapa(supabase, recordId);
  if (!capaRecord) return NextResponse.json({ error: "Không tìm thấy CAPA hoặc ngoài phạm vi truy cập." }, { status: 404 });

  const { data: records, error: recordError } = await supabase
    .from("records")
    .select("id,record_code,title,updated_at")
    .eq("record_type", "INDICATOR_MEASUREMENT")
    .in("lifecycle_status", ["ACTIVE", "CLOSED"])
    .order("updated_at", { ascending: false });
  if (recordError) return NextResponse.json({ error: recordError.message }, { status: 400 });
  const ids = (records ?? []).map((x: any) => x.id);
  if (!ids.length) return NextResponse.json({ items: [] });

  const { data: measurements, error: measurementError } = await supabase
    .from("indicator_measurements")
    .select("record_id,period_start,period_end,calculated_value,raw_value,result_level,workflow_status")
    .in("record_id", ids)
    .in("workflow_status", ["VERIFIED", "LOCKED"])
    .order("period_end", { ascending: false });
  if (measurementError) return NextResponse.json({ error: measurementError.message }, { status: 400 });
  const measurementMap = new Map((measurements ?? []).map((x: any) => [x.record_id, x]));
  const items = (records ?? []).flatMap((record: any) => {
    const measurement: any = measurementMap.get(record.id);
    if (!measurement) return [];
    return [{
      record_id: record.id,
      label: `${record.record_code} · ${record.title}`,
      period_start: measurement.period_start,
      period_end: measurement.period_end,
      value: measurement.calculated_value ?? measurement.raw_value,
      result_level: measurement.result_level,
      workflow_status: measurement.workflow_status,
    }];
  });
  return NextResponse.json({ items });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: "capa.manage" });
  if (!allowed) return NextResponse.json({ error: "Bạn chưa có quyền quản lý CAPA." }, { status: 403 });
  const { id: recordId } = await params;
  const { data: capaRecord } = await getVisibleCapa(supabase, recordId);
  if (!capaRecord) return NextResponse.json({ error: "Không tìm thấy CAPA hoặc ngoài phạm vi truy cập." }, { status: 404 });
  if (capaRecord.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "CAPA không còn hoạt động." }, { status: 409 });

  const body: any = await request.json().catch(() => ({}));
  const requested = Array.from(new Set((Array.isArray(body.indicator_record_ids) ? body.indicator_record_ids : []).map((x: unknown) => String(x || "").trim()).filter(Boolean)));
  if (!requested.length) return NextResponse.json({ ok: true, linked: 0, message: "Không chọn kỳ đo chỉ số để liên kết." });

  const { data: visibleRecords, error: recordError } = await supabase.from("records").select("id").in("id", requested).eq("record_type", "INDICATOR_MEASUREMENT");
  if (recordError) return NextResponse.json({ error: recordError.message }, { status: 400 });
  const visibleIds = (visibleRecords ?? []).map((x: any) => x.id);
  if (visibleIds.length !== requested.length) return NextResponse.json({ error: "Có kỳ đo không tồn tại hoặc ngoài phạm vi truy cập." }, { status: 403 });

  const { data: measurements, error: measurementError } = await supabase.from("indicator_measurements").select("record_id,workflow_status").in("record_id", visibleIds);
  if (measurementError) return NextResponse.json({ error: measurementError.message }, { status: 400 });
  const acceptable = new Set((measurements ?? []).filter((x: any) => ["VERIFIED", "LOCKED"].includes(String(x.workflow_status))).map((x: any) => x.record_id));
  if (acceptable.size !== requested.length) return NextResponse.json({ error: "Chỉ được dùng kỳ đo đã xác minh hoặc đã khóa làm bằng chứng hiệu lực." }, { status: 409 });

  const admin: any = createAdminClient();
  const { data: existing } = await admin.from("record_links").select("target_record_id").eq("source_record_id", recordId).eq("relation_type", "EFFECTIVENESS_EVIDENCE").in("target_record_id", requested);
  const existingIds = new Set((existing ?? []).map((x: any) => x.target_record_id));
  const missing = requested.filter((id) => !existingIds.has(id));
  if (missing.length) {
    const now = new Date().toISOString();
    const { error: linkError } = await admin.from("record_links").insert(missing.map((targetRecordId) => ({
      source_record_id: recordId,
      target_record_id: targetRecordId,
      relation_type: "EFFECTIVENESS_EVIDENCE",
      metadata: { linked_at: now, linked_by: auth.user.id, purpose: "CAPA_EFFECTIVENESS" },
    })));
    if (linkError) return NextResponse.json({ error: linkError.message }, { status: 400 });
  }

  await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    record_id: recordId,
    table_name: "record_links",
    action_type: "CAPA_LINK_EFFECTIVENESS_INDICATORS",
    old_value: { linked_indicator_records: Array.from(existingIds) },
    new_value: { linked_indicator_records: requested },
    reason: "Liên kết kỳ đo chỉ số làm bằng chứng đánh giá hiệu lực CAPA.",
    request_meta: { source: "qlcl-ui" },
  });

  return NextResponse.json({ ok: true, linked: requested.length, added: missing.length, message: `Đã liên kết ${requested.length} kỳ đo chỉ số làm bằng chứng hiệu lực.` });
}
