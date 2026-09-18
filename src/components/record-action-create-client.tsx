"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AssignmentTargetSelect,
  parseAssignmentTargetToken,
  type AssignmentTargetOption,
} from "@/components/assignment-target-select";

type Department = { id: string; name: string; short_name?: string | null };
type Profile = { user_id: string; full_name?: string | null; email?: string | null; primary_department_id?: string | null };
type WorkGroup = { id: string; code?: string | null; name: string; lead_department_id?: string | null; leader_user_id?: string | null };
type FailureMode = { id: string; label: string; high?: boolean };
type RootCause = { id: string; label: string; actionRequired?: boolean };

export function RecordActionCreateClient({
  recordId,
  recordType,
  sourceTitle,
  departments,
  profiles,
  groups,
  failureModes = [],
  rootCauses = [],
}: {
  recordId: string;
  recordType: string;
  sourceTitle: string;
  departments: Department[];
  profiles: Profile[];
  groups: WorkGroup[];
  failureModes?: FailureMode[];
  rootCauses?: RootCause[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [departmentId, setDepartmentId] = useState("");
  const [assignmentToken, setAssignmentToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedRootCauseIds, setSelectedRootCauseIds] = useState<string[]>([]);
  const [capaActionType, setCapaActionType] = useState("CORRECTIVE");
  const assignmentOptions = useMemo<AssignmentTargetOption[]>(() => {
    const departmentMap = new Map(departments.map((department) => [department.id, department.short_name || department.name]));
    return [
      ...profiles.map((profile) => ({
        id: profile.user_id,
        kind: "USER" as const,
        label: profile.full_name || profile.email || profile.user_id,
        description: profile.primary_department_id ? departmentMap.get(profile.primary_department_id) || null : null,
        departmentId: profile.primary_department_id || null,
      })),
      ...groups.map((group) => ({
        id: group.id,
        kind: "GROUP" as const,
        label: [group.code, group.name].filter(Boolean).join(" · "),
        description: "Nhóm phân công",
        departmentId: group.lead_department_id || null,
      })),
    ];
  }, [profiles, groups, departments]);

  function toggleRootCause(id: string, checked: boolean) {
    setSelectedRootCauseIds((current) => checked ? Array.from(new Set([...current, id])) : current.filter((value) => value !== id));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (recordType === "CAPA" && rootCauses.length && ["CORRECTIVE", "PREVENTIVE"].includes(capaActionType) && selectedRootCauseIds.length === 0) {
      setError("Hành động khắc phục/phòng ngừa của CAPA có RCA phải gắn với ít nhất một nguyên nhân gốc.");
      return;
    }
    const raw: Record<string, unknown> = Object.fromEntries(new FormData(form).entries());
    const assignmentTarget = parseAssignmentTargetToken(assignmentToken);
    if (!assignmentTarget) {
      setError("Cần chọn cá nhân hoặc nhóm được giao việc.");
      return;
    }
    raw.assignment_target_type = assignmentTarget.kind;
    if (assignmentTarget.kind === "GROUP") {
      raw.assignee_group_id = assignmentTarget.id;
      delete raw.assignee_user_id;
    } else {
      raw.assignee_user_id = assignmentTarget.id;
      delete raw.assignee_group_id;
    }
    raw.root_cause_ids = selectedRootCauseIds;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/records/${recordId}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(raw) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Không tạo được công việc.");
      form.reset();
      setDepartmentId("");
      setAssignmentToken("");
      setSelectedRootCauseIds([]);
      setCapaActionType("CORRECTIVE");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được công việc.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button className="button" type="button" onClick={() => { setOpen(true); setError(""); }}>+ Giao công việc</button>
    {open ? <div className="modal-backdrop" role="presentation"><div className="modal-card" role="dialog" aria-modal="true" aria-label="Giao công việc từ hồ sơ">
      <div className="modal-head"><div><strong>Giao công việc</strong><div className="subline">Nguồn: {sourceTitle}</div></div><button className="icon-button" type="button" onClick={() => setOpen(false)}>×</button></div>
      <form onSubmit={submit}><div className="modal-body form-stack">
        {error ? <div className="alert error">{error}</div> : null}
        {recordType === "FMEA" ? <label>Failure mode cần xử lý<select name="failure_mode_id" required><option value="">Chọn failure mode</option>{failureModes.map((m) => <option key={m.id} value={m.id}>{m.high ? "[Ưu tiên cao] " : ""}{m.label}</option>)}</select></label> : null}
        {rootCauses.length ? <div className="form-stack" style={{ gap: 7 }}><div style={{ fontSize: 12, fontWeight: 800 }}>Nguyên nhân gốc RCA mà Action này xử lý</div><div style={{ display: "grid", gap: 7 }}>{rootCauses.map((root) => <label key={root.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12 }}><input type="checkbox" checked={selectedRootCauseIds.includes(root.id)} onChange={(e) => toggleRootCause(root.id, e.target.checked)} style={{ width: "auto", marginTop: 2 }} /><span>{root.actionRequired ? "[Cần hành động] " : ""}{root.label}</span></label>)}</div><div className="subline">Có thể chọn nhiều nguyên nhân gốc. Liên kết này được dùng để kiểm tra gate đóng sự cố và truy vết hiệu lực CAPA.</div></div> : null}
        <label>Nội dung công việc<input name="title" required placeholder="Việc cần thực hiện" /></label>
        <div className="form-grid two">
          <label className="span-2">Giao cho *
            <AssignmentTargetSelect
              options={assignmentOptions}
              value={assignmentToken}
              onChange={(token) => {
                setAssignmentToken(token);
                const target = parseAssignmentTargetToken(token);
                const option = target ? assignmentOptions.find((item) => item.kind === target.kind && item.id === target.id) : null;
                if (option?.departmentId) setDepartmentId(option.departmentId);
              }}
              placeholder="Tìm cá nhân hoặc nhóm..."
            />
            <span className="subline">Chọn một lần; QARICA tự nhận biết cá nhân hay nhóm và tự lấy đơn vị mặc định.</span>
          </label>
          <details className="span-2">
            <summary className="subline" style={{ cursor: "pointer", fontWeight: 700 }}>Điều chỉnh đơn vị phụ trách</summary>
            <label style={{ marginTop: 8 }}>Khoa/Phòng phụ trách<select name="lead_department_id" required value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}><option value="">Chọn khoa/phòng</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.short_name || d.name}</option>)}</select></label>
          </details>
          <label>Ngày bắt đầu<input name="start_date" type="date" /></label><label>Hạn hoàn thành<input name="due_date" type="date" required /></label>
          <label>Mức ưu tiên<select name="priority" defaultValue="NORMAL"><option value="LOW">Thấp</option><option value="NORMAL">Bình thường</option><option value="HIGH">Cao</option><option value="URGENT">Khẩn</option><option value="CRITICAL">Rất khẩn / trọng yếu</option></select></label>
          {recordType === "CAPA" ? <label>Loại hành động CAPA<select name="capa_action_type" value={capaActionType} onChange={(e) => setCapaActionType(e.target.value)}><option value="CORRECTION">Khắc phục tức thời</option><option value="CORRECTIVE">Khắc phục nguyên nhân</option><option value="PREVENTIVE">Phòng ngừa tái diễn</option><option value="VERIFICATION">Xác minh</option></select></label> : null}
          {recordType === "RISK" ? <label>Biện pháp xử lý rủi ro<select name="risk_treatment_type" defaultValue="REDUCE"><option value="AVOID">Tránh</option><option value="REDUCE">Giảm thiểu</option><option value="TRANSFER">Chuyển giao</option><option value="ACCEPT">Chấp nhận</option><option value="CONTINGENCY">Dự phòng</option></select></label> : null}
        </div>
        <label>Kết quả mong đợi<textarea name="expected_result" required placeholder="Sản phẩm/kết quả phải có khi hoàn thành" /></label>
        <label>Yêu cầu minh chứng / xác minh<textarea name="verification_requirement" placeholder="File, biên bản, ảnh, số liệu hoặc cách kiểm tra kết quả" /></label>
        <label>Hướng dẫn thực hiện<textarea name="description" placeholder="Mô tả thêm nếu cần" /></label>
      </div><div className="modal-footer"><button className="button secondary" type="button" onClick={() => setOpen(false)}>Hủy</button><button className="button" disabled={busy} type="submit">{busy ? "Đang tạo…" : "Tạo & giao việc"}</button></div></form>
    </div></div> : null}
  </>;
}
