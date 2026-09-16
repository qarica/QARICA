import { NextResponse } from "next/server";
import { buildMonitoringCsv, exportFileName } from "@/lib/monitoring-export";
import { createClient } from "@/lib/supabase/server";

const RESULT_LABELS: Record<string, string> = {
  PASS: "Đạt",
  FAIL: "Không đạt",
  NA: "/",
  NOT_ASSESSED: "Chưa đánh giá",
};

function formatDateTime(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const [{ data: canView }, { data: canPerform }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: "monitoring.view" }),
    supabase.rpc("has_permission", { p_permission_code: "monitoring.perform" }),
    supabase.rpc("has_permission", { p_permission_code: "checklists.manage" }),
  ]);
  if (!canView && !canPerform && !canManage) {
    return NextResponse.json({ error: "Bạn không có quyền xuất bảng kiểm." }, { status: 403 });
  }

  const { data: round, error: roundError } = await supabase.from("monitoring_rounds")
    .select("id,record_id,checklist_version_id,scheduled_date,target_area,workflow_status")
    .eq("id", id).maybeSingle();
  if (roundError) return NextResponse.json({ error: roundError.message }, { status: 400 });
  if (!round) return NextResponse.json({ error: "Không tìm thấy đợt giám sát." }, { status: 404 });

  const [recordRes, versionRes, responsesRes, itemsRes, sectionsRes] = await Promise.all([
    supabase.from("records").select("record_code,title").eq("id", round.record_id).maybeSingle(),
    supabase.from("checklist_versions").select("checklist_template_id,version_no").eq("id", round.checklist_version_id).maybeSingle(),
    supabase.from("checklist_responses").select("checklist_item_id,result_status,score,note,answer_value,answered_at").eq("monitoring_round_id", round.id),
    supabase.from("checklist_items").select("id,section_id,content,sequence_no").eq("checklist_version_id", round.checklist_version_id),
    supabase.from("checklist_sections").select("id,title,sequence_no").eq("checklist_version_id", round.checklist_version_id),
  ]);
  const firstError = [recordRes, versionRes, responsesRes, itemsRes, sectionsRes].find((result) => result.error)?.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 400 });

  const version = versionRes.data as any;
  const { data: template, error: templateError } = version?.checklist_template_id
    ? await supabase.from("checklist_templates").select("code,name").eq("id", version.checklist_template_id).maybeSingle()
    : { data: null, error: null };
  if (templateError) return NextResponse.json({ error: templateError.message }, { status: 400 });

  const responseMap = new Map((responsesRes.data ?? []).map((response: any) => [response.checklist_item_id, response]));
  const sectionMap = new Map((sectionsRes.data ?? []).map((section: any) => [section.id, section]));
  const rows = (itemsRes.data ?? []).map((item: any) => ({
    item,
    section: sectionMap.get(item.section_id) as any,
    response: responseMap.get(item.id) as any,
  }))
    .sort((a: any, b: any) => Number(a.section?.sequence_no ?? 0) - Number(b.section?.sequence_no ?? 0) || Number(a.item.sequence_no ?? 0) - Number(b.item.sequence_no ?? 0))
    .map(({ item, section, response }: any) => {
      const correction = response?.answer_value?.correction;
      const recheck = correction?.recheck_result;
      return {
        section: section?.title || "—",
        content: item.content,
        result: RESULT_LABELS[response?.result_status] || response?.result_status || "Chưa đánh giá",
        score: response?.score,
        note: response?.note,
        correction: correction?.description,
        recheckResult: recheck === "PASS" ? "Đạt sau khắc phục" : recheck === "FAIL" ? "Vẫn không đạt" : "",
        answeredAt: formatDateTime(response?.answered_at),
      };
    });

  const record = recordRes.data as any;
  const csv = buildMonitoringCsv([
    ["Mã hồ sơ", record?.record_code || ""],
    ["Tên đợt giám sát", record?.title || ""],
    ["Bảng kiểm", (template as any)?.name || ""],
    ["Phiên bản", version?.version_no || ""],
    ["Ngày giám sát", round.scheduled_date || ""],
    ["Khu vực đánh giá", round.target_area || ""],
    ["Trạng thái", round.workflow_status || ""],
  ], rows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(record?.record_code)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
