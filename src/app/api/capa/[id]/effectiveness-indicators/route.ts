import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { id: recordId } = await params;
  const { data: capaRecord } = await supabase.from("records").select("id").eq("id", recordId).eq("record_type", "CAPA").maybeSingle();
  if (!capaRecord) return NextResponse.json({ error: "Không tìm thấy CAPA hoặc ngoài phạm vi truy cập." }, { status: 404 });

  const { data: records, error: recordError } = await supabase
    .from("records")
    .select("id,record_code,title,updated_at")
    .eq("record_type", "INDICATOR_MEASUREMENT")
    .in("lifecycle_status", ["ACTIVE", "CLOSED"])
    .order("updated_at", { ascending: false })
    .limit(80);
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
