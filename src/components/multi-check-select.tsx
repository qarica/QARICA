"use client";

import { useMemo, useState } from "react";

export type MultiCheckOption = { id: string; label: string; description?: string | null };

export function MultiCheckSelect({
  options,
  value,
  onChange,
  placeholder = "Chọn...",
  emptyText = "Không có dữ liệu phù hợp.",
  disabled = false,
}: {
  options: MultiCheckOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = useMemo(() => new Set(value), [value]);
  const optionMap = useMemo(() => new Map(options.map((x) => [x.id, x])), [options]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? options.filter((x) => (x.label + " " + (x.description || "")).toLowerCase().includes(q)) : options;
  }, [options, search]);

  function toggle(id: string) {
    onChange(selected.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  return <div className="multi-check-select">
    <style>{"\n      .multi-check-select{position:relative;display:grid;gap:7px}\n      .mcs-trigger{min-height:42px;width:100%;border:1px solid var(--line);border-radius:10px;background:#fff;padding:7px 9px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;text-align:left;cursor:pointer}\n      .mcs-trigger:disabled{opacity:.65;cursor:not-allowed}\n      .mcs-placeholder{color:#94a3b8;font-size:12px}\n      .mcs-chip{display:inline-flex;align-items:center;gap:5px;border-radius:999px;background:#eef5f7;color:#24424b;padding:5px 8px;font-size:10.5px;font-weight:750}\n      .mcs-more{font-size:10px;color:#64748b;font-weight:700}\n      .mcs-panel{position:absolute;z-index:40;left:0;right:0;top:calc(100% + 4px);background:#fff;border:1px solid #d8e2e6;border-radius:12px;box-shadow:0 14px 38px rgba(21,48,57,.14);padding:9px;display:grid;gap:7px;max-height:330px}\n      .mcs-search{width:100%}\n      .mcs-list{display:grid;gap:3px;overflow:auto;max-height:245px}\n      .mcs-row{display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:start;padding:7px;border-radius:8px;font-size:11px;font-weight:650;cursor:pointer}\n      .mcs-row:hover{background:#f4f8f9}.mcs-row input{margin-top:2px;width:auto}\n      .mcs-row small{display:block;color:#75858b;font-weight:500;margin-top:2px;line-height:1.35}\n      .mcs-footer{display:flex;justify-content:space-between;gap:8px;border-top:1px solid #edf1f2;padding-top:7px}\n      .mcs-link{border:0;background:none;color:#2563eb;font-size:10.5px;font-weight:750;cursor:pointer;padding:3px}\n    "}</style>
    <button type="button" className="mcs-trigger" disabled={disabled} aria-expanded={open} onClick={() => setOpen((x) => !x)}>
      {!value.length ? <span className="mcs-placeholder">{placeholder}</span> : <>
        {value.slice(0, 3).map((id) => <span className="mcs-chip" key={id}>{optionMap.get(id)?.label || id}</span>)}
        {value.length > 3 ? <span className="mcs-more">+{value.length - 3} mục</span> : null}
      </>}
    </button>
    {open && !disabled ? <div className="mcs-panel">
      <input className="mcs-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm nhanh..." autoFocus />
      <div className="mcs-list">
        {filtered.map((item) => <label className="mcs-row" key={item.id}>
          <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
          <span>{item.label}{item.description ? <small>{item.description}</small> : null}</span>
        </label>)}
        {!filtered.length ? <div className="muted tiny" style={{ padding: 8 }}>{emptyText}</div> : null}
      </div>
      <div className="mcs-footer">
        <button type="button" className="mcs-link" onClick={() => onChange([])}>Bỏ chọn tất cả</button>
        <button type="button" className="mcs-link" onClick={() => { setOpen(false); setSearch(""); }}>Xong</button>
      </div>
    </div> : null}
  </div>;
}
