"use client";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

type Department = { id: string; name: string };
type Profile = { user_id: string; full_name: string | null; email: string | null };

type Audit = {
  id: string;
  department_id: string | null;
  audit_date: string;
  observer_user_id: string | null;
  staff_role: string | null;
  opportunities_observed: number;
  opportunities_compliant: number;
  notes: string | null;
};

type Form = {
  id?: string;
  department_id: string;
  audit_date: string;
  observer_user_id: string;
  staff_role: string;
  opportunities_observed: string;
  opportunities_compliant: string;
  notes: string;
};

// Ngưỡng tham khảo WHO cho tỷ lệ tuân thủ vệ sinh tay: <50% cần cải thiện
// khẩn (đỏ), 50-79% cải thiện (vàng), ≥80% tốt (xanh).
function complianceTone(rate: number): "danger" | "warning" | "success" {
  if (rate < 50) return "danger";
  if (rate < 80) return "warning";
  return "success";
}

const EMPTY: Form = { department_id: "", audit_date: "", observer_user_id: "", staff_role: "", opportunities_observed: "", opportunities_compliant: "", notes: "" };

function toForm(a: Audit): Form {
  return {
    id: a.id, department_id: a.department_id || "", audit_date: a.audit_date, observer_user_id: a.observer_user_id || "",
    staff_role: a.staff_role || "", opportunities_observed: String(a.opportunities_observed), opportunities_compliant: String(a.opportunities_compliant),
    notes: a.notes || "",
  };
}

