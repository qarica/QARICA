import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const COMPLETE = new Set(["COMPLETED", "CANCELLED", "NOT_APPLICABLE"]);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const { id: recordId } = await params;
  const { data: record } = await supabase.from("records").select("id").eq("id", recordId).eq("record_type", "FMEA").maybeSingle();
  if (!record) return NextResponse.json({ error: "Không tìm thấy FMEA hoặc ngoài phạm vi truy cập." }, { status: 404 });

  const admin = createAdminClient();
  const { data: study, error: studyError } = await admin.from("fmea_studies").select("id").eq("record_id", recordId).maybeSingle();
  if (studyError || !study) return NextResponse.json({ error: studyError?.message || "Không tìm thấy nghiên cứu FMEA." }, { status: 404 });

  const { data: steps } = await admin.from("fmea_process_steps").select("id").eq("fmea_study_id", study.id);
  const stepIds = (steps ?? []).map((x: any) => x.id);
  const { data: modes } = stepIds.length ? await admin.from("fmea_failure_modes").select("id,failure_mode,is_high_priority").in("process_step_id", stepIds) : { data: [] as any[] };
  const modeIds = (modes ?? []).map((x: any) => x.id);
  const { data: links, error: linkError } = modeIds.length ? await admin.from("fmea_failure_mode_action_links").select("failure_mode_id,action_record_id").in("failure_mode_id", modeIds) : { data: [] as any[], error: null };
  if (linkError) return NextResponse.json({ error: linkError.message, available: false }, { status: 503 });

  const actionRecordIds = Array.from(new Set((links ?? []).map((x: any) => String(x.action_record_id || "")).filter(Boolean)));
  const [{ data: actions }, { data: records }] = actionRecordIds.length ? await Promise.all([
    admin.from("actions").select("record_id,workflow_status,due_date,priority").in("record_id", actionRecordIds),
    admin.from("records").select("id,record_code,title,lifecycle_status").in("id", actionRecordIds),
  ]) : [{ data: [] }, { data: [] }] as any;

  const actionMap = new Map((actions ?? []).map((x: any) => [String(x.record_id), x]));
  const recordMap = new Map((records ?? []).map((x: any) => [String(x.id), x]));
  const linksByMode = new Map<string, any[]>();
  for (const link of (links ?? []) as any[]) {
    const key = String(link.failure_mode_id);
    const row = { ...(recordMap.get(String(link.action_record_id)) || {}), ...(actionMap.get(String(link.action_record_id)) || {}), record_id: String(link.action_record_id) };
    const list = linksByMode.get(key) || []; list.push(row); linksByMode.set(key, list);
  }

  return NextResponse.json({
    available: true,
    modes: (modes ?? []).map((mode: any) => {
      const linked = linksByMode.get(String(mode.id)) || [];
      return {
        failure_mode_id: String(mode.id),
        failure_mode: mode.failure_mode,
        high: !!mode.is_high_priority,
        action_count: linked.length,
        incomplete_count: linked.filter((x: any) => !COMPLETE.has(String(x.workflow_status || ""))).length,
        actions: linked.map((x: any) => ({ record_id: x.record_id, record_code: x.record_code, title: x.title, workflow_status: x.workflow_status, due_date: x.due_date, priority: x.priority })),
      };
    }),
  });
}
