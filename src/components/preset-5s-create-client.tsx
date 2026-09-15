"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

type Department = { id: string; name: string; short_name: string | null };

export function Preset5SCreateClient({ departments, canManage }: { departments: Department[]; canManage: boolean }) {
  const router = useRouter();
  const suggested = useMemo(() => departments.find((d) => /qlcl/i.test(`${d.name} ${d.short_name || ""}`))?.id || departments[0]?.id || "", [departments]);
  const [departmentId, setDepartmentId] = useState(suggested);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  if (!canManage) return null;

  async function createPreset() {
    if (!departmentId) return setMessage({ tone: "error", text: "Vui lòng chọn đơn vị quản lý bảng kiểm." });
    setBusy(true); setMessage(null);
    try {
      const res = await fetch("/api/monitoring/templates/preset-5s-external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_department_id: departmentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể tạo bảng kiểm 5S.");
      setMessage({ tone: "success", text: data.existing ? "Bảng kiểm 5S đã tồn tại. Đang mở mẫu hiện có…" : "Đã tạo bảng kiểm 5S đúng theo biểu mẫu nguồn. Đang mở để rà soát…" });
      router.refresh();
      setTimeout(() => { if (data.id) router.push(`/monitoring/templates/${data.id}`); }, 300);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Có lỗi xảy ra." });
    } finally { setBusy(false); }
  }

  return <section className="panel preset5s-card">
    <style>{`
      .preset5s-card{padding:14px 15px!important;background:linear-gradient(180deg,#fff 0%,#fcfefe 100%);overflow:visible!important}
      .preset5s-layout{display:grid;grid-template-columns:auto minmax(0,1fr) minmax(330px,390px);gap:14px;align-items:center}
      .preset5s-icon{width:44px;height:44px;border-radius:13px;background:#faeef1;color:#7a2740;display:flex;align-items:center;justify-content:center;flex:0 0 auto;border:1px solid #d7e1ed}
      .preset5s-copy{min-width:0}
      .preset5s-copy h2{margin:3px 0 4px;font-size:17px;line-height:1.2;letter-spacing:-.01em}
      .preset5s-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
      .preset5s-meta span{display:inline-flex;align-items:center;padding:3px 7px;border-radius:999px;background:#f2f6f6;color:#617076;font-size:10px;font-weight:700}
      .preset5s-controls{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}
      .preset5s-controls label{margin:0;min-width:0}
      .preset5s-controls select{min-height:37px}
      .preset5s-controls .button{min-height:37px;white-space:nowrap}
      @media(max-width:980px){.preset5s-layout{grid-template-columns:auto minmax(0,1fr)}.preset5s-controls{grid-column:1/-1;padding-left:58px}}
      @media(max-width:680px){.preset5s-layout{grid-template-columns:1fr}.preset5s-icon{display:none}.preset5s-controls{grid-column:auto;padding-left:0;grid-template-columns:1fr}.preset5s-copy h2{font-size:16px}}
    `}</style>
    <div className="preset5s-layout">
      <div className="preset5s-icon"><Icon name="check-square" size={21} /></div>
      <div className="preset5s-copy">
        <div className="eyebrow">MẪU CHUẨN · BK01.V1_QLCL.QĐ.06</div>
        <h2>Bảng kiểm 5S · Khu vực bên ngoài bệnh viện</h2>
        <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.35 }}>Mẫu số hóa từ biểu mẫu nguồn, sẵn sàng mở để quản lý phiên bản hoặc tạo đợt giám sát.</div>
        <div className="preset5s-meta"><span>05 tiêu chuẩn</span><span>10 tiêu chí</span><span>08 khu vực + Khác</span><span>Đạt · Không đạt · “/”</span></div>
      </div>
      <div className="preset5s-controls">
        <label><span>Đơn vị quản lý</span><select value={departmentId} disabled={busy} onChange={(e) => setDepartmentId(e.target.value)}><option value="">— Chọn đơn vị —</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <button className="button primary" disabled={busy || !departmentId} onClick={createPreset}><Icon name="check-square" size={16} /> {busy ? "Đang mở..." : "Mở bảng kiểm 5S"}</button>
      </div>
    </div>
    {message ? <div className={`alert ${message.tone}`} style={{ marginTop: 10 }}>{message.text}</div> : null}
  </section>;
}
