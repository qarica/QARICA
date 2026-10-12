import { NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-auth";

/** Grounding-only retrieval. Never use an admin/service-role client to fetch private notes. */
export async function POST(request: Request) {
  const auth = await requireApiContext();
  if (!auth.ok) return auth.response;

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Dữ liệu yêu cầu không hợp lệ." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  if (typeof input.question !== "string") {
    return NextResponse.json({ error: "Câu hỏi phải là văn bản." }, { status: 400 });
  }
  const question = input.question.trim();
  if (question.length < 2 || question.length > 500) {
    return NextResponse.json({ error: "Câu hỏi phải dài từ 2 đến 500 ký tự." }, { status: 400 });
  }

  // PostgREST runs this query as the authenticated user, under knowledge_notes RLS.
  const { data, error } = await auth.supabase
    .from("knowledge_notes")
    .select("id,title,content,note_type,visibility,journal_date,created_at")
    .eq("status", "ACTIVE")
    .textSearch("search_document", question, { type: "websearch", config: "simple" })
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    console.error("[ai-brain/retrieve] knowledge lookup failed:", error.message);
    return NextResponse.json({ error: "Không thể truy xuất nguồn tri thức." }, { status: 503 });
  }
  const sources = (data ?? []).map((note) => ({
    id: note.id,
    title: note.title,
    excerpt: String(note.content ?? "").slice(0, 1200),
    note_type: note.note_type,
    visibility: note.visibility,
    journal_date: note.journal_date,
    created_at: note.created_at,
  }));
  return NextResponse.json({
    ok: true,
    mode: "grounded_retrieval",
    question,
    answer: sources.length
      ? "Đã tìm thấy nguồn liên quan. Chưa tạo câu trả lời bằng mô hình AI; vui lòng kiểm tra các nguồn bên dưới."
      : "Chưa tìm thấy nguồn đủ căn cứ để trả lời trong dữ liệu bạn có quyền truy cập.",
    sources,
    generated: false,
  });
}
