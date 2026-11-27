// Hàm ngày dd/mm/yyyy DÙNG CHUNG cho các module nghiệp vụ (Việc của tôi, công văn, kế hoạch...).
// Cố ý độc lập: module Kho là phần tách biệt và có bản riêng của các hàm này, không dùng chung với file này.

/** Ngày dạng ISO (yyyy-mm-dd) → dd/mm/yyyy. Rỗng → "—". */
export function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** dd/mm/yyyy (hoặc d/m/yyyy) → yyyy-mm-dd; null nếu không phải ngày có thật trên lịch. */
export function parseVnDate(text: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Tự chèn dấu "/" khi gõ ngày: "26112026" → "26/11/2026". */
export function maskVnDate(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
