"use client";

import { useMemo, useState } from "react";
import { MultiCheckSelect } from "@/components/multi-check-select";

export type AssignmentTargetKind = "USER" | "GROUP";
export type AssignmentTargetOption = {
  id: string;
  kind: AssignmentTargetKind;
  label: string;
  description?: string | null;
  departmentId?: string | null;
};

export function assignmentTargetToken(kind: AssignmentTargetKind, id: string) {
  return `${kind}:${id}`;
}

export function parseAssignmentTargetToken(value: string | null | undefined) {
  const raw = String(value || "").trim();
  const separator = raw.indexOf(":");
  if (separator <= 0) return null;
  const kind = raw.slice(0, separator).toUpperCase();
  const id = raw.slice(separator + 1);
  if (!id || (kind !== "USER" && kind !== "GROUP")) return null;
  return { kind: kind as AssignmentTargetKind, id };
}

export function AssignmentTargetSelect({
  options,
  value,
  onChange,
  placeholder = "Tìm cá nhân hoặc nhóm...",
  disabled = false,
}: {
  options: AssignmentTargetOption[];
  value: string;
  onChange: (token: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const tokenMap = useMemo(() => new Map(options.map((item) => [assignmentTargetToken(item.kind, item.id), item])), [options]);
  const selected = tokenMap.get(value);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((item) => `${item.label} ${item.description || ""}`.toLowerCase().includes(q));
  }, [options, search]);

  return <div className="assignment-target-select">
    <style>{"\n.assignment-target-select{position:relative}.ats-trigger{width:100%;min-height:42px;border:1px solid var(--line);border-radius:10px;background:#fff;padding:8px 10px;text-align:left;cursor:pointer}.ats-trigger:disabled{opacity:.65;cursor:not-allowed}.ats-placeholder{color:#94a3b8}.ats-selected{display:flex;align-items:center;gap:8px;font-weight:750;color:#24424b}.ats-selected small{font-weight:500;color:#75858b}.ats-panel{position:absolute;z-index:45;left:0;right:0;top:calc(100% + 4px);background:#fff;border:1px solid #d8e2e6;border-radius:12px;box-shadow:0 14px 38px rgba(21,48,57,.14);padding:9px;display:grid;gap:7px;max-height:360px}.ats-search{width:100%}.ats-list{display:grid;gap:3px;overflow:auto;max-height:285px}.ats-row{border:0;background:#fff;text-align:left;padding:8px;border-radius:8px;cursor:pointer;display:grid;grid-template-columns:24px 1fr;gap:7px;align-items:start}.ats-row:hover{background:#f4f8f9}.ats-row strong{font-size:11px}.ats-row small{display:block;color:#75858b;font-size:10px;margin-top:2px}.ats-empty{padding:9px;color:#75858b;font-size:10px}.ats-kind{font-size:14px;line-height:1.2}.ats-footer{display:flex;justify-content:flex-end;border-top:1px solid #edf1f2;padding-top:7px}.ats-link{border:0;background:none;color:#2563eb;font-size:10.5px;font-weight:750;cursor:pointer;padding:3px}\n"}</style>
    <button type="button" className="ats-trigger" disabled={disabled} aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      {selected ? <span className="ats-selected"><span>{selected.kind === "GROUP" ? "👥" : "👤"}</span><span>{selected.label}{selected.description ? <small>{selected.description}</small> : null}</span></span> : <span className="ats-placeholder">{placeholder}</span>}
    </button>
    {open && !disabled ? <div className="ats-panel">
      <input className="ats-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm nhanh..." autoFocus />
      <div className="ats-list">
        {filtered.map((item) => {
          const token = assignmentTargetToken(item.kind, item.id);
          return <button type="button" className="ats-row" key={token} onClick={() => { onChange(token); setOpen(false); setSearch(""); }}>
            <span className="ats-kind">{item.kind === "GROUP" ? "👥" : "👤"}</span>
            <span><strong>{item.label}</strong><small>{item.kind === "GROUP" ? "Nhóm" : "Cá nhân"}{item.description ? ` · ${item.description}` : ""}</small></span>
          </button>;
        })}
        {!filtered.length ? <div className="ats-empty">Không có cá nhân hoặc nhóm phù hợp.</div> : null}
      </div>
      <div className="ats-footer"><button type="button" className="ats-link" onClick={() => { setOpen(false); setSearch(""); }}>Đóng</button></div>
    </div> : null}
  </div>;
}

export function AssignmentTargetsMultiSelect({
  options,
  value,
  onChange,
  placeholder = "Thêm cá nhân hoặc nhóm hỗ trợ",
}: {
  options: AssignmentTargetOption[];
  value: string[];
  onChange: (tokens: string[]) => void;
  placeholder?: string;
}) {
  const mapped = useMemo(() => options.map((item) => ({
    id: assignmentTargetToken(item.kind, item.id),
    label: `${item.kind === "GROUP" ? "👥" : "👤"} ${item.label}`,
    description: `${item.kind === "GROUP" ? "Nhóm" : "Cá nhân"}${item.description ? ` · ${item.description}` : ""}`,
  })), [options]);

  return <MultiCheckSelect
    options={mapped}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    emptyText="Không có cá nhân hoặc nhóm phù hợp."
  />;
}
