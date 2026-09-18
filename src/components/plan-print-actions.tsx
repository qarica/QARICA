"use client";

import Link from "next/link";

export function PlanPrintActions({ planId, compact = false }: { planId: string; compact?: boolean }) {
  return <div className="plan-print-actions no-print">
    <style>{`.plan-print-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.plan-print-actions .ppa-button{border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:10px;padding:${compact ? "7px 10px" : "9px 12px"};font-size:${compact ? "12px" : "13px"};font-weight:750;text-decoration:none;cursor:pointer}.plan-print-actions .ppa-button.primary{background:#0f766e;color:#fff;border-color:#0f766e}.plan-print-actions .ppa-button:hover{filter:brightness(.98)}`}</style>
    <Link className="ppa-button" href={`/plans/${planId}/print`} target="_blank">Mở bản in / PDF</Link>\n    <a className="ppa-button" href={`/api/plans/${planId}/export/word`}>Word</a>\n    <a className="ppa-button" href={`/api/plans/${planId}/export/excel`}>Excel</a>
    {!compact ? <button className="ppa-button primary" type="button" onClick={() => window.print()}>In / Lưu PDF</button> : null}
  </div>;
}
