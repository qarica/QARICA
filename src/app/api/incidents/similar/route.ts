import { NextResponse } from "next/server";
import { rankBySimilarity } from "@/lib/text-similarity";
import { isOperationallyHiddenStatus } from "@/lib/operational-record";
import { createClient } from "@/lib/supabase/server";

// Gợi ý sự cố có thể trùng/tương tự khi đang soạn báo cáo mới — chỉ để người
// báo cáo TỰ xem lại, không tự động chặn hay gộp hồ sơ. So khớp bằng lexical
// similarity (xem src/lib/text-similarity.ts), không phải AI/semantic.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const text = String((body as any).text || "").trim();
  const workYear = Number((body as any).work_year) || new Date().getFullYear();
  const departmentId = (body as any).department_id ? String((body as any).department_id) : null;

  if (text.length < 8) return NextResponse.json({ items: [] });

  const [{ data: records }, { data: incidents }, { data: departments }] = await Promise.all([
    supabase.from("records").select("id,record_code,title,lifecycle_status").eq("record_type", "INCIDENT").eq("work_year", workYear),
    supabase.from("incidents").select("id,record_id,summary,occurred_at,incident_location_department_id"),
    supabase.from("departments").select("id,name,short_name"),
  ]);

  const recordMap = new Map(
    (records ?? []).filter((r: any) => !isOperationallyHiddenStatus(r.lifecycle_status)).map((r: any) => [r.id, r]),
  );
  const depMap = new Map((departments ?? []).map((d: any) => [d.id, d.short_name || d.name]));

  const candidates = (incidents ?? [])
    .filter((x: any) => recordMap.has(x.record_id) && String(x.summary || "").trim().length >= 8)
    .filter((x: any) => !departmentId || x.incident_location_department_id === departmentId)
    .map((x: any) => ({
      record_id: x.record_id as string,
      record_code: recordMap.get(x.record_id)?.record_code as string,
      title: recordMap.get(x.record_id)?.title as string,
      occurred_at: x.occurred_at as string | null,
      department: (depMap.get(x.incident_location_department_id) || "Chưa xác định") as string,
      __text: x.summary as string,
    }));

  const ranked = rankBySimilarity(text, candidates, (c) => c.__text, { limit: 5, minScore: 0.12 });
  return NextResponse.json({
    items: ranked.map((r) => ({ record_id: r.record_id, record_code: r.record_code, title: r.title, occurred_at: r.occurred_at, department: r.department, similarity: r.similarity })),
  });
}
