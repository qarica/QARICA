import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { routeForRecord } from "@/lib/record-route";

const RECORD_TYPE_LABELS: Record<string, string> = {
  INCIDENT: "Sự cố y khoa",
  CAPA: "CAPA",
  FINDING: "Finding",
  RISK: "Rủi ro",
  FMEA: "FMEA",
  AUDIT: "Audit",
  ASSESSMENT: "Tự đánh giá",
  INSPECTION: "Tiếp đoàn",
  ACTION: "Action",
  IMPROVEMENT_PROJECT: "Đề án cải tiến",
  IMPROVEMENT_PROPOSAL: "Đề xuất cải tiến",
  DIRECTIVE: "Chỉ đạo",
  REPORT: "Nghĩa vụ báo cáo",
  FEEDBACK: "Phản ánh",
  SAFETY_ALERT: "Bài học/Cảnh báo",
};

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ ok: true, results: [] });

  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ ok: true, results: [] });

  const escaped = q.replace(/[%_]/g, (m) => `\\${m}`);
  const { data, error } = await admin
    .from("records")
    .select("id,record_type,record_code,title")
    .eq("organization_id", organizationId)
    .or(`title.ilike.%${escaped}%,record_code.ilike.%${escaped}%`)
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const results = (data ?? []).map((r: any) => ({
    id: r.id,
    label: RECORD_TYPE_LABELS[r.record_type] || r.record_type,
    title: r.title,
    code: r.record_code,
    href: routeForRecord(r.record_type, r.id),
  }));

  return NextResponse.json({ ok: true, results });
}
