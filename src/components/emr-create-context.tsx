"use client";
import { createContext, useCallback, useContext, useState } from "react";

type EmrCreateCtxValue = { openSignal: number; requestOpen: () => void };
const EmrCreateCtx = createContext<EmrCreateCtxValue | null>(null);

// Cho phép nút "+ Thêm mục" đặt trong PageHeader (server component cha) kích hoạt
// modal tạo mới đang sống trong EmrCategoryClient (client component anh em) — chỉ
// nâng state điều khiển hiển thị modal lên chung, không đụng business logic tạo hồ sơ.
export function EmrCreateProvider({ children }: { children: React.ReactNode }) {
  const [openSignal, setOpenSignal] = useState(0);
  const requestOpen = useCallback(() => setOpenSignal((s) => s + 1), []);
  return <EmrCreateCtx.Provider value={{ openSignal, requestOpen }}>{children}</EmrCreateCtx.Provider>;
}

export function useEmrCreateSignal() {
  const ctx = useContext(EmrCreateCtx);
  if (!ctx) throw new Error("useEmrCreateSignal must be used within EmrCreateProvider");
  return ctx;
}

export function EmrCreateButton({ label }: { label: string }) {
  const { requestOpen } = useEmrCreateSignal();
  return <button type="button" className="button primary" onClick={requestOpen}>+ Thêm mục {label.toLowerCase()}</button>;
}
