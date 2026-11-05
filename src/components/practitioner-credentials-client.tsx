"use client";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { buildAssignmentDecisionDraft } from "@/lib/practitioner-credentials";

type Department = { id: string; name: string };
type DocumentType = "DEGREE" | "SPECIALIST_DEGREE" | "CERTIFICATE" | "SCOPE_ADJUSTMENT";
type LicenseType = "GPHN" | "CCHN" | "CCHN_DUOC";
type DecisionStatus = "CHUA_SOAN" | "DA_SOAN" | "DA_KY" | "LUU_HO_SO";

type CredentialDocument = {
  id: string;
  document_type: DocumentType;
  title: string;
  specialization: string | null;
  document_no: string | null;
  issued_at: string | null;
  issued_by: string | null;
  note: string | null;
};

type Credential = {
  id: string;
  department_id: string | null;
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  national_id: string | null;
  phone: string | null;
  email: string | null;
  license_type: LicenseType | null;
  license_number: string | null;
  license_issued_at: string | null;
  license_issued_by: string | null;
  professional_title: string | null;
  display_title: string | null;
  scope_of_practice: string | null;
  scope_adjustment_text: string | null;
  scope_adjustment_decision_no: string | null;
  scope_adjustment_decision_at: string | null;
  scope_adjustment_issued_by: string | null;
  proposed_technique: string | null;
  registration_date: string | null;
  decision_no: string | null;
  decision_signed_at: string | null;
  decision_signed_by: string | null;
  decision_status: DecisionStatus;
  decision_file_url: string | null;
  practice_status_note: string | null;
  license_expiry_date: string | null;
  notes: string | null;
  practitioner_credential_documents: CredentialDocument[];
};

type Form = {
  id?: string;
  department_id: string;
  full_name: string;
  date_of_birth: string;
  gender: string;
  national_id: string;
  phone: string;
  email: string;
  license_type: "" | LicenseType;
  license_number: string;
  license_issued_at: string;
  license_issued_by: string;
  professional_title: string;
  display_title: string;
  scope_of_practice: string;
  scope_adjustment_text: string;
  scope_adjustment_decision_no: string;
  scope_adjustment_decision_at: string;
  scope_adjustment_issued_by: string;
  proposed_technique: string;
  registration_date: string;
  decision_no: string;
  decision_signed_at: string;
  decision_signed_by: string;
  decision_status: DecisionStatus;
  decision_file_url: string;
  practice_status_note: string;
  license_expiry_date: string;
  notes: string;
};

const LICENSE_TYPE_LABEL: Record<LicenseType, string> = {
  GPHN: "Giấy phép hành nghề (GPHN)",
  CCHN: "Chứng chỉ hành nghề (CCHN)",
  CCHN_DUOC: "Chứng chỉ hành nghề Dược",
};
const DECISION_STATUS_LABEL: Record<DecisionStatus, string> = {
  CHUA_SOAN: "Chưa soạn",
  DA_SOAN: "Đã soạn",
  DA_KY: "Đã ký",
  LUU_HO_SO: "Lưu hồ sơ",
};
const DECISION_STATUS_TONE: Record<DecisionStatus, string> = {
  CHUA_SOAN: "muted",
  DA_SOAN: "warning",
  DA_KY: "success",
  LUU_HO_SO: "muted",
};
const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  DEGREE: "Văn bằng chuyên môn",
  SPECIALIST_DEGREE: "Văn bằng chuyên khoa",
  CERTIFICATE: "Chứng chỉ",
  SCOPE_ADJUSTMENT: "QĐ bổ sung/điều chỉnh phạm vi",
};

const EMPTY: Form = {
  department_id: "", full_name: "", date_of_birth: "", gender: "", national_id: "", phone: "", email: "",
  license_type: "", license_number: "", license_issued_at: "", license_issued_by: "",
  professional_title: "", display_title: "", scope_of_practice: "",
  scope_adjustment_text: "", scope_adjustment_decision_no: "", scope_adjustment_decision_at: "", scope_adjustment_issued_by: "",
  proposed_technique: "", registration_date: "",
  decision_no: "", decision_signed_at: "", decision_signed_by: "", decision_status: "CHUA_SOAN", decision_file_url: "",
  practice_status_note: "", license_expiry_date: "", notes: "",
};

