"use client";

import { FormEvent, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

const ANSWER_LABELS: Record<string, string> = {
  PASS_FAIL: "Đạt / Không đạt",
  YES_NO: "Có / Không",
  SINGLE_CHOICE: "Chọn 1 phương án",
  MULTI_CHOICE: "Chọn nhiều phương án",
  NUMBER: "Nhập số",
  SCORE: "Nhập điểm",
  TEXT: "Nhập nội dung",
};

type Version = { id: string; version_no: number; status: string; scoring_method: string | null; effective_from: string | null; effective_to: string | null; published_at: string | null };
type Option = { id: string; option_label: string; option_code: string; sort_order: number };
type Item = {
  id: string; content: string; answer_type: string; is_required: boolean; allow_na: boolean; na_reason_required: boolean; is_critical: boolean;
  scoring_enabled: boolean; score_value: number | null; weight: number | null; finding_on_fail: boolean; evidence_required_on_fail: boolean; sequence_no: number; options: Option[];
};
type Section = { id: string; title: string; description: string | null; sequence_no: number; items: Item[] };

type ItemForm = {
  sectionId: string; content: string; answerType: string; isRequired: boolean; allowNa: boolean; naReasonRequired: boolean; isCritical: boolean;
  scoringEnabled: boolean; scoreValue: string; weight: string; findingOnFail: boolean; evidenceRequiredOnFail: boolean; optionsText: string;
};

const emptyItem = (sectionId = ""): ItemForm => ({
  sectionId, content: "", answerType: "PASS_FAIL", isRequired: true, allowNa: true, naReasonRequired: false, isCritical: false,
  scoringEnabled: false, scoreValue: "", weight: "", findingOnFail: false, evidenceRequiredOnFail: false, optionsText: "",
});

export function ChecklistTemplateEditorClient({ template, version, versions, sections, canManage }: {
  template: { id: string; code: string | null; name: string; description: string | null; owner_department_name: string | null; is_active: boolean };
  version: Version | null;
  versions: Version[];
  sections: Section[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [sectionOpen, setSectionOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [sectionTitle, setSectionTitle] = useState("");
  const [sectionDescription, setSectionDescription] = useState("");
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItem());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const itemCount = useMemo(() => sections.reduce((sum, s) => sum + s.items.length, 0), [sections]);
  const editable = !!version && version.status === "DRAFT" && canManage && template.is_active;

  async function createSection(e: FormEvent) {
    e.preventDefault();
    if (!version) return;
    if (!sectionTitle.trim()) return setMessage("Vui lòng nhập tên nhóm mục.");
    setBusy(true); setMessage(null);
    try {
      const res = await fetch(`/api/monitoring/templates/${template.id}/sections`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: version.id, title: sectionTitle.trim(), description: sectionDescription.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tạo được nhóm mục.");
      setSectionTitle(""); setSectionDescription(""); setSectionOpen(false); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Có lỗi xảy ra."); }
    finally { setBusy(false); }
  }

  function openItem(sectionId: string) {
    setMessage(null); setItemForm(emptyItem(sectionId)); setItemOpen(true);
  }

  async function createItem(e: FormEvent) {
    e.preventDefault();
    if (!version) return;
    if (!itemForm.content.trim()) return setMessage("Vui lòng nhập nội dung tiêu chí.");
    const options = itemForm.optionsText.split("\n").map((x) => x.trim()).filter(Boolean);
    if (["SINGLE_CHOICE", "MULTI_CHOICE"].includes(itemForm.answerType) && options.length < 2) return setMessage("Cần nhập ít nhất 02 phương án, mỗi phương án một dòng.");
    setBusy(true); setMessage(null);
    try {
      const res = await fetch(`/api/monitoring/templates/${template.id}/items`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version_id: version.id, section_id: itemForm.sectionId, content: itemForm.content.trim(), answer_type: itemForm.answerType,
          is_required: itemForm.isRequired, allow_na: itemForm.allowNa, na_reason_required: itemForm.naReasonRequired, is_critical: itemForm.isCritical,
          scoring_enabled: itemForm.scoringEnabled, score_value: itemForm.scoreValue, weight: itemForm.weight,
          finding_on_fail: itemForm.findingOnFail, evidence_required_on_fail: itemForm.evidenceRequiredOnFail, options,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tạo được tiêu chí.");
      setItemOpen(false); setItemForm(emptyItem()); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Có lỗi xảy ra."); }
    finally { setBusy(false); }
  }

  const sectionModal = sectionOpen && typeof document !== "undefined" ? createPortal(
    <div className="modal-backdrop"><form className="modal-card" onSubmit={createSection} style={{ width: "min(760px, calc(100vw - 32px))" }}>
      <div className="modal-head"><div><div className="eyebrow">NHÓM MỤC</div><h2>Thêm nhóm mục</h2><p className="muted tiny">Dùng để gom các tiêu chí có cùng chủ đề.</p></div><button type="button" className="icon-button" onClick={() => !busy && setSectionOpen(false)}><Icon name="x" size={22} /></button></div>
      <div className="modal-body"><div className="form-stack"><label><span>Tên nhóm mục *</span><input value={sectionTitle} onChange={(e) => setSectionTitle(e.target.value)} placeholder="Ví dụ: 1. Thời điểm vệ sinh tay" /></label><label><span>Mô tả / hướng dẫn</span><textarea rows={4} value={sectionDescription} onChange={(e) => setSectionDescription(e.target.value)} /></label></div></div>
      <div className="modal-footer"><button type="button" className="button secondary" disabled={busy} onClick={() => setSectionOpen(false)}>Hủy</button><button className="button primary" disabled={busy}><Icon name="plus" size={17} /> {busy ? "Đang tạo..." : "Thêm nhóm mục"}</button></div>
    </form></div>, document.body) : null;

  const itemModal = itemOpen && typeof document !== "undefined" ? createPortal(
    <div className="modal-backdrop" style={{ padding: 16 }}><form className="modal-card" onSubmit={createItem} style={{ width: "min(1100px, calc(100vw - 32px))", maxHeight: "calc(100dvh - 32px)" }}>
      <div className="modal-head"><div><div className="eyebrow">TIÊU CHÍ BẢNG KIỂM</div><h2>Thêm tiêu chí</h2><p className="muted tiny">Cấu hình cách trả lời, N/A, mức trọng yếu và xử lý khi không đạt.</p></div><button type="button" className="icon-button" onClick={() => !busy && setItemOpen(false)}><Icon name="x" size={22} /></button></div>
      <div className="modal-body">
        <div className="form-stack">
          <label><span>Nội dung tiêu chí *</span><textarea rows={3} value={itemForm.content} onChange={(e) => setItemForm({ ...itemForm, content: e.target.value })} placeholder="Ví dụ: Nhân viên thực hiện vệ sinh tay trước khi tiếp xúc người bệnh." /></label>
          <div className="form-grid two">
            <label><span>Loại câu trả lời *</span><select value={itemForm.answerType} onChange={(e) => setItemForm({ ...itemForm, answerType: e.target.value })}>{Object.entries(ANSWER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span>Trọng số</span><input type="number" min="0" step="0.01" value={itemForm.weight} onChange={(e) => setItemForm({ ...itemForm, weight: e.target.value })} placeholder="Có thể để trống" /></label>
          </div>
          {["SINGLE_CHOICE", "MULTI_CHOICE"].includes(itemForm.answerType) ? <label><span>Các phương án *</span><textarea rows={4} value={itemForm.optionsText} onChange={(e) => setItemForm({ ...itemForm, optionsText: e.target.value })} placeholder={'Mỗi phương án một dòng\nPhương án 1\nPhương án 2'} /></label> : null}
          <div className="check-grid">
            <label className="check-card"><input type="checkbox" checked={itemForm.isRequired} onChange={(e) => setItemForm({ ...itemForm, isRequired: e.target.checked })} /><span><strong>Bắt buộc trả lời</strong><small>Không được bỏ trống khi hoàn tất giám sát.</small></span></label>
            <label className="check-card"><input type="checkbox" checked={itemForm.allowNa} onChange={(e) => setItemForm({ ...itemForm, allowNa: e.target.checked })} /><span><strong>Cho phép N/A</strong><small>Không áp dụng trong tình huống phù hợp.</small></span></label>
            <label className="check-card"><input type="checkbox" checked={itemForm.naReasonRequired} disabled={!itemForm.allowNa} onChange={(e) => setItemForm({ ...itemForm, naReasonRequired: e.target.checked })} /><span><strong>N/A phải ghi lý do</strong><small>Tăng khả năng truy vết kết quả.</small></span></label>
            <label className="check-card"><input type="checkbox" checked={itemForm.isCritical} onChange={(e) => setItemForm({ ...itemForm, isCritical: e.target.checked })} /><span><strong>Tiêu chí trọng yếu</strong><small>Dùng để ưu tiên khi tổng hợp.</small></span></label>
            <label className="check-card"><input type="checkbox" checked={itemForm.findingOnFail} onChange={(e) => setItemForm({ ...itemForm, findingOnFail: e.target.checked })} /><span><strong>Đề nghị Finding khi không đạt</strong><small>Chỉ là ứng viên; không tự động tạo Finding.</small></span></label>
            <label className="check-card"><input type="checkbox" checked={itemForm.evidenceRequiredOnFail} onChange={(e) => setItemForm({ ...itemForm, evidenceRequiredOnFail: e.target.checked })} /><span><strong>Không đạt cần minh chứng</strong><small>Yêu cầu ảnh/file khi ghi nhận FAIL.</small></span></label>
          </div>
          <fieldset><legend>Chấm điểm</legend><label className="inline-check"><input type="checkbox" checked={itemForm.scoringEnabled} onChange={(e) => setItemForm({ ...itemForm, scoringEnabled: e.target.checked })} /> Tính điểm cho tiêu chí này</label>{itemForm.scoringEnabled ? <div style={{ marginTop: 12, maxWidth: 280 }}><label><span>Điểm tối đa / giá trị điểm</span><input type="number" step="0.01" value={itemForm.scoreValue} onChange={(e) => setItemForm({ ...itemForm, scoreValue: e.target.value })} /></label></div> : null}</fieldset>
        </div>
      </div>
      <div className="modal-footer"><button type="button" className="button secondary" disabled={busy} onClick={() => setItemOpen(false)}>Hủy</button><button className="button primary" disabled={busy}><Icon name="plus" size={17} /> {busy ? "Đang tạo..." : "Thêm tiêu chí"}</button></div>
    </form></div>, document.body) : null;

  return <>
    {message ? <div className="alert error">{message}</div> : null}
    <section className="kpi-grid">
      <article className="kpi-card"><span>Phiên bản</span><strong style={{ fontSize: 25 }}>{version ? `v${version.version_no}` : "—"}</strong><small>{version?.status === "DRAFT" ? "Nháp · đang cấu hình" : version?.status === "PUBLISHED" ? "Đã phát hành" : "Chưa có phiên bản"}</small></article>
      <article className="kpi-card"><span>Nhóm mục</span><strong>{sections.length}</strong><small>Cấu trúc của phiên bản hiện tại</small></article>
      <article className="kpi-card"><span>Tiêu chí</span><strong>{itemCount}</strong><small>Tổng tiêu chí trong bảng kiểm</small></article>
      <article className="kpi-card"><span>Cách tổng hợp</span><strong style={{ fontSize: 17, lineHeight: 1.3 }}>{scoringLabel(version?.scoring_method)}</strong><small>{template.owner_department_name || "—"}</small></article>
    </section>

    <section className="panel">
      <div className="panel-title"><div><h2>Thông tin mẫu</h2><p>{template.description || "Chưa có mô tả phạm vi sử dụng."}</p></div><div style={{ display: "flex", gap: 8, alignItems: "center" }}>{version ? <VersionBadge status={version.status} /> : null}{editable ? <button className="button primary" onClick={() => { setMessage(null); setSectionOpen(true); }}><Icon name="plus" size={17} /> Thêm nhóm mục</button> : null}</div></div>
      {!editable ? <div className="scope-note" style={{ margin: "0 18px 18px" }}>{version?.status === "PUBLISHED" ? "Phiên bản đã phát hành được khóa nội dung để bảo toàn dữ liệu lịch sử." : "Bạn không có quyền chỉnh sửa phiên bản này."}</div> : null}
    </section>

    {sections.map((section, index) => <section className="panel" key={section.id}>
      <div className="panel-title"><div><div className="eyebrow">NHÓM {index + 1}</div><h2>{section.title}</h2>{section.description ? <p>{section.description}</p> : null}</div>{editable ? <button className="button secondary" onClick={() => openItem(section.id)}><Icon name="plus" size={16} /> Thêm tiêu chí</button> : null}</div>
      <div className="table-wrap"><table><thead><tr><th>#</th><th>Tiêu chí</th><th>Kiểu trả lời</th><th>Thiết lập</th></tr></thead><tbody>
        {section.items.map((item, itemIndex) => <tr key={item.id}><td>{itemIndex + 1}</td><td><strong>{item.content}</strong>{item.options.length ? <span className="subline">Phương án: {item.options.map((o) => o.option_label).join(" · ")}</span> : null}</td><td>{ANSWER_LABELS[item.answer_type] || item.answer_type}</td><td><div className="chip-row">{item.is_required ? <span className="chip">Bắt buộc</span> : null}{item.allow_na ? <span className="chip">Có N/A</span> : null}{item.is_critical ? <span className="chip">Trọng yếu</span> : null}{item.finding_on_fail ? <span className="chip">Finding khi FAIL</span> : null}{item.evidence_required_on_fail ? <span className="chip">FAIL cần minh chứng</span> : null}</div></td></tr>)}
        {!section.items.length ? <tr><td colSpan={4}><div className="empty-state compact">Nhóm này chưa có tiêu chí. Chọn <strong>Thêm tiêu chí</strong> để bắt đầu.</div></td></tr> : null}
      </tbody></table></div>
    </section>)}

    {!sections.length ? <section className="panel empty-state"><strong>Phiên bản chưa có nhóm mục.</strong><div style={{ marginTop: 8 }}>Tạo nhóm mục đầu tiên để bắt đầu xây nội dung bảng kiểm.</div>{editable ? <button className="button primary" style={{ marginTop: 16 }} onClick={() => setSectionOpen(true)}><Icon name="plus" size={17} /> Tạo nhóm mục đầu tiên</button> : null}</section> : null}

    {versions.length > 1 ? <section className="panel"><div className="panel-title"><div><h2>Lịch sử phiên bản</h2><p>Các phiên bản được giữ lại để truy vết dữ liệu giám sát cũ.</p></div></div><div className="table-wrap"><table><thead><tr><th>Phiên bản</th><th>Trạng thái</th><th>Hiệu lực</th></tr></thead><tbody>{versions.map((v) => <tr key={v.id}><td><strong>v{v.version_no}</strong></td><td><VersionBadge status={v.status} /></td><td>{v.effective_from || "—"}{v.effective_to ? ` → ${v.effective_to}` : ""}</td></tr>)}</tbody></table></div></section> : null}

    {sectionModal}{itemModal}
  </>;
}

function VersionBadge({ status }: { status: string }) {
  const tone = status === "PUBLISHED" ? "success" : status === "RETIRED" ? "muted" : "warning";
  const label = status === "PUBLISHED" ? "Đã phát hành" : status === "RETIRED" ? "Ngưng sử dụng" : "Nháp";
  return <span className={`status-badge ${tone}`}>{label}</span>;
}
function scoringLabel(value?: string | null) {
  if (value === "WEIGHTED_SCORE") return "Điểm có trọng số";
  if (value === "NO_SCORE") return "Không tính điểm";
  return "Tỷ lệ tuân thủ (%)";
}
