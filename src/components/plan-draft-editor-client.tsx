"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import type { PlanDraftAction } from "@/lib/plan-composer";

type Department = { id: string; name: string; short_name: string | null };
type Profile = { user_id: string; full_name: string | null; email: string | null; primary_department_id: string | null };
type Initial = {
  title: string; programType: string; generalObjective: string; specificObjectives: string[]; requirements: string; description: string;
  startDate: string; endDate: string; leadDepartmentId: string; ownerUserId: string; draftActions: PlanDraftAction[]; returnedReason: string; revisionNo: number;
};

function newDraftAction(index: number, leadDepartmentId: string, ownerUserId: string, endDate: string): PlanDraftAction {
  return { client_id: `draft-ui-${Date.now()}-${index}`, title: "", description: null, priority: "NORMAL", lead_department_id: leadDepartmentId || null, collaborating_department_ids: [], assignee_user_id: ownerUserId || null, start_date: null, due_date: endDate || null, expected_result: "", verification_requirement: null, milestone_group: null, is_required: true, criteria_refs: [], automation_kind: "ACTION", automation_confirmed: false, automation_ref_id: null, automation_target_department_id: null };
}

export function PlanDraftEditorClient({ planId, canManage, status, initial, departments, profiles }: { planId: string; canManage: boolean; status: string; initial: Initial; departments: Department[]; profiles: Profile[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const [title, setTitle] = useState(initial.title);
  const [programType, setProgramType] = useState(initial.programType);
  const [generalObjective, setGeneralObjective] = useState(initial.generalObjective);
  const [specificObjectives, setSpecificObjectives] = useState<string[]>(initial.specificObjectives.length ? initial.specificObjectives : [""]);
  const [requirements, setRequirements] = useState(initial.requirements);
  const [description, setDescription] = useState(initial.description);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [leadDepartmentId, setLeadDepartmentId] = useState(initial.leadDepartmentId);
  const [ownerUserId, setOwnerUserId] = useState(initial.ownerUserId);
  const [draftActions, setDraftActions] = useState<PlanDraftAction[]>(initial.draftActions);

  const editable = canManage && status === "DRAFT";
  const ownerOptions = useMemo(() => profiles.filter((p) => !leadDepartmentId || !p.primary_department_id || p.primary_department_id === leadDepartmentId), [profiles, leadDepartmentId]);

  if (!editable) return null;

  function setSpecific(index: number, value: string) { setSpecificObjectives((current) => current.map((item, i) => i === index ? value : item)); }
  function addSpecific() { setSpecificObjectives((current) => [...current, ""]); }
  function removeSpecific(index: number) { setSpecificObjectives((current) => current.length === 1 ? [""] : current.filter((_, i) => i !== index)); }
  function setAction(index: number, patch: Partial<PlanDraftAction>) { setDraftActions((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item)); }
  function addAction() { setDraftActions((current) => [...current, newDraftAction(current.length + 1, leadDepartmentId, ownerUserId, endDate)]); }
  function removeAction(index: number) { if (!window.confirm("Xóa nhiệm vụ dự kiến này khỏi bản Nháp? Nhiệm vụ chưa phải Action chính thức.")) return; setDraftActions((current) => current.filter((_, i) => i !== index)); }

  async function save(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    const cleanedSpecific = specificObjectives.map((x) => x.trim()).filter(Boolean);
    if (!title.trim() || !generalObjective.trim() || !cleanedSpecific.length || !requirements.trim() || !leadDepartmentId) { setError("Cần hoàn thiện tên kế hoạch, mục tiêu chung, ít nhất 01 mục tiêu cụ thể, yêu cầu và khoa/phòng chủ trì."); return; }
    if (startDate && endDate && endDate < startDate) { setError("Ngày kết thúc không được trước ngày bắt đầu."); return; }
    for (let index = 0; index < draftActions.length; index++) {
      const action = draftActions[index];
      if (!action.title.trim() || !action.lead_department_id || !action.assignee_user_id || !action.due_date || !action.expected_result.trim()) { setError(`Nhiệm vụ #${index + 1} cần đủ nội dung, khoa/phòng, người phụ trách, hạn và kết quả mong đợi.`); return; }
      if (action.start_date && action.due_date < action.start_date) { setError(`Nhiệm vụ #${index + 1}: hạn không được trước ngày bắt đầu.`); return; }
      if (startDate && action.start_date && action.start_date < startDate) { setError(`Nhiệm vụ #${index + 1}: ngày bắt đầu nằm ngoài thời gian kế hoạch.`); return; }
      if (endDate && action.due_date > endDate) { setError(`Nhiệm vụ #${index + 1}: hạn nằm ngoài thời gian kế hoạch.`); return; }
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/plans/${planId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        title: title.trim(), program_type: programType, general_objective: generalObjective.trim(), specific_objectives: cleanedSpecific, requirements: requirements.trim(), description: description.trim() || null,
        start_date: startDate || null, end_date: endDate || null, lead_department_id: leadDepartmentId, owner_user_id: ownerUserId || null, draft_actions: draftActions, reason: reason.trim() || undefined,
      }) });
      const json = await response.json().catch(() => ({})); if (!response.ok) throw new Error(json.error || "Không lưu được bản nháp kế hoạch.");
      setNotice(json.message || "Đã lưu bản nháp kế hoạch."); setReason(""); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không lưu được bản nháp kế hoạch."); }
    finally { setBusy(false); }
  }

  return <section className="panel plan-composer-editor">
    <style>{`.plan-composer-editor .pc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:16px 18px}.plan-composer-editor .pc-head h2{margin:0;font-size:17px}.plan-composer-editor .pc-head p{margin:4px 0 0;font-size:11px;color:#64748b}.plan-composer-editor .pc-body{border-top:1px solid var(--line);padding:18px;display:grid;gap:18px}.plan-composer-editor .pc-actions{display:flex;gap:8px;flex-wrap:wrap}.plan-composer-editor .draft-card{border:1px solid var(--line);border-radius:14px;padding:14px;background:#fbfcfd;display:grid;gap:10px}.plan-composer-editor .draft-card-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.plan-composer-editor .pc-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.plan-composer-editor .wide{grid-column:1/-1}.plan-composer-editor label{display:grid;gap:5px;font-size:11px;font-weight:700}.plan-composer-editor .inline-check{display:flex;align-items:center;gap:7px}.plan-composer-editor .inline-check input{width:auto}.plan-composer-editor .specific-row{display:grid;grid-template-columns:1fr auto;gap:8px}@media(max-width:760px){.plan-composer-editor .pc-grid{grid-template-columns:1fr}.plan-composer-editor .wide{grid-column:auto}}`}</style>
    <div className="pc-head"><div><h2>Trình soạn kế hoạch · Bản Nháp</h2><p>Chỉnh nội dung và nhiệm vụ dự kiến trước khi gửi duyệt. Action chính thức chỉ sinh khi phê duyệt.</p></div><button type="button" className={`button ${open ? "tertiary" : "secondary"} small`} onClick={() => setOpen((value) => !value)}>{open ? "Thu gọn" : "Sửa bản nháp"}</button></div>
    {initial.returnedReason ? <div className="alert warning" style={{ margin: "0 18px 16px" }}><strong>Yêu cầu chỉnh sửa · lần {initial.revisionNo}</strong><div style={{ marginTop: 4 }}>{initial.returnedReason}</div></div> : null}
    {notice ? <div className="alert success" style={{ margin: "0 18px 16px" }}>{notice}</div> : null}
    {error ? <div className="alert error" style={{ margin: "0 18px 16px" }}>{error}</div> : null}
    {open ? <form className="pc-body" onSubmit={save}>
      <section><h3>1. Thông tin nền</h3><div className="pc-grid">
        <label className="wide">Tên kế hoạch *<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>Loại kế hoạch<select value={programType} onChange={(e) => setProgramType(e.target.value)}><option value="ANNUAL_PLAN">Kế hoạch năm</option><option value="THEMATIC_PLAN">Kế hoạch chuyên đề</option><option value="DEPARTMENT_PLAN">Kế hoạch khoa/phòng</option><option value="PROGRAM">Chương trình</option><option value="OTHER">Khác</option></select></label>
        <label>Khoa/Phòng chủ trì *<select value={leadDepartmentId} onChange={(e) => { setLeadDepartmentId(e.target.value); setOwnerUserId(""); }}><option value="">Chọn...</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label>Ngày bắt đầu<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label><label>Ngày kết thúc<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
        <label className="wide">Người phụ trách<select value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)}><option value="">Chưa chỉ định</option>{ownerOptions.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email || p.user_id}</option>)}</select></label>
      </div></section>
      <section><h3>2. Mục tiêu & yêu cầu</h3><div className="pc-grid"><label className="wide">Mục tiêu chung *<textarea rows={3} value={generalObjective} onChange={(e) => setGeneralObjective(e.target.value)} /></label><div className="wide" style={{ display: "grid", gap: 8 }}><strong style={{ fontSize: 11 }}>Mục tiêu cụ thể *</strong>{specificObjectives.map((item, index) => <div className="specific-row" key={index}><input value={item} onChange={(e) => setSpecific(index, e.target.value)} placeholder={`Mục tiêu ${index + 1}`} /><button type="button" className="button tertiary small" onClick={() => removeSpecific(index)}>Xóa</button></div>)}<div><button type="button" className="button secondary small" onClick={addSpecific}>+ Thêm mục tiêu</button></div></div><label className="wide">Yêu cầu *<textarea rows={3} value={requirements} onChange={(e) => setRequirements(e.target.value)} /></label><label className="wide">Mô tả / phạm vi<textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label></div></section>
      <section><div className="draft-card-head"><div><h3 style={{ margin: 0 }}>3. Nhiệm vụ dự kiến</h3><span className="muted tiny">{draftActions.length} nhiệm vụ · chỉ materialize thành Action khi phê duyệt</span></div><button type="button" className="button secondary small" onClick={addAction}>+ Thêm nhiệm vụ</button></div>
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>{draftActions.map((action, index) => {
          const assignees = profiles.filter((p) => !action.lead_department_id || !p.primary_department_id || p.primary_department_id === action.lead_department_id);
          return <article className="draft-card" key={action.client_id}><div className="draft-card-head"><strong>Nhiệm vụ #{index + 1}</strong><button type="button" className="button danger small" onClick={() => removeAction(index)}>Xóa</button></div><div className="pc-grid">
            <label className="wide">Nội dung *<input value={action.title} onChange={(e) => setAction(index, { title: e.target.value })} /></label>
            <label>Ưu tiên<select value={action.priority} onChange={(e) => setAction(index, { priority: e.target.value })}><option value="LOW">Thấp</option><option value="NORMAL">Bình thường</option><option value="HIGH">Cao</option><option value="URGENT">Khẩn</option><option value="CRITICAL">Trọng yếu</option></select></label>
            <label>Nhóm / mốc<input value={action.milestone_group || ""} onChange={(e) => setAction(index, { milestone_group: e.target.value || null })} /></label>
            <label>Khoa/Phòng phụ trách *<select value={action.lead_department_id || ""} onChange={(e) => setAction(index, { lead_department_id: e.target.value || null, assignee_user_id: null })}><option value="">Chọn...</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
            <label>Người phụ trách *<select value={action.assignee_user_id || ""} onChange={(e) => setAction(index, { assignee_user_id: e.target.value || null })}><option value="">Chọn...</option>{assignees.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email || p.user_id}</option>)}</select></label>
            <label>Ngày bắt đầu<input type="date" min={startDate || undefined} max={endDate || undefined} value={action.start_date || ""} onChange={(e) => setAction(index, { start_date: e.target.value || null })} /></label>
            <label>Hạn hoàn thành *<input type="date" min={action.start_date || startDate || undefined} max={endDate || undefined} value={action.due_date || ""} onChange={(e) => setAction(index, { due_date: e.target.value || null })} /></label>
            <label className="wide">Kết quả mong đợi *<textarea rows={2} value={action.expected_result} onChange={(e) => setAction(index, { expected_result: e.target.value })} /></label>
            <label className="wide">Yêu cầu xác minh / minh chứng<textarea rows={2} value={action.verification_requirement || ""} onChange={(e) => setAction(index, { verification_requirement: e.target.value || null })} /></label>
            <label className="wide">Mô tả / hướng dẫn<textarea rows={2} value={action.description || ""} onChange={(e) => setAction(index, { description: e.target.value || null })} /></label>
            <label className="wide inline-check"><input type="checkbox" checked={action.is_required} onChange={(e) => setAction(index, { is_required: e.target.checked })} /> Tính vào tiến độ bắt buộc</label>
          </div></article>;
        })}{!draftActions.length ? <div className="alert">Chưa có nhiệm vụ dự kiến. Có thể lưu Nháp, nhưng cần ít nhất 01 nhiệm vụ đầy đủ trước khi Gửi phê duyệt.</div> : null}</div>
      </section>
      <label>Ghi chú lần chỉnh sửa<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Không bắt buộc; audit trail vẫn được ghi tự động" /></label>
      <div className="pc-actions"><button className="button primary" disabled={busy}><Icon name="save" size={16} /> {busy ? "Đang lưu..." : "Lưu bản nháp"}</button><button type="button" className="button tertiary" disabled={busy} onClick={() => setOpen(false)}>Đóng trình soạn</button></div>
    </form> : null}
  </section>;
}
