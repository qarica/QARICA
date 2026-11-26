"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { fmtDate, maskVnDate, parseVnDate } from "../lib/lab-supplies";

/**
 * Ô nhập ngày theo dd/mm/yyyy (không phụ thuộc ngôn ngữ trình duyệt như <input type="date">).
 * Giá trị trao đổi với form luôn là ISO yyyy-mm-dd ("" khi trống/chưa hợp lệ). Có nút lịch dùng bộ chọn ngày gốc.
 */
export function LabDateInput({ value, onChange, min, max, label, className }: { value: string; onChange: (iso: string) => void; min?: string; max?: string; label: string; className?: string }) {
  const [text, setText] = useState(value ? fmtDate(value) : "");
  const [invalid, setInvalid] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  // Đồng bộ khi giá trị bên ngoài đổi (VD: đặt lại sau khi ghi phiếu) mà không ghi đè lúc người dùng đang gõ dở.
  useEffect(() => {
    if (value && parseVnDate(text) !== value) setText(fmtDate(value));
    if (!value && text && parseVnDate(text)) setText("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handle(raw: string) {
    const masked = maskVnDate(raw);
    setText(masked);
    if (!masked) {
      setInvalid(false);
      onChange("");
      return;
    }
    const iso = masked.length === 10 ? parseVnDate(masked) : null;
    const outOfRange = !!iso && ((min && iso < min) || (max && iso > max));
    setInvalid(masked.length === 10 && (!iso || !!outOfRange));
    onChange(iso && !outOfRange ? iso : "");
  }

  return (
    <span className={`ls-date ${invalid ? "invalid" : ""} ${className || ""}`}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/yyyy"
        maxLength={10}
        value={text}
        aria-label={label}
        aria-invalid={invalid}
        title={invalid ? "Ngày không hợp lệ hoặc ngoài khoảng cho phép" : undefined}
        onChange={(e) => handle(e.target.value)}
      />
      <button type="button" className="ls-date-btn" aria-label={`${label}: chọn từ lịch`} tabIndex={-1} onClick={() => { try { picker.current?.showPicker(); } catch { picker.current?.focus(); } }}>
        <Icon name="calendar-days" size={16} />
      </button>
      <input ref={picker} className="ls-date-native" type="date" tabIndex={-1} aria-hidden="true" min={min} max={max} value={value} onChange={(e) => { if (e.target.value) { setText(fmtDate(e.target.value)); setInvalid(false); onChange(e.target.value); } }} />
    </span>
  );
}
