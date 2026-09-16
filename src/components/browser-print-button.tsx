"use client";

export function BrowserPrintButton({ label = "In / Lưu PDF" }: { label?: string }) {
  return <button className="dpp-print" type="button" onClick={() => window.print()}>{label}</button>;
}
