export type MonitoringExportRow = {
  section: string;
  content: string;
  result: string;
  score?: number | null;
  note?: string | null;
  correction?: string | null;
  recheckResult?: string | null;
  answeredAt?: string | null;
};

function safeSpreadsheetValue(value: unknown) {
  const text = value == null ? "" : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value: unknown) {
  const text = safeSpreadsheetValue(value).replace(/"/g, '""');
  return `"${text}"`;
}

export function buildMonitoringCsv(
  metadata: Array<[string, unknown]>,
  rows: MonitoringExportRow[],
) {
  const lines = metadata.map(([label, value]) => [csvCell(label), csvCell(value)].join(";"));
  lines.push("");
  lines.push([
    "STT", "Tiêu chuẩn", "Nội dung", "Kết quả ban đầu", "Điểm", "Ghi chú",
    "Nội dung khắc phục", "Kết quả kiểm tra lại", "Thời gian trả lời",
  ].map(csvCell).join(";"));
  rows.forEach((row, index) => {
    lines.push([
      index + 1, row.section, row.content, row.result, row.score ?? "", row.note ?? "",
      row.correction ?? "", row.recheckResult ?? "", row.answeredAt ?? "",
    ].map(csvCell).join(";"));
  });
  return `\uFEFF${lines.join("\r\n")}`;
}

export function exportFileName(code: string | null | undefined) {
  const safeCode = (code || "bang-kiem").replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `ket-qua-${safeCode}.csv`;
}
