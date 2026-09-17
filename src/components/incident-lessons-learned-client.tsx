"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Lesson = {
  id?: string;
  status?: string;
  title?: string | null;
  summary?: string | null;
  learning_points?: string | null;
  recommended_practice?: string | null;
  audience?: string | null;
  deidentified_confirmed?: boolean;
  review_note?: string | null;
  published_at?: string | null;
};

export function IncidentLessonsLearnedClient({ recordId }: { recordId: string }) {
  const router = useRouter();
  const [lesson, setLesson] = useState<Lesson>({});
  const [incidentStatus, setIncidentStatus] = useState("");
  const [editable, setEditable] = useState(false);
  const [canPublish, setCanPublish] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/incidents/${recordId}/lessons-learned`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Không tải được bài học kinh nghiệm.");
      setLesson(json.lesson || {});
      setIncidentStatus(String(json.incident_status || ""));
      setEditable(!!json.editable);
      setCanPublish(!!json.can_publish);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được bài học kinh nghiệm.");
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  useEffect(() => { void load(); }, [load]);

  function patch<K extends keyof Lesson>(key: K, value: Lesson[K]) {
    setLesson((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent, publish = false) {
    event.preventDefault();
    if (busy) return;
    if (publish && !lesson.deidentified_confirmed) {
      setError("Cần xác nhận nội dung đã khử định danh trước khi phát hành.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/incidents/${recordId}/lessons-learned`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: lesson.title || "",
          summary: lesson.summary || "",
          learning_points: lesson.learning_points || "",
          recommended_practice: lesson.recommended_practice || "",
          audience: lesson.audience || "",
          review_note: lesson.review_note || "",
          deidentified_confirmed: !!lesson.deidentified_confirmed,
          publish,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Không lưu được bài học kinh nghiệm.");
      setNotice(json.message || "Đã lưu.");
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được bài học kinh nghiệm.");
    } finally {
      setBusy(false);
    }
  }

  const published = lesson.status === "PUBLISHED";

  return <div className="in-box incident-lessons">
    <style>{`.incident-lessons .lesson-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.incident-lessons .lesson-head h3{margin:0 0 5px}.incident-lessons .lesson-head p{margin:0;max-width:780px}.incident-lessons .lesson-status{padding:6px 9px;border-radius:999px;background:${published ? "#e8f7ee" : "#fff7e6"};color:${published ? "#166534" : "#92400e"};font-size:10px;font-weight:850;white-space:nowrap}.incident-lessons .lesson-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:12px}.incident-lessons .wide{grid-column:1/-1}.incident-lessons label{display:grid;gap:4px;font-size:10px;font-weight:750;color:#44545a}.incident-lessons .lesson-check{display:flex;align-items:flex-start;gap:8px!important;padding:10px;border:1px solid #dfe8ea;border-radius:10px;background:#fbfdfd;font-weight:650}.incident-lessons .lesson-check input{width:auto;margin-top:2px}.incident-lessons .lesson-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:11px}.incident-lessons .lesson-note{margin-top:10px;padding:10px;border-radius:10px;background:#f8fbfc;color:#64748b;font-size:10px}@media(max-width:760px){.incident-lessons .lesson-grid{grid-template-columns:1fr}.incident-lessons .wide{grid-column:auto}.incident-lessons .lesson-head{display:grid}}`}</style>
    <div className="lesson-head"><div><h3>Bài học kinh nghiệm</h3><p>Chuyển kết quả điều tra thành kiến thức an toàn có thể dùng lại. Nội dung phát hành phải được người có thẩm quyền duyệt và xác nhận đã loại thông tin nhận diện người bệnh/nhân viên.</p></div><span className="lesson-status">{published ? "Đã phát hành" : lesson.id ? "Bản nháp" : "Chưa tạo"}</span></div>
    {error ? <div className="alert error" style={{marginTop:10}}>{error}</div> : null}
    {notice ? <div className="alert success" style={{marginTop:10}}>{notice}</div> : null}
    {loading ? <div className="empty-state compact">Đang tải bài học kinh nghiệm...</div> : <form onSubmit={(e) => save(e, false)}>
      <div className="lesson-grid">
        <label className="wide">Tiêu đề<input disabled={!editable || published} value={lesson.title || ""} onChange={(e) => patch("title", e.target.value)} placeholder="Bài học chính cần phổ biến" /></label>
        <label className="wide">Tóm tắt sự kiện đã khử định danh<textarea rows={3} disabled={!editable || published} value={lesson.summary || ""} onChange={(e) => patch("summary", e.target.value)} placeholder="Chỉ giữ thông tin cần thiết để hiểu nguy cơ và hệ thống; không ghi tên, mã người bệnh hoặc dữ liệu nhận diện." /></label>
        <label className="wide">Bài học rút ra<textarea rows={4} disabled={!editable || published} value={lesson.learning_points || ""} onChange={(e) => patch("learning_points", e.target.value)} placeholder="Điều hệ thống cần ghi nhớ từ sự cố này" /></label>
        <label className="wide">Thực hành/biện pháp được khuyến nghị<textarea rows={4} disabled={!editable || published} value={lesson.recommended_practice || ""} onChange={(e) => patch("recommended_practice", e.target.value)} placeholder="Hành vi, quy trình hoặc kiểm soát cần áp dụng" /></label>
        <label>Đối tượng áp dụng<input disabled={!editable || published} value={lesson.audience || ""} onChange={(e) => patch("audience", e.target.value)} placeholder="Ví dụ: Điều dưỡng toàn viện, Khoa Cấp cứu" /></label>
        <label>Ghi chú duyệt<textarea rows={2} disabled={!editable || published} value={lesson.review_note || ""} onChange={(e) => patch("review_note", e.target.value)} /></label>
        <label className="wide lesson-check"><input type="checkbox" disabled={!editable || published} checked={!!lesson.deidentified_confirmed} onChange={(e) => patch("deidentified_confirmed", e.target.checked)} /><span>Tôi xác nhận nội dung dùng để phổ biến đã được rà soát và không còn thông tin nhận diện người bệnh/nhân viên không cần thiết.</span></label>
      </div>
      <div className="lesson-note">Trạng thái sự cố: <strong>{incidentStatus || "—"}</strong>. Có thể lưu bản nháp trong giai đoạn theo dõi; chỉ được phát hành sau khi sự cố đã đóng và người có quyền đóng sự cố duyệt.</div>
      {!published && editable ? <div className="lesson-actions"><button className="button secondary" type="submit" disabled={busy}>{busy ? "Đang lưu…" : "Lưu bản nháp"}</button>{canPublish ? <button className="button primary" type="button" disabled={busy || !lesson.deidentified_confirmed} onClick={(e) => void save(e, true)}>Duyệt & phát hành</button> : null}</div> : null}
      {published && lesson.published_at ? <div className="lesson-note">Đã phát hành lúc {new Date(lesson.published_at).toLocaleString("vi-VN")}.</div> : null}
    </form>}
  </div>;
}
