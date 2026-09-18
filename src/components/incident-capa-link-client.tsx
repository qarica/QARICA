"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type State = {
  can_create: boolean;
  linked_capa: { id: string; code: string; status: string } | null;
  rca_required: boolean;
  rca_ready: boolean;
};

export function IncidentCapaLinkClient({ recordId }: { recordId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/incidents/${recordId}/capa`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Không đọc được trạng thái CAPA.");
      setState(json as State);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không đọc được trạng thái CAPA.");
    }
  }, [recordId]);

  useEffect(() => { void load(); }, [load]);

  async function createCapa() {
    if (busy || !state?.can_create) return;
    if (!window.confirm("Tạo CAPA liên kết từ sự cố này? CAPA phù hợp khi cần xử lý nguyên nhân hệ thống/lặp lại/nghiêm trọng và phải đánh giá hiệu lực.")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/incidents/${recordId}/capa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Không tạo được CAPA từ sự cố.");
      await load();
      router.refresh();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không tạo được CAPA từ sự cố.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="incident-capa-link">
      <style>{`
        .incident-capa-link{border:1px solid #dce7ef;border-radius:12px;background:#f8fbfe;padding:12px}
        .incident-capa-link .icl-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .incident-capa-link h3{margin:0;font-size:13px;color:#173b64}
        .incident-capa-link p{margin:4px 0 0;color:#64748b;font-size:10px;line-height:1.45;max-width:760px}
      `}</style>
      {error ? <div className="alert error">{error}</div> : null}
      <div className="icl-row">
        <div>
          <h3>CAPA từ sự cố</h3>
          <p>Dùng Action cho việc cụ thể. Dùng CAPA khi cần Corrective + Preventive Action và đánh giá hiệu lực sau triển khai.</p>
        </div>
        {state?.linked_capa ? (
          <Link className="button secondary small" href={`/capa/${state.linked_capa.id}`}>
            Mở {state.linked_capa.code}
          </Link>
        ) : state?.can_create ? (
          <button type="button" className="button primary small" disabled={busy} onClick={createCapa}>
            {busy ? "Đang tạo…" : "Tạo CAPA từ sự cố"}
          </button>
        ) : (
          <span className="muted" style={{ fontSize: 10 }}>
            {state?.rca_required && !state?.rca_ready ? "Hoàn tất RCA trước khi tạo CAPA." : "CAPA chưa khả dụng ở trạng thái/quyền hiện tại."}
          </span>
        )}
      </div>
    </div>
  );
}