function toForm(c: Credential): Form {
  return {
    id: c.id, department_id: c.department_id || "", full_name: c.full_name,
    date_of_birth: c.date_of_birth || "", gender: c.gender || "", national_id: c.national_id || "", phone: c.phone || "", email: c.email || "",
    license_type: c.license_type || "", license_number: c.license_number || "", license_issued_at: c.license_issued_at || "", license_issued_by: c.license_issued_by || "",
    professional_title: c.professional_title || "", display_title: c.display_title || "", scope_of_practice: c.scope_of_practice || "",
    scope_adjustment_text: c.scope_adjustment_text || "", scope_adjustment_decision_no: c.scope_adjustment_decision_no || "",
    scope_adjustment_decision_at: c.scope_adjustment_decision_at || "", scope_adjustment_issued_by: c.scope_adjustment_issued_by || "",
    proposed_technique: c.proposed_technique || "", registration_date: c.registration_date || "",
    decision_no: c.decision_no || "", decision_signed_at: c.decision_signed_at || "", decision_signed_by: c.decision_signed_by || "",
    decision_status: c.decision_status, decision_file_url: c.decision_file_url || "",
    practice_status_note: c.practice_status_note || "", license_expiry_date: c.license_expiry_date || "", notes: c.notes || "",
  };
}

function expiryTone(dateStr: string | null): "muted" | "warning" | "danger" | "success" {
  if (!dateStr) return "muted";
  const diffDays = (new Date(`${dateStr}T00:00:00`).getTime() - Date.now()) / 86400000;
  if (diffDays < 0) return "danger";
  if (diffDays <= 60) return "warning";
  return "success";
}

const DOC_DRAFT_EMPTY = { document_type: "CERTIFICATE" as DocumentType, title: "", specialization: "", document_no: "", issued_at: "", issued_by: "", note: "" };

