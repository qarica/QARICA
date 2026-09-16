"use client";

import Link from "next/link";

export function IncidentPrintActions({ recordId, compact = false }: { recordId: string; compact?: boolean }) {
  return <div className="incident-print-actions no-print">
    <style>{`.incident-print-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.incident-print-actions .ipa-button{border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:10px;padding:${compact ? "7px 10px" : "9px 12px"};font-size:${compact ? "12px" : "13px"};font-weight:750;text-decoration:none;cursor:pointer}.incident-print-actions .ipa-button.primary{background:#0f766e;color:#fff;border-color:#0f766e}.incident-print-actions .ipa-button:hover{filter:brightness(.98)}`}</style>
    <Link className="ipa-button" href={`/incidents/${recordId}/print`} target="_blank">Mở bản in / PDF</Link>
    {!compact ? <button className="ipa-button primary" type="button" onClick={() => window.print()}>In / Lưu PDF</button> : null}
  </div>;
}
