"use client";
import { FormEvent, useState } from "react";

type Source = { id: string; title: string; excerpt: string; note_type: string; visibility: string; journal_date: string | null };
type Result = { answer: string; sources: Source[]; generated: boolean; mode: string };

export function AiBrainClient() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || question.trim().length < 2) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/ai-brain/answer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Không thể xử lý câu hỏi.");
      setResult(payload as Result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể xử lý câu hỏi.");
    } finally { setBusy(false); }
  }
  return <section className="work-section" id="ai-brain" style={{display:"grid",gap:12}}>
    <div className="section-head"><div><h2>AI Brain</h2><p>Hỏi trên Knowledge bạn có quyền xem. Câu trả lời kèm nguồn, không tự suy diễn khi thiếu dữ liệu.</p></div></div>
    <form onSubmit={ask} style={{display:"grid",gap:8}}>
      <label htmlFor="ai-brain-question">Câu hỏi</label>
      <textarea id="ai-brain-question" rows={3} value={question} maxLength={500} onChange={event=>setQuestion(event.target.value)} placeholder="Ví dụ: Những bài học đã ghi nhận về quản lý hồ sơ?" required />
      <div><button className="button primary small" disabled={busy || question.trim().length < 2} type="submit">{busy ? "Đang tra cứu..." : "Hỏi AI Brain"}</button></div>
    </form>
    {error ? <p role="alert">{error}</p> : null}
    {result ? <div className="card" style={{padding:16,display:"grid",gap:12}} aria-live="polite">
      <div><strong>{result.generated ? "Tổng hợp từ nguồn" : "Kết quả truy xuất"}</strong><p style={{whiteSpace:"pre-wrap"}}>{result.answer}</p></div>
      <div><strong>Nguồn ({result.sources.length})</strong>
        {result.sources.map((source,index)=><article key={source.id} style={{padding:"10px 0",borderTop:"1px solid var(--border, #ddd)"}}>
          <strong>[{index+1}] {source.title}</strong> <small>· {source.note_type} · {source.visibility}</small>
          <p style={{whiteSpace:"pre-wrap",marginBottom:0}}>{source.excerpt}</p>
        </article>)}
      </div>
    </div> : null}
  </section>;
}
