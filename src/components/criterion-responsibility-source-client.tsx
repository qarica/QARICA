"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { responsibilityDepartmentCandidates, sourceNeedsManualConfirmation } from "@/lib/criteria-2026-source";

type Department = { id: string; name: string; short_name?: string | null };
type Responsibility = {
  source_lead_label: string | null;
  lead_department_id: string | null;
  mapping_status: string;
  is_priority: boolean;
};
type Criterion = {
  id: string;
  code: string | null;
  title: string | null;
  responsibility: Responsibility | null;
};
type SourceGroup = { sourceLeadLabel: string; codes: string[] };
type Payload = {
  initialized: boolean;
  source_reference: string;
  criteria: Criterion[];
  departments: Department[];
  source_groups: SourceGroup[];
};

export function CriterionResponsibilitySourceClient({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const autoSeeded = useRef(false);
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [selection, setSelection] = useState<Record<string, string>>({});

  async function load() {
    const response = await fetch("/api/assessments/responsibilities", { cache: "no-store" });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "Không tải được phân công 83 tiêu chí.");
    setData(json);
    return json as Payload;
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const payload = await load();
        if (!active || payload.initialized || !canManage || autoSeeded.current) return;
        autoSeeded.current = true;
        setMessage({ tone: "info", text: "QARICA đang kế thừa Bảng phân công 83 tiêu chí năm 2026…" });
        const response = await fetch("/api/assessments/responsibilities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "INIT_SOURCE" }),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Không khởi tạo được phân công nguồn.");
        if (!active) return;
        await load();
        setMessage({ tone: "success", text: "Đã kế thừa đủ 83 tiêu chí từ nguồn. Chỉ còn xác nhận ánh xạ tên đơn vị hiện hành." });
      } catch (error) {
        if (active) setMessage({ tone: "error", text: error instanceof Error ? error.message : "Không tải được phân công tiêu chí." });
      }
    })();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  const groups = useMemo(() => {
    if (!data) return [];
    return data.source_groups.map((group) => {
      const criteria = data.criteria.filter((item) => group.codes.includes(String(item.code || "")));
      const responsibilities = criteria.map((item) => item.responsibility).filter(Boolean) as Responsibility[];
      const confirmedDepartmentIds = Array.from(new Set(responsibilities.filter((row) => row.mapping_status === "CONFIRMED" && row.lead_department_id).map((row) => row.lead_department_id as string)));
      const candidates = responsibilityDepartmentCandidates(group.sourceLeadLabel, data.departments);
      return {
        ...group,
        criteria,
        priorityCount: responsibilities.filter((row) => row.is_priority).length,
        confirmedDepartmentIds,
        confirmed: responsibilities.length === criteria.length && criteria.length > 0 && responsibilities.every((row) => row.mapping_status === "CONFIRMED" && !!row.lead_department_id),
        candidates,
        manualConfirmation: sourceNeedsManualConfirmation(group.sourceLeadLabel),
      };
    });
  }, [data]);

  const confirmedCriteria = data?.criteria.filter((item) => item.responsibility?.mapping_status === "CONFIRMED" && item.responsibility.lead_department_id).length ?? 0;
  const priorityTotal = data?.criteria.filter((item) => item.responsibility?.is_priority).length ?? 0;
  const clearGroups = groups.filter((group) => !group.confirmed && !group.manualConfirmation && group.candidates.length === 1);

  async function confirmGroup(sourceLeadLabel: string, departmentId: string) {
    const response = await fetch("/api/assessments/responsibilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CONFIRM_GROUP", source_lead_label: sourceLeadLabel, department_id: departmentId }),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "Không xác nhận được phân công.");
    return json;
  }

  async function applyOne(group: (typeof groups)[number]) {
    const departmentId = selection[group.sourceLeadLabel] || (group.candidates.length === 1 ? group.candidates[0].id : "");
    if (!departmentId) {
      setMessage({ tone: "error", text: "Cần chọn đúng khoa/phòng hiện hành trước khi xác nhận." });
      return;
    }
    setBusy(true);
    setMessage({ tone: "info", text: "Đang áp dụng phân công cho “" + group.sourceLeadLabel + "”…" });
    try {
      const result = await confirmGroup(group.sourceLeadLabel, departmentId);
      setMessage({ tone: "success", text: "Đã gán " + result.confirmed + " tiêu chí cho " + result.department_name + "." });
      await load();
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Không xác nhận được phân công." });
    } finally {
      setBusy(false);
    }
  }

  async function applyAllClear() {
    if (!clearGroups.length) return;
    setBusy(true);
    setMessage({ tone: "info", text: "Đang áp dụng các nhóm có đúng 01 đơn vị khớp rõ…" });
    try {
      let criteriaCount = 0;
      for (const group of clearGroups) {
        const result = await confirmGroup(group.sourceLeadLabel, group.candidates[0].id);
        criteriaCount += Number(result.confirmed || 0);
      }
      await load();
      router.refresh();
      setMessage({ tone: "success", text: "Đã xác nhận tự động " + criteriaCount + " tiêu chí thuộc các nhóm khớp rõ. Nhóm còn mơ hồ vẫn giữ chờ xác nhận." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Không áp dụng được phân công." });
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel criteria-source-map">
    <style>{`
      .criteria-source-map{overflow:hidden}.csm-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:15px 17px;border-bottom:1px solid #e7eef2;background:linear-gradient(135deg,#fbfdff,#f4f8fc)}
      .csm-head h2{font-size:15px;margin:0;color:#183b61}.csm-head p{font-size:10.5px;color:#64748b;margin:4px 0 0;line-height:1.45;max-width:820px}.csm-stats{display:flex;gap:7px;flex-wrap:wrap;align-items:center}.csm-chip{display:inline-flex;padding:5px 8px;border-radius:999px;background:#edf3f7;color:#50687a;font-size:9px;font-weight:850}.csm-chip.ok{background:#e9f6ef;color:#1d6b47}.csm-chip.warn{background:#fff4da;color:#875b13}
      .csm-list{display:grid;gap:8px;padding:12px 14px 15px}.csm-row{display:grid;grid-template-columns:minmax(0,1.4fr) 90px minmax(160px,.8fr) minmax(180px,1fr) auto;gap:10px;align-items:center;border:1px solid #e2e8f0;border-radius:13px;background:#fff;padding:10px 12px}.csm-row.needs{border-color:#efd39c;background:#fffdfa}.csm-source strong{font-size:11.5px;color:#263b50}.csm-source small{display:block;margin-top:3px;font-size:9.5px;color:#75838d;line-height:1.4}.csm-count{font-size:10px;color:#64748b}.csm-count strong{display:block;font-size:16px;color:#183b61}.csm-status{display:inline-flex;padding:5px 7px;border-radius:999px;background:#eef3f7;color:#526779;font-size:9px;font-weight:850}.csm-status.ok{background:#e9f6ef;color:#1d6b47}.csm-status.warn{background:#fff2d6;color:#8a5a12}.csm-actions{display:flex;justify-content:flex-end}.csm-actions .button{white-space:nowrap}
      @media(max-width:950px){.csm-row{grid-template-columns:1fr 1fr}.csm-source{grid-column:1/-1}.csm-actions{justify-content:flex-start}}@media(max-width:650px){.csm-head{display:grid}.csm-row{grid-template-columns:1fr}.csm-source{grid-column:auto}.csm-actions .button,.csm-row select{width:100%}}
    `}</style>
    <div className="csm-head">
      <div>
        <h2>Phân công 83 tiêu chí 2026 · kế thừa từ nguồn</h2>
        <p>Không nhập lại 83 dòng. QARICA giữ nguyên tên đơn vị trong tài liệu nguồn, đối chiếu với danh mục khoa/phòng hiện hành và chỉ tự áp dụng khi có đúng một kết quả phù hợp. Nhóm mơ hồ phải xác nhận một lần.</p>
      </div>
      <div className="csm-stats">
        <span className="csm-chip ok">{confirmedCriteria}/83 đã ánh xạ</span>
        <span className="csm-chip">{priorityTotal}/13 ưu tiên</span>
        <span className="csm-chip warn">{groups.filter((group) => !group.confirmed).length} nhóm còn chờ</span>
        {canManage && clearGroups.length ? <button className="button secondary small" disabled={busy} onClick={applyAllClear}>Áp dụng nhóm khớp rõ</button> : null}
      </div>
    </div>
    {message ? <div className={`alert ${message.tone === "error" ? "error" : message.tone === "success" ? "success" : "info"}`} style={{ margin: "10px 14px 0" }}>{message.text}</div> : null}
    {!data ? <div className="empty-state">Đang đọc Bảng phân công 83 tiêu chí…</div> : <div className="csm-list">
      {groups.map((group) => {
        const selectedId = selection[group.sourceLeadLabel] || "";
        const confirmedDept = group.confirmedDepartmentIds.length === 1 ? data.departments.find((item) => item.id === group.confirmedDepartmentIds[0]) : null;
        const needsChoice = !group.confirmed && (group.manualConfirmation || group.candidates.length !== 1);
        return <article key={group.sourceLeadLabel} className={`csm-row ${needsChoice ? "needs" : ""}`}>
          <div className="csm-source"><strong>{group.sourceLeadLabel}</strong><small>{group.codes.join(", ")}{group.priorityCount ? " · " + group.priorityCount + " tiêu chí ưu tiên" : ""}</small></div>
          <div className="csm-count"><strong>{group.criteria.length}</strong>tiêu chí</div>
          <div>{group.confirmed ? <span className="csm-status ok">✓ Đã xác nhận</span> : group.candidates.length === 1 ? <><span className="csm-status warn">Khớp 01 đơn vị</span><div className="subline">{group.candidates[0].name}</div></> : group.candidates.length > 1 ? <span className="csm-status warn">{group.candidates.length} khả năng phù hợp</span> : <span className="csm-status warn">Chưa khớp tự động</span>}</div>
          <div>{group.confirmed ? <strong style={{ fontSize: 10.5 }}>{confirmedDept?.name || "Đơn vị đã xác nhận"}</strong> : canManage && needsChoice ? <select value={selectedId} onChange={(event) => setSelection((current) => ({ ...current, [group.sourceLeadLabel]: event.target.value }))}><option value="">-- Chọn đơn vị hiện hành --</option>{data.departments.map((department) => <option value={department.id} key={department.id}>{department.name}</option>)}</select> : <span className="muted" style={{ fontSize: 10 }}>Nguồn được giữ nguyên, chưa tự suy diễn.</span>}</div>
          <div className="csm-actions">{canManage && !group.confirmed ? <button className="button primary small" disabled={busy || (needsChoice && !selectedId)} onClick={() => applyOne(group)}>Xác nhận & áp dụng</button> : null}</div>
        </article>;
      })}
    </div>}
  </section>;
}
