"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

type ItemOption = { id: string; option_code: string; option_label: string; option_value: string };
type Item = { id: string; content: string; answer_type: string | null; allow_na: boolean; options: ItemOption[] };
type Section = { id: string; title: string; items: Item[] };

export function GenericChecklistRunClient({
  roundId,
  sections,
  assessorName,
  canPerform,
  initialMonitoringDate,
}: {
  templateId: string;
  versionId: string;
  roundId: string;
  sections: Section[];
  assessorName: string | null;
  canPerform: boolean;
  initialMonitoringDate?: string | null;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [staffName, setStaffName] = useState(assessorName || "");
  const [monitoringDate, setMonitoringDate] = useState(initialMonitoringDate || "");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  if (!canPerform) return null;

  const allItems = sections.flatMap((s) => s.items);

  function setAnswer(itemId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [itemId]: value }));
  }

  // Với câu SINGLE_CHOICE: option_value cao nhất = PASS, thấp nhất = FAIL, ở giữa = PARTIAL.
  function resolveResultStatus(item: Item, chosenValue: string): { result: string; score: number | null } {
    if (item.answer_type === "SINGLE_CHOICE" && item.options.length) {
      const chosen = item.options.find((o) => o.option_code === chosenValue);
      const numeric = item.options.map((o) => Number(o.option_value)).filter((n) => !Number.isNaN(n));
      const max = numeric.length ? Math.max(...numeric) : null;
      const min = numeric.length ? Math.min(...numeric) : null;
      const value = chosen ? Number(chosen.option_value) : null;
      if (value === null || Number.isNaN(value)) return { result: "NA", score: null };
      if (max !== null && value === max) return { result: "PASS", score: value };
      if (min !== null && value === min) return { result: "FAIL", score: value };
      return { result: "PARTIAL", score: value };
    }
    if (chosenValue === "NA") return { result: "NA", score: null };
    return { result: chosenValue === "PASS" ? "PASS" : "FAIL", score: chosenValue === "PASS" ? 1 : 0 };
  }

  async function submit() {
    if (!monitoringDate) return setMessage({ tone: "error", text: "Vui lòng chọn ngày giám sát." });
    if (!staffName.trim()) return setMessage({ tone: "error", text: "Vui lòng nhập người thực hiện." });
    if (!subject.trim()) return setMessage({ tone: "error", text: "Vui lòng nhập khoa/phòng hoặc đối tượng được đánh giá." });
    const missing = allItems.find((item) => !answers[item.id]);
    if (missing) return setMessage({ tone: "error", text: `Vui lòng đánh giá đầy đủ nội dung: “${missing.content}”.` });

    setBusy(true);
    setMessage(null);
    try {
      const responses = allItems.map((item) => {
        const chosen = answers[item.id];
        const { result, score } = resolveResultStatus(item, chosen);
        return {
          item_id: item.id,
          result,
          score,
          chosen_option: chosen,
          note: notes[item.id]?.trim() || null,
        };
      });
      const res = await fetch(`/api/monitoring/rounds/${roundId}/generic-results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monitoring_date: monitoringDate,
          staff_name: staffName.trim(),
          subject: subject.trim(),
          responses,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể lưu kết quả bảng kiểm.");
      setMessage({ tone: "success", text: "Đã lưu kết quả bảng kiểm." });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Có lỗi xảy ra." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div className="eyebrow">THỰC HIỆN GIÁM SÁT</div>
        <h2 style={{ margin: "5px 0 6px" }}>Nhập kết quả chấm điểm</h2>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10 }}>
        <label><span>Ngày giám sát</span><input type="date" value={monitoringDate} onChange={(e) => setMonitoringDate(e.target.value)} /></label>
        <label><span>Người thực hiện</span><input value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Họ và tên" /></label>
        <label><span>Khoa/phòng hoặc đối tượng được đánh giá</span><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ví dụ: Khoa Nội tổng hợp" /></label>
      </div>

      {sections.map((section) => (
        <div key={section.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="detail-label">{section.title}</div>
          {section.items.map((item) => (
            <div key={item.id} className="panel" style={{ padding: 12, background: "#fbfdfd" }}>
              <div style={{ marginBottom: 8, fontSize: 13 }}>{item.content}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {item.answer_type === "SINGLE_CHOICE" && item.options.length
                  ? item.options.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`button small ${answers[item.id] === opt.option_code ? "primary" : "secondary"}`}
                        onClick={() => setAnswer(item.id, opt.option_code)}
                      >
                        {opt.option_label}
                      </button>
                    ))
                  : [
                      { code: "PASS", label: "Đạt" },
                      { code: "FAIL", label: "Không đạt" },
                      ...(item.allow_na ? [{ code: "NA", label: "Không áp dụng" }] : []),
                    ].map((opt) => (
                      <button
                        key={opt.code}
                        type="button"
                        className={`button small ${answers[item.id] === opt.code ? "primary" : "secondary"}`}
                        onClick={() => setAnswer(item.id, opt.code)}
                      >
                        {opt.label}
                      </button>
                    ))}
              </div>
              <input
                style={{ marginTop: 8, width: "100%" }}
                placeholder="Ghi chú (không bắt buộc)"
                value={notes[item.id] || ""}
                onChange={(e) => setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      ))}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="button primary" disabled={busy} onClick={submit}>
          <Icon name="check-square" size={16} /> {busy ? "Đang lưu..." : "Lưu kết quả"}
        </button>
      </div>
      {message ? <div className={`alert ${message.tone}`}>{message.text}</div> : null}
    </section>
  );
}
