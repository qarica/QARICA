"use client";
import { createContext, useContext, useMemo, useState } from "react";

// Selection UI thuần cho bảng "Việc của tôi": cho phép chọn dòng và biết đã chọn bao nhiêu.
// Không có bulk action thật gắn kèm (chưa có nghiệp vụ/API xử lý hàng loạt) nên KHÔNG bịa
// hành động — chỉ hiển thị số dòng đã chọn, đúng yêu cầu "row selection", không phải
// "bulk business action".
type Ctx = { selected: Set<string>; toggle: (key: string) => void; count: number };
const SelectionCtx = createContext<Ctx | null>(null);

export function WorkRowSelectionProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const value = useMemo(() => ({ selected, toggle, count: selected.size }), [selected]);
  return <SelectionCtx.Provider value={value}>{children}</SelectionCtx.Provider>;
}

function useSelection() {
  const ctx = useContext(SelectionCtx);
  if (!ctx) throw new Error("useSelection must be used within WorkRowSelectionProvider");
  return ctx;
}

export function WorkRowCheckbox({ rowKey }: { rowKey: string }) {
  const { selected, toggle } = useSelection();
  return <input type="checkbox" aria-label="Chọn dòng" checked={selected.has(rowKey)} onChange={() => toggle(rowKey)} />;
}

export function WorkSelectionCount() {
  const { count } = useSelection();
  if (!count) return null;
  return <span className="work-selection-count">{count} dòng đã chọn</span>;
}
