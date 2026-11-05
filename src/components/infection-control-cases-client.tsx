"use client";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

type Department = { id: string; name: string };
type CaseStatus = "NGHI_NGO" | "XAC_NHAN" | "DA_XU_LY";

type Case = {
  id: string;
  department_id: string | null;
  patient_code: string | null;
  detected_date: string;
  infection_site: string;
  pathogen: string | null;
  related_procedure: string | null;
  status: CaseStatus;
  notes: string | null;
};

type Form = {
  id?: string;
  department_id: string;
  patient_code: string;
  detected_date: string;
  infection_site: string;
  pathogen: string;
  related_procedure: string;
  status: CaseStatus;
  notes: string;
};

const STATUS_LABEL: Record<CaseStatus, string> = { NGHI_NGO: "Nghi ngờ", XAC_NHAN: "Xác nhận", DA_XU_LY: "Đã xử lý" };
const STATUS_TONE: Record<CaseStatus, string> = { NGHI_NGO: "warning", XAC_NHAN: "danger", DA_XU_LY: "muted" };

const EMPTY: Form = { department_id: "", patient_code: "", detected_date: "", infection_site: "", pathogen: "", related_procedure: "", status: "NGHI_NGO", notes: "" };

function toForm(c: Case): Form {
  return {
    id: c.id, department_id: c.department_id || "", patient_code: c.patient_code || "", detected_date: c.detected_date,
    infection_site: c.infection_site, pathogen: c.pathogen || "", related_procedure: c.related_procedure || "",
    status: c.status, notes: c.notes || "",
  };
}

export function InfectionControlCasesClient({ departments, initialCases, canManage }: { departments: Department[]; initialCases: Case[]; canManage: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const departmentName = (id: string | null) => (id ? departments.find((d) => d.id === id)?.name : null) || "—";

  const kpis = useMemo(() => {
    const total = initialCases.length;
    const byStatus: Record<CaseStatus, number> = { NGHI_NGO: 0, XAC_NHAN: 0, DA_XU_LY: 0 };
    for (const c of initialCases) byStatus[c.status]++;
    return { total, byStatus };
  }, [initialCases]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialCases;
    return initialCases.filter((c) =>
      [c.infection_site, c.pathogen, c.patient_code, departments.find((d) => d.id === c.department_id)?.name].some((v) => (v || "").toLowerCase().includes(q))
    );
  }, [initialCases, search, departments]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.detected_date) return setMessage({ tone: "error", text: "Vui lòng chọn ngày phát hiện." });
    if (!form.infection_site.trim()) return setMessage({ tone: "error", text: "Vui lòng nhập vị trí nhiễm khuẩn." });
    setBusy(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {
        department_id: form.department_id || null,
        patient_code: form.patient_code.trim() || null,
        detected_date: form.detected_date,
        infection_site: form.infection_site.trim(),
        pathogen: form.pathogen.trim() || null,
        related_procedure: form.related_procedure.trim() || null,
        status: form.status,
        notes: form.notes.trim() || null,
      };
      const res = await fetch(form.id ? `/api/infection-control/cases/${form.id}` : "/api/infection-control/cases", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không thể lưu ca nhiễm khuẩn.");
      setMessage({ tone: "success", text: form.id ? "Đã cập nhật." : "Đã ghi nhận ca nhiễm khuẩn." });
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
          <div className="kpi-tile"><span>Tổng số ca</span><strong>{kpis.total}</strong></div>
          <div className="kpi-tile"><span>Nghi ngờ</span><strong>{kpis.byStatus.NGHI_NGO}</strong></div>
          <div className="kpi-tile"><span>Xác nhận</span><strong>{kpis.byStatus.XAC_NHAN}</strong></div>
          <div className="kpi-tile"><span>Đã xử lý</span><strong>{kpis.byStatus.DA_XU_LY}</strong></div>
        </div>
      </section>
      <section className="panel">
        <div className="toolbar">
          <div className="toolbar-left">
            <div className="search-box">
              <Icon name="search" size={18} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo vị trí nhiễm khuẩn, tác nhân, khoa..." />
            </div>
          </div>
          {canManage ? (
            <button className="button primary" onClick={() => { setForm({ ...EMPTY }); setMessage(null); }}>
              <Icon name="plus" size={18} /> Ghi nhận ca mới
            </button>
          ) : null}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ngày phát hiện</th>
                <th>Khoa</th>
                <th>Vị trí nhiễm khuẩn</th>
                <th>Tác nhân</th>
                <th>Thủ thuật liên quan</th>
                <th>Mã bệnh nhân</th>
                <th>Trạng thái</th>
                <th>Ghi chú</th>
                {canManage ? <th></th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.detected_date.split("-").reverse().join("/")}</td>
                  <td>{departmentName(c.department_id)}</td>
                  <td><strong>{c.infection_site}</strong></td>
                  <td>{c.pathogen || "—"}</td>
                  <td>{c.related_procedure || "—"}</td>
                  <td>{c.patient_code || "—"}</td>
                  <td><span className={`status-badge ${STATUS_TONE[c.status]}`}>{STATUS_LABEL[c.status]}</span></td>
                  <td>{c.notes || "—"}</td>
                  {canManage ? (
                    <td>
                      <button className="button tertiary small" onClick={() => { setForm(toForm(c)); setMessage(null); }}>
                        <Icon name="pencil" size={15} /> Sửa
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={canManage ? 9 : 8}><div className="empty-state">Chưa có ca nhiễm khuẩn nào phù hợp.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {form ? (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={submit}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">{form.id ? "CẬP NHẬT" : "GHI NHẬN MỚI"}</div>
                <h2>{form.id ? form.infection_site : "Ca nhiễm khuẩn bệnh viện"}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => !busy && setForm(null)}><Icon name="x" /></button>
            </div>
            <div className="modal-body">
              {message ? <div className={`alert ${message.tone}`}>{message.text}</div> : null}
              <div className="form-stack">
                <div className="form-grid two">
                  <label>Ngày phát hiện *<input type="date" value={form.detected_date} onChange={(e) => setForm({ ...form, detected_date: e.target.value })} /></label>
                  <label>
                    Khoa/phòng
                    <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                      <option value="">— Chưa chọn —</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </label>
                  <label className="span-2">Vị trí nhiễm khuẩn *<input value={form.infection_site} onChange={(e) => setForm({ ...form, infection_site: e.target.value })} placeholder="Vd: Nhiễm khuẩn vết mổ, Viêm phổi bệnh viện, Nhiễm khuẩn tiết niệu..." /></label>
                  <label>Tác nhân gây bệnh<input value={form.pathogen} onChange={(e) => setForm({ ...form, pathogen: e.target.value })} /></label>
                  <label>Thủ thuật/phẫu thuật liên quan<input value={form.related_procedure} onChange={(e) => setForm({ ...form, related_procedure: e.target.value })} /></label>
                  <label>Mã bệnh nhân (nếu có)<input value={form.patient_code} onChange={(e) => setForm({ ...form, patient_code: e.target.value })} placeholder="Mã nội bộ, không ghi tên/CCCD" /></label>
                  <label>
                    Trạng thái
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CaseStatus })}>
                      {(Object.keys(STATUS_LABEL) as CaseStatus[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
                    </select>
                  </label>
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
        @media(max-width:760px){.ttbyt-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
      `}</style>
    </>
  );
}