export function HandHygieneAuditsClient({ departments, profiles, initialAudits, canManage }: { departments: Department[]; profiles: Profile[]; initialAudits: Audit[]; canManage: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const departmentName = (id: string | null) => (id ? departments.find((d) => d.id === id)?.name : null) || "—";
  const profileName = (id: string | null) => { if (!id) return "—"; const p = profiles.find((x) => x.user_id === id); return p?.full_name || p?.email || "—"; };

  const overall = useMemo(() => {
    const observed = initialAudits.reduce((sum, a) => sum + a.opportunities_observed, 0);
    const compliant = initialAudits.reduce((sum, a) => sum + a.opportunities_compliant, 0);
    const rate = observed ? Math.round((compliant / observed) * 100) : 0;
    return { audits: initialAudits.length, observed, compliant, rate };
  }, [initialAudits]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialAudits;
    return initialAudits.filter((a) =>
      [a.staff_role, departments.find((d) => d.id === a.department_id)?.name, profiles.find((p) => p.user_id === a.observer_user_id)?.full_name].some((v) => (v || "").toLowerCase().includes(q))
    );
  }, [initialAudits, search, departments, profiles]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.audit_date) return setMessage({ tone: "error", text: "Vui lòng chọn ngày giám sát." });
    const observed = Number(form.opportunities_observed);
    const compliant = Number(form.opportunities_compliant);
    if (!Number.isInteger(observed) || observed < 0) return setMessage({ tone: "error", text: "Số cơ hội quan sát không hợp lệ." });
    if (!Number.isInteger(compliant) || compliant < 0) return setMessage({ tone: "error", text: "Số lần tuân thủ không hợp lệ." });
    if (compliant > observed) return setMessage({ tone: "error", text: "Số lần tuân thủ không thể lớn hơn số cơ hội quan sát." });
    setBusy(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {
        department_id: form.department_id || null,
        audit_date: form.audit_date,
        observer_user_id: form.observer_user_id || null,
        staff_role: form.staff_role.trim() || null,
        opportunities_observed: observed,
        opportunities_compliant: compliant,
        notes: form.notes.trim() || null,
      };
      const res = await fetch(form.id ? `/api/infection-control/hand-hygiene/${form.id}` : "/api/infection-control/hand-hygiene", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không thể lưu đợt giám sát.");
      setMessage({ tone: "success", text: form.id ? "Đã cập nhật." : "Đã ghi nhận đợt giám sát." });
      router.refresh();
      setTimeout(() => setForm(null), 700);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Có lỗi xảy ra." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="panel">
        <div className="ttbyt-kpis">
          <div className="kpi-tile"><span>Số đợt giám sát</span><strong>{overall.audits}</strong></div>
          <div className="kpi-tile"><span>Tổng cơ hội quan sát</span><strong>{overall.observed}</strong></div>
          <div className="kpi-tile"><span>Tổng lần tuân thủ</span><strong>{overall.compliant}</strong></div>
          <div className="kpi-tile"><span>Tỷ lệ tuân thủ chung</span><strong className={overall.observed ? `compliance-${complianceTone(overall.rate)}` : "compliance-muted"}>{overall.observed ? `${overall.rate}%` : "Chưa có dữ liệu"}</strong></div>
        </div>
      </section>
      <section className="panel">
        <div className="toolbar">
          <div className="toolbar-left">
            <div className="search-box">
              <Icon name="search" size={18} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo khoa, người giám sát, nhóm nhân viên..." />
            </div>
          </div>
          {canManage ? (
            <button className="button primary" onClick={() => { setForm({ ...EMPTY }); setMessage(null); }}>
              <Icon name="plus" size={18} /> Thêm đợt giám sát
            </button>
          ) : null}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ngày giám sát</th>
                <th>Khoa</th>
                <th>Người giám sát</th>
                <th>Nhóm nhân viên</th>
                <th>Cơ hội quan sát</th>
                <th>Lần tuân thủ</th>
                <th>Tỷ lệ tuân thủ</th>
                <th>Ghi chú</th>
                {canManage ? <th></th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const rate = a.opportunities_observed ? Math.round((a.opportunities_compliant / a.opportunities_observed) * 100) : 0;
                return (
                  <tr key={a.id}>
                    <td>{a.audit_date.split("-").reverse().join("/")}</td>
                    <td>{departmentName(a.department_id)}</td>
                    <td>{profileName(a.observer_user_id)}</td>
                    <td>{a.staff_role || "—"}</td>
                    <td>{a.opportunities_observed}</td>
                    <td>{a.opportunities_compliant}</td>
                    <td><span className={`status-badge ${complianceTone(rate)}`}>{rate}%</span></td>
                    <td>{a.notes || "—"}</td>
                    {canManage ? (
                      <td>
                        <button className="button tertiary small" onClick={() => { setForm(toForm(a)); setMessage(null); }}>
                          <Icon name="pencil" size={15} /> Sửa
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {!rows.length ? <tr><td colSpan={canManage ? 9 : 8}><div className="empty-state">Chưa có đợt giám sát nào phù hợp.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {form ? (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={submit}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">{form.id ? "CẬP NHẬT" : "THÊM MỚI"}</div>
                <h2>Đợt giám sát vệ sinh tay</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => !busy && setForm(null)}><Icon name="x" /></button>
            </div>
            <div className="modal-body">
              {message ? <div className={`alert ${message.tone}`}>{message.text}</div> : null}
              <div className="form-stack">
                <div className="form-grid two">
                  <label>Ngày giám sát *<input type="date" value={form.audit_date} onChange={(e) => setForm({ ...form, audit_date: e.target.value })} /></label>
                  <label>
                    Khoa/phòng
                    <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                      <option value="">— Chưa chọn —</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </label>
                  <label>
                    Người giám sát
                    <select value={form.observer_user_id} onChange={(e) => setForm({ ...form, observer_user_id: e.target.value })}>
                      <option value="">— Chưa chọn —</option>
                      {profiles.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email}</option>)}
                    </select>
                  </label>
                  <label>Nhóm nhân viên quan sát<input value={form.staff_role} onChange={(e) => setForm({ ...form, staff_role: e.target.value })} placeholder="Vd: Điều dưỡng, Bác sĩ, Hộ lý..." /></label>
                  <label>Số cơ hội quan sát *<input type="number" min={0} value={form.opportunities_observed} onChange={(e) => setForm({ ...form, opportunities_observed: e.target.value })} /></label>
                  <label>Số lần tuân thủ *<input type="number" min={0} value={form.opportunities_compliant} onChange={(e) => setForm({ ...form, opportunities_compliant: e.target.value })} /></label>
                  <label className="span-2">Ghi chú<textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="button secondary" onClick={() => setForm(null)} disabled={busy}>Hủy</button>
              <button className="button primary" disabled={busy}><Icon name="save" size={17} />{busy ? "Đang lưu..." : "Lưu"}</button>
            </div>
          </form>
        </div>
      ) : null}
      <style>{`
        .ttbyt-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:19px}.ttbyt-kpis>*{min-width:0}
        .ttbyt-kpis .kpi-tile{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:4px}
        .ttbyt-kpis .kpi-tile span{font-size:11px;color:var(--muted);font-weight:700}
        .ttbyt-kpis .kpi-tile strong{font-size:22px}
        .ttbyt-kpis .kpi-tile strong.compliance-success{color:var(--success)}
        .ttbyt-kpis .kpi-tile strong.compliance-warning{color:var(--warning)}
        .ttbyt-kpis .kpi-tile strong.compliance-danger{color:var(--danger)}
        .ttbyt-kpis .kpi-tile strong.compliance-muted{color:var(--muted);font-size:14px}
        @media(max-width:760px){.ttbyt-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
      `}</style>
    </>
  );
}