export function PractitionerCredentialsClient({ departments, initialCredentials, canManage }: { departments: Department[]; initialCredentials: Credential[]; canManage: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [docDraft, setDocDraft] = useState(DOC_DRAFT_EMPTY);
  const [docBusy, setDocBusy] = useState(false);
  const [decisionFor, setDecisionFor] = useState<Credential | null>(null);
  const [copied, setCopied] = useState(false);

  const departmentName = (id: string | null) => (id ? departments.find((d) => d.id === id)?.name : null) || "—";

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialCredentials;
    return initialCredentials.filter((c) =>
      [c.full_name, c.professional_title, c.license_number, c.national_id, departments.find((d) => d.id === c.department_id)?.name].some((v) => (v || "").toLowerCase().includes(q))
    );
  }, [initialCredentials, search, departments]);

  const editingDocs = useMemo(() => {
    if (!form?.id) return [];
    return initialCredentials.find((c) => c.id === form.id)?.practitioner_credential_documents ?? [];
  }, [form?.id, initialCredentials]);

  const draftText = useMemo(() => {
    if (!decisionFor) return "";
    return buildAssignmentDecisionDraft(decisionFor, decisionFor.practitioner_credential_documents);
  }, [decisionFor]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.full_name.trim()) return setMessage({ tone: "error", text: "Vui lòng nhập họ và tên." });
    setBusy(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {
        department_id: form.department_id || null, full_name: form.full_name.trim(),
        date_of_birth: form.date_of_birth || null, gender: form.gender.trim() || null, national_id: form.national_id.trim() || null,
        phone: form.phone.trim() || null, email: form.email.trim() || null,
        license_type: form.license_type || null, license_number: form.license_number.trim() || null,
        license_issued_at: form.license_issued_at || null, license_issued_by: form.license_issued_by.trim() || null,
        professional_title: form.professional_title.trim() || null, display_title: form.display_title.trim() || null,
        scope_of_practice: form.scope_of_practice.trim() || null,
        scope_adjustment_text: form.scope_adjustment_text.trim() || null,
        scope_adjustment_decision_no: form.scope_adjustment_decision_no.trim() || null,
        scope_adjustment_decision_at: form.scope_adjustment_decision_at || null,
        scope_adjustment_issued_by: form.scope_adjustment_issued_by.trim() || null,
        proposed_technique: form.proposed_technique.trim() || null, registration_date: form.registration_date || null,
        decision_no: form.decision_no.trim() || null, decision_signed_at: form.decision_signed_at || null,
        decision_signed_by: form.decision_signed_by.trim() || null, decision_status: form.decision_status,
        decision_file_url: form.decision_file_url.trim() || null, practice_status_note: form.practice_status_note.trim() || null,
        license_expiry_date: form.license_expiry_date || null, notes: form.notes.trim() || null,
      };
      const res = await fetch(form.id ? `/api/practitioner-credentials/${form.id}` : "/api/practitioner-credentials", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không thể lưu hồ sơ.");
      setMessage({ tone: "success", text: form.id ? "Đã cập nhật hồ sơ." : "Đã thêm hồ sơ. Có thể bổ sung văn bằng/chứng chỉ bằng cách mở lại Sửa." });
      if (!form.id) setForm(null);
      else setTimeout(() => setMessage(null), 2000);
      router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Có lỗi xảy ra." });
    } finally {
      setBusy(false);
    }
  }

  async function addDocument() {
    if (!form?.id) return;
    if (!docDraft.title.trim()) return setMessage({ tone: "error", text: "Tên văn bằng/chứng chỉ/quyết định là bắt buộc." });
    setDocBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/practitioner-credentials/${form.id}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...docDraft, title: docDraft.title.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không thể thêm văn bằng/chứng chỉ.");
      setDocDraft(DOC_DRAFT_EMPTY);
      router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Có lỗi xảy ra." });
    } finally {
      setDocBusy(false);
    }
  }

  async function removeDocument(docId: string) {
    if (!form?.id) return;
    setDocBusy(true);
    try {
      const res = await fetch(`/api/practitioner-credentials/${form.id}/documents/${docId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không thể xoá.");
      router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Có lỗi xảy ra." });
    } finally {
      setDocBusy(false);
    }
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draftText);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <section className="panel">
        <div className="toolbar">
          <div className="toolbar-left">
            <div className="search-box">
              <Icon name="search" size={18} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên, chức danh, số GPHN/CCHN, CCCD, khoa..." />
            </div>
          </div>
          {canManage ? (
            <button className="button primary" onClick={() => { setForm({ ...EMPTY }); setMessage(null); }}>
              <Icon name="plus" size={18} /> Thêm hồ sơ
            </button>
          ) : null}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Họ và tên</th>
                <th>Chức danh</th>
                <th>Khoa</th>
                <th>Loại hồ sơ / Số</th>
                <th>Phạm vi hành nghề</th>
                <th>Quyết định PC</th>
                <th>Hạn GPHN/CME</th>
                <th></th>
                {canManage ? <th></th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.full_name}</strong>{c.date_of_birth ? <span className="subline">{c.date_of_birth.split("-").reverse().join("/")}</span> : null}</td>
                  <td>{c.display_title || c.professional_title || "—"}</td>
                  <td>{departmentName(c.department_id)}</td>
                  <td>{c.license_number ? <>{c.license_type ? LICENSE_TYPE_LABEL[c.license_type] : ""}<span className="subline">{c.license_number}</span></> : "—"}</td>
                  <td>{c.scope_of_practice || "—"}</td>
                  <td><span className={`status-badge ${DECISION_STATUS_TONE[c.decision_status]}`}>{DECISION_STATUS_LABEL[c.decision_status]}</span></td>
                  <td>{c.license_expiry_date ? <span className={`status-badge ${expiryTone(c.license_expiry_date)}`}>{c.license_expiry_date.split("-").reverse().join("/")}</span> : "—"}</td>
                  <td>
                    <button className="button tertiary small" onClick={() => { setDecisionFor(c); setCopied(false); }}>
                      <Icon name="file-text" size={15} /> Soạn QĐ
                    </button>
                  </td>
                  {canManage ? (
                    <td>
                      <button className="button tertiary small" onClick={() => { setForm(toForm(c)); setDocDraft(DOC_DRAFT_EMPTY); setMessage(null); }}>
                        <Icon name="pencil" size={15} /> Sửa
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={canManage ? 9 : 8}><div className="empty-state">Chưa có hồ sơ năng lực hành nghề nào phù hợp.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {form ? (
        <div className="modal-backdrop">
          <form className="modal-card xl" onSubmit={submit}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">{form.id ? "CẬP NHẬT" : "THÊM MỚI"}</div>
                <h2>{form.id ? form.full_name : "Hồ sơ năng lực hành nghề"}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => !busy && setForm(null)}><Icon name="x" /></button>
            </div>
            <div className="modal-body">
              {message ? <div className={`alert ${message.tone}`}>{message.text}</div> : null}
              <div className="form-stack">
                <div className="form-grid two">
                  <label className="span-2">Họ và tên *<input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>
                  <label>Ngày sinh<input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></label>
                  <label>Giới tính<input value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} /></label>
                  <label>CCCD<input value={form.national_id} onChange={(e) => setForm({ ...form, national_id: e.target.value })} /></label>
                  <label>SĐT<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
                  <label>Email<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
                  <label>
                    Khoa/Bộ phận
                    <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                      <option value="">— Chưa chọn —</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </label>
                  <label>Chức danh chuyên môn<input value={form.professional_title} onChange={(e) => setForm({ ...form, professional_title: e.target.value })} placeholder="Bác sĩ, Bác sĩ CKI, Dược sĩ ĐH..." /></label>
                  <label>Chức danh hiển thị<input value={form.display_title} onChange={(e) => setForm({ ...form, display_title: e.target.value })} placeholder="Để trống sẽ dùng chức danh chuyên môn" /></label>

                  <label>
                    Loại hồ sơ
                    <select value={form.license_type} onChange={(e) => setForm({ ...form, license_type: e.target.value as Form["license_type"] })}>
                      <option value="">— Chưa chọn —</option>
                      {(Object.keys(LICENSE_TYPE_LABEL) as LicenseType[]).map((k) => <option key={k} value={k}>{LICENSE_TYPE_LABEL[k]}</option>)}
                    </select>
                  </label>
                  <label>Số GPHN/CCHN<input value={form.license_number} onChange={(e) => setForm({ ...form, license_number: e.target.value })} /></label>
                  <label>Ngày cấp GPHN/CCHN<input type="date" value={form.license_issued_at} onChange={(e) => setForm({ ...form, license_issued_at: e.target.value })} /></label>
                  <label>Nơi cấp GPHN/CCHN<input value={form.license_issued_by} onChange={(e) => setForm({ ...form, license_issued_by: e.target.value })} /></label>
                  <label>Ngày hết hạn GPHN/CME<input type="date" value={form.license_expiry_date} onChange={(e) => setForm({ ...form, license_expiry_date: e.target.value })} /></label>

                  <label className="span-2">Phạm vi hành nghề / HĐCM<textarea rows={2} value={form.scope_of_practice} onChange={(e) => setForm({ ...form, scope_of_practice: e.target.value })} /></label>
                  <label className="span-2">Phạm vi bổ sung/điều chỉnh<textarea rows={2} value={form.scope_adjustment_text} onChange={(e) => setForm({ ...form, scope_adjustment_text: e.target.value })} /></label>
                  <label>Số QĐ bổ sung/điều chỉnh<input value={form.scope_adjustment_decision_no} onChange={(e) => setForm({ ...form, scope_adjustment_decision_no: e.target.value })} /></label>
                  <label>Ngày QĐ bổ sung/điều chỉnh<input type="date" value={form.scope_adjustment_decision_at} onChange={(e) => setForm({ ...form, scope_adjustment_decision_at: e.target.value })} /></label>
                  <label className="span-2">Nơi cấp QĐ bổ sung/điều chỉnh<input value={form.scope_adjustment_issued_by} onChange={(e) => setForm({ ...form, scope_adjustment_issued_by: e.target.value })} /></label>
                  <label className="span-2">Kỹ thuật chuyên môn đề xuất<textarea rows={2} value={form.proposed_technique} onChange={(e) => setForm({ ...form, proposed_technique: e.target.value })} /></label>

                  <label>Ngày đăng ký hành nghề<input type="date" value={form.registration_date} onChange={(e) => setForm({ ...form, registration_date: e.target.value })} /></label>
                  <label>Số quyết định phân công<input value={form.decision_no} onChange={(e) => setForm({ ...form, decision_no: e.target.value })} /></label>
                  <label>Ngày ký quyết định<input type="date" value={form.decision_signed_at} onChange={(e) => setForm({ ...form, decision_signed_at: e.target.value })} /></label>
                  <label>Người ký<input value={form.decision_signed_by} onChange={(e) => setForm({ ...form, decision_signed_by: e.target.value })} /></label>
                  <label>
                    Trạng thái quyết định
                    <select value={form.decision_status} onChange={(e) => setForm({ ...form, decision_status: e.target.value as DecisionStatus })}>
                      {(Object.keys(DECISION_STATUS_LABEL) as DecisionStatus[]).map((k) => <option key={k} value={k}>{DECISION_STATUS_LABEL[k]}</option>)}
                    </select>
                  </label>
                  <label>Link file quyết định<input value={form.decision_file_url} onChange={(e) => setForm({ ...form, decision_file_url: e.target.value })} /></label>
                  <label className="span-2">Tình trạng hành nghề<input value={form.practice_status_note} onChange={(e) => setForm({ ...form, practice_status_note: e.target.value })} placeholder="Vd: Đã ngưng, Cập nhật CCHN..." /></label>
                  <label className="span-2">Ghi chú<textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
                </div>

                {form.id ? (
                  <fieldset>
                    <legend>Văn bằng / Chứng chỉ / Quyết định bổ sung phạm vi</legend>
                    {editingDocs.length ? (
                      <div className="table-wrap">
                        <table>
                          <thead><tr><th>Loại</th><th>Tên</th><th>Số</th><th>Ngày cấp</th><th>Nơi cấp</th><th></th></tr></thead>
                          <tbody>
                            {editingDocs.map((d) => (
                              <tr key={d.id}>
                                <td>{DOCUMENT_TYPE_LABEL[d.document_type]}</td>
                                <td>{d.title}{d.specialization ? <span className="subline">{d.specialization}</span> : null}</td>
                                <td>{d.document_no || "—"}</td>
                                <td>{d.issued_at ? d.issued_at.split("-").reverse().join("/") : "—"}</td>
                                <td>{d.issued_by || "—"}</td>
                                <td><button type="button" className="button tertiary small" disabled={docBusy} onClick={() => removeDocument(d.id)}><Icon name="x" size={14} /></button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="empty-state compact">Chưa có văn bằng/chứng chỉ nào được ghi nhận.</div>
                    )}
                    <div className="form-grid two" style={{ marginTop: 12 }}>
                      <label>
                        Loại
                        <select value={docDraft.document_type} onChange={(e) => setDocDraft({ ...docDraft, document_type: e.target.value as DocumentType })}>
                          {(Object.keys(DOCUMENT_TYPE_LABEL) as DocumentType[]).map((k) => <option key={k} value={k}>{DOCUMENT_TYPE_LABEL[k]}</option>)}
                        </select>
                      </label>
                      <label>Tên<input value={docDraft.title} onChange={(e) => setDocDraft({ ...docDraft, title: e.target.value })} /></label>
                      <label>Chuyên ngành (nếu có)<input value={docDraft.specialization} onChange={(e) => setDocDraft({ ...docDraft, specialization: e.target.value })} /></label>
                      <label>Số hiệu/Số QĐ<input value={docDraft.document_no} onChange={(e) => setDocDraft({ ...docDraft, document_no: e.target.value })} /></label>
                      <label>Ngày cấp<input type="date" value={docDraft.issued_at} onChange={(e) => setDocDraft({ ...docDraft, issued_at: e.target.value })} /></label>
                      <label>Nơi cấp<input value={docDraft.issued_by} onChange={(e) => setDocDraft({ ...docDraft, issued_by: e.target.value })} /></label>
                      <label className="span-2">Ghi chú<input value={docDraft.note} onChange={(e) => setDocDraft({ ...docDraft, note: e.target.value })} /></label>
                    </div>
                    <button type="button" className="button secondary" disabled={docBusy} onClick={addDocument} style={{ marginTop: 10 }}>
                      <Icon name="plus" size={16} /> Thêm văn bằng/chứng chỉ
                    </button>
                  </fieldset>
                ) : (
                  <div className="scope-note">Lưu hồ sơ trước, sau đó mở lại Sửa để bổ sung văn bằng/chứng chỉ/quyết định điều chỉnh phạm vi (số lượng không giới hạn).</div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="button secondary" onClick={() => setForm(null)} disabled={busy}>Hủy</button>
              <button className="button primary" disabled={busy}><Icon name="save" size={17} />{busy ? "Đang lưu..." : "Lưu hồ sơ"}</button>
            </div>
          </form>
        </div>
      ) : null}

      {decisionFor ? (
        <div className="modal-backdrop">
          <div className="modal-card xl">
            <div className="modal-head">
              <div>
                <div className="eyebrow">BẢN NHÁP — CẦN RÀ SOÁT TRƯỚC KHI TRÌNH KÝ</div>
                <h2>Quyết định phân công — {decisionFor.full_name}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setDecisionFor(null)}><Icon name="x" /></button>
            </div>
            <div className="modal-body">
              <textarea readOnly rows={22} value={draftText} style={{ fontFamily: "monospace", fontSize: 12 }} />
            </div>
            <div className="modal-footer">
              <button type="button" className="button secondary" onClick={() => setDecisionFor(null)}>Đóng</button>
              <button type="button" className="button primary" onClick={copyDraft}><Icon name="save" size={16} />{copied ? "Đã copy" : "Copy nội dung"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
