"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Domain = {
  id: string;
  organization_id?: string | null;
  code: string;
  name: string;
  description?: string | null;
  sort_order?: number | null;
};

export function RecordQualityDomainsClient({ recordId, canManage }: { recordId: string; canManage: boolean }) {
  const router = useRouter();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/records/${recordId}/quality-domains`, { cache: "no-store" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Không tải được lĩnh vực chất lượng/an toàn.");
        if (!active) return;
        setDomains(Array.isArray(result.domains) ? result.domains : []);
        setSelected(Array.isArray(result.selected_domain_ids) ? result.selected_domain_ids.map(String) : []);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Không tải được lĩnh vực chất lượng/an toàn.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [recordId]);

  const selectedDomains = useMemo(() => domains.filter((domain) => selected.includes(domain.id)), [domains, selected]);

  function toggle(id: string, checked: boolean) {
    setSelected((current) => checked ? Array.from(new Set([...current, id])) : current.filter((value) => value !== id));
    setNotice("");
  }

  async function save() {
    if (saving || !canManage) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/records/${recordId}/quality-domains`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain_ids: selected }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Không lưu được phân loại.");
      setNotice("Đã cập nhật lĩnh vực chất lượng/an toàn dùng chung.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được phân loại.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="panel quality-domain-panel">
    <style>{`.quality-domain-panel{padding:16px 18px}.quality-domain-panel .qd-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.quality-domain-panel h2{margin:0;font-size:17px}.quality-domain-panel .qd-help{margin:5px 0 0;color:#64748b;font-size:12px;max-width:780px;line-height:1.45}.quality-domain-panel .qd-selected{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.quality-domain-panel .qd-chip{border:1px solid #cbdde1;background:#f7fbfc;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:750;color:#31515b}.quality-domain-panel .qd-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:14px}.quality-domain-panel .qd-item{display:flex;gap:9px;align-items:flex-start;border:1px solid #dfe8ea;border-radius:11px;padding:10px;background:#fff}.quality-domain-panel .qd-item input{width:auto;margin-top:2px}.quality-domain-panel .qd-item strong{display:block;font-size:12px}.quality-domain-panel .qd-item span{display:block;color:#687a80;font-size:10px;line-height:1.35;margin-top:2px}.quality-domain-panel .qd-actions{display:flex;justify-content:flex-end;margin-top:12px}.quality-domain-panel .qd-empty{margin-top:12px;color:#718087;font-size:12px}@media(max-width:760px){.quality-domain-panel .qd-grid{grid-template-columns:1fr}}`}</style>
    <div className="qd-head"><div><h2>Lĩnh vực chất lượng & an toàn</h2><p className="qd-help">Phân loại dùng chung giữa Sự cố, CAPA, Rủi ro, FMEA, Chỉ số và Cải tiến để tổng hợp chéo module. QARICA vẫn hoạt động độc lập, không phụ thuộc HIS/EMR.</p></div></div>
    {error ? <div className="alert error" style={{marginTop:10}}>{error}</div> : null}
    {notice ? <div className="alert success" style={{marginTop:10}}>{notice}</div> : null}
    {loading ? <div className="qd-empty">Đang tải phân loại…</div> : <>
      {selectedDomains.length ? <div className="qd-selected">{selectedDomains.map((domain) => <span className="qd-chip" key={domain.id}>{domain.name}</span>)}</div> : <div className="qd-empty">Chưa gắn lĩnh vực dùng chung cho hồ sơ này.</div>}
      {canManage ? <><div className="qd-grid">{domains.map((domain) => <label className="qd-item" key={domain.id}><input type="checkbox" checked={selected.includes(domain.id)} onChange={(event) => toggle(domain.id, event.target.checked)} /><span><strong>{domain.name}</strong>{domain.description ? <span>{domain.description}</span> : null}</span></label>)}</div><div className="qd-actions"><button className="button secondary" type="button" disabled={saving} onClick={save}>{saving ? "Đang lưu…" : "Lưu phân loại"}</button></div></> : null}
    </>}
  </section>;
}
