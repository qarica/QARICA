"use client";

import { buildTqmCsv } from "@/lib/tqm-csv";

export function CsvDownloadButton({
  filename,
  headers,
  rows,
  metadata = [],
  label = "Xuất Excel (CSV)",
}: {
  filename: string;
  headers: string[];
  rows: unknown[][];
  metadata?: Array<[string, unknown]>;
  label?: string;
}) {
  function download() {
    if (!rows.length) return;
    const csv = buildTqmCsv({ metadata, headers, rows });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return <button type="button" className="button secondary" disabled={!rows.length} onClick={download}>{label}</button>;
}
