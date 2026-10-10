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

  // q trước đây chỉ escape wildcard ILIKE (%,_) rồi nhúng thẳng vào chuỗi thô
  // của .or() — nhưng cú pháp .or() của PostgREST dùng dấu phẩy để NGĂN CÁCH
  // nhiều điều kiện và dấu nháy kép để bọc giá trị, nên q chứa dấu phẩy/nháy
  // kép có thể CHÈN THÊM điều kiện OR tùy ý (vd lọc theo lifecycle_status/
  // record_type khác) trên bảng records — dù vẫn bị khoanh trong
  // organization_id của người gọi (.eq ở ngoài AND với cả nhóm .or), đây vẫn
  // là lỗi không trung hòa đúng input trước khi dựng câu lọc. Bọc giá trị
  // trong dấu nháy kép theo đúng quy tắc PostgREST (escape \ và " bên trong)
  // để dấu phẩy/nháy kép trong nội dung tìm kiếm không còn phá cú pháp lọc.
  const ilikeEscaped = q.replace(/[\\%_]/g, (m) => `\\${m}`);
  const orQuoted = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const pattern = orQuoted(`%${ilikeEscaped}%`);
  const { data, error } = await admin
    .from("records")
    .select("id,record_type,record_code,title")
    .eq("organization_id", organizationId)
    .or(`title.ilike.${pattern},record_code.ilike.${pattern}`)
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
