"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { fmtDate, maskVnDate, parseVnDate } from "../lib/vn-date";

type DateEvt = { target: { value: string; name?: string }; currentTarget: { value: string; name?: string } };

export type VnDateInputProps = {
  value?: string;
  defaultValue?: string;
  onChange?: (e: DateEvt) => void;
  onBlur?: (e: DateEvt) => void;
  min?: string;
  max?: string;
  name?: string;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  "data-validation-target"?: string;
};

/**
 * Thay thế <input type="date"> trong toàn hệ thống: nhập/hiển thị dd/mm/yyyy (không phụ thuộc
 * ngôn ngữ trình duyệt). Giữ nguyên "hợp đồng" của ô ngày gốc: giá trị luôn là ISO yyyy-mm-dd
 * ("" khi trống/chưa hợp lệ), onChange/onBlur nhận event có target.value ISO, `name` được gửi
 * kèm form qua input ẩn (FormData nhận ISO như cũ).
 */
export function VnDateInput(props: VnDateInputProps) {
  const { value, defaultValue, onChange, onBlur, min, max, name, id, className, style, title, required, disabled, autoFocus, placeholder } = props;
  const controlled = value !== undefined;
  const [iso, setIso] = useState(value ?? defaultValue ?? "");
  const [text, setText] = useState((value ?? defaultValue) ? fmtDate((value ?? defaultValue) as string) : "");
  const [invalid, setInvalid] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!controlled) return;
    const v = value || "";
    setIso(v);
    if (v && parseVnDate(text) !== v) setText(fmtDate(v));
    if (!v && text && parseVnDate(text)) setText("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    field.current?.setCustomValidity(required && !iso ? "Nhập ngày theo dd/mm/yyyy" : "");
  }, [required, iso]);

  const evt = (v: string): DateEvt => ({ target: { value: v, name }, currentTarget: { value: v, name } });

  function commit(next: string) {
    setIso(next);
    onChange?.(evt(next));
  }

  function handle(raw: string) {
    const masked = maskVnDate(raw);
    setText(masked);
    if (!masked) { setInvalid(false); commit(""); return; }
    const parsed = masked.length === 10 ? parseVnDate(masked) : null;
    const outOfRange = !!parsed && ((min && parsed < min) || (max && parsed > max));
    setInvalid(masked.length === 10 && (!parsed || !!outOfRange));
    commit(parsed && !outOfRange ? parsed : "");
  }

  return (
    <span className="vn-date" style={style}>
      <input
        ref={field}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        className={`${className || ""} ${invalid ? "invalid" : ""}`.trim()}
        placeholder={placeholder || "dd/mm/yyyy"}
        maxLength={10}
        value={text}
        disabled={disabled}
        required={required}
        title={invalid ? "Ngày không hợp lệ hoặc ngoài khoảng cho phép" : title}
        aria-label={props["aria-label"]}
        aria-invalid={invalid}
        data-validation-target={props["data-validation-target"]}
        onChange={(e) => handle(e.target.value)}
        onBlur={() => onBlur?.(evt(iso))}
      />
      {name ? <input type="hidden" name={name} value={iso} /> : null}
      <button type="button" className="vn-date-btn" aria-label="Chọn từ lịch" tabIndex={-1} disabled={disabled} onClick={() => { try { picker.current?.showPicker(); } catch { picker.current?.focus(); } }}>
        <Icon name="calendar-days" size={16} />
      </button>
      <input ref={picker} className="vn-date-native" type="date" tabIndex={-1} aria-hidden="true" min={min} max={max} value={iso} onChange={(e) => { if (e.target.value) { setText(fmtDate(e.target.value)); setInvalid(false); commit(e.target.value); } }} />
    </span>
  );
}
