"use client";
import { createContext, useCallback, useContext, useState } from "react";

// Tiện ích chung: cho phép một nút đặt trong PageHeader (server component cha) kích hoạt
// modal tạo mới đang sống trong một client component anh em — chỉ nâng state điều khiển
// hiển thị modal lên chung, không đụng business logic tạo hồ sơ của từng trang.
type Ctx = { openSignal: number; requestOpen: () => void };
const SignalCtx = createContext<Ctx | null>(null);

export function CreateModalProvider({ children }: { children: React.ReactNode }) {
  const [openSignal, setOpenSignal] = useState(0);
  const requestOpen = useCallback(() => setOpenSignal((s) => s + 1), []);
  return <SignalCtx.Provider value={{ openSignal, requestOpen }}>{children}</SignalCtx.Provider>;
}

export function useCreateModalSignal() {
  const ctx = useContext(SignalCtx);
  if (!ctx) throw new Error("useCreateModalSignal must be used within CreateModalProvider");
  return ctx;
}

export function CreateModalButton({ children }: { children: React.ReactNode }) {
  const { requestOpen } = useCreateModalSignal();
  return <button type="button" className="button primary" onClick={requestOpen}>{children}</button>;
}
