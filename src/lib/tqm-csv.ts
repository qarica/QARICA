export type CsvMetadata = Array<[string, unknown]>;

function safeSpreadsheetValue(value: unknown) {
  const text = value == null ? "" : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value: unknown) {
  const text = safeSpreadsheetValue(value).replace(/"/g, '""');
  return `"${text}"`;
}

export function buildTqmCsv({
  metadata = [],
  headers,
  rows,
}: {
  metadata?: CsvMetadata;
  headers: string[];
  rows: unknown[][];
}) {
  const lines = metadata.map(([label, value]) => [csvCell(label), csvCell(value)].join(";"));
  if (metadata.length) lines.push("");
  lines.push(headers.map(csvCell).join(";"));
  rows.forEach((row) => lines.push(row.map(csvCell).join(";")));
  return `\uFEFF${lines.join("\r\n")}`;
}

export function tqmCsvFileName(moduleName: string, year: number) {
  const safeName = String(moduleName || "bao-cao").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "bao-cao";
  return `${safeName}-${year}.csv`;
}
