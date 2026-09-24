import { NextResponse } from "next/server";
import { rankBySimilarity } from "@/lib/text-similarity";
import { createClient } from "@/lib/supabase/server";

// Gợi ý sự cố tương tự đã có RCA hoàn tất, kèm nguyên nhân gốc của chúng, để
// người điều tra tham khảo khi phân tích RCA cho sự cố hiện tại. So khớp bằng
// lexical similarity trên phần mô tả sự cố (không phải AI/semantic) — chỉ là
// gợi ý tham khảo, không thay thế phân tích RCA của chính sự cố này.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: recordId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const { data: record } = await supabase.from("records").select("id").eq("id", recordId).eq("record_type", "INCIDENT").maybeSingle();
  if (!record) return NextResponse.json({ error: "Không tìm thấy sự cố hoặc ngoài phạm vi truy cập." }, { status: 404 });

  const { data: incident } = await supabase.from("incidents").select("id,summary").eq("record_id", recordId).maybeSingle();
  if (!incident) return NextResponse.json({ items: [] });

  const currentText = String(incident.summary || "").trim();
  if (currentText.length < 8) return NextResponse.json({ items: [] });

  const { data: completedAnalyses } = await supabase
    .from("rca_analyses")
    .select("id,incident_id")
    .eq("status", "COMPLETED")
    .neq("incident_id", incident.id);
  const analyses = completedAnalyses ?? [];
  if (!analyses.length) return NextResponse.json({ items: [] });

  const incidentIds = Array.from(new Set(analyses.map((a: any) => a.incident_id)));
  const { data: candidateIncidents } = await supabase.from("incidents").select("id,record_id,summary").in("id", incidentIds);
  const recordIds = Array.from(new Set((candidateIncidents ?? []).map((x: any) => x.record_id)));
  const { data: candidateRecords } = recordIds.length
    ? await supabase.from("records").select("id,record_code,title").in("id", recordIds)
    : { data: [] as any[] };
  const { data: rootCauses } = await supabase
    .from("rca_root_causes")
    .select("rca_analysis_id,category_code,cause_statement")
    .in("rca_analysis_id", analyses.map((a: any) => a.id));

  const recordMap = new Map((candidateRecords ?? []).map((r: any) => [r.id, r]));
  const incidentTextMap = new Map((candidateIncidents ?? []).map((x: any) => [x.id, x]));
  const rootsByIncident = new Map<string, { category_code: string | null; cause_statement: string }[]>();
  for (const analysis of analyses) {
    const incId = analysis.incident_id;
    const roots = (rootCauses ?? [])
      .filter((r: any) => r.rca_analysis_id === analysis.id)
      .map((r: any) => ({ category_code: r.category_code, cause_statement: r.cause_statement }));
    if (roots.length) rootsByIncident.set(incId, [...(rootsByIncident.get(incId) ?? []), ...roots]);
  }

  const candidates = Array.from(incidentTextMap.values())
    .filter((x: any) => String(x.summary || "").trim().length >= 8 && recordMap.has(x.record_id) && rootsByIncident.has(x.id))
    .map((x: any) => ({
      record_id: x.record_id as string,
      record_code: recordMap.get(x.record_id)?.record_code as string,
      title: recordMap.get(x.record_id)?.title as string,
      root_causes: rootsByIncident.get(x.id) ?? [],
      __text: x.summary as string,
    }));

  const ranked = rankBySimilarity(currentText, candidates, (c) => c.__text, { limit: 3, minScore: 0.1 });
  return NextResponse.json({
    items: ranked.map((r) => ({ record_id: r.record_id, record_code: r.record_code, title: r.title, root_causes: r.root_causes, similarity: r.similarity })),
  });
}
