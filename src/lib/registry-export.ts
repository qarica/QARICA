export type RegistryExportRow = {
  record_type: string;
  record_code: string;
  title: string;
  lifecycle_status: string;
  department_name: string;
  owner_name: string;
  created_at?: string | null;
  updated_at?: string | null;
};

function safeSpreadsheetValue(value: unknown) {
  const text = value == null ? "" : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value: unknown) {
  const text = safeSpreadsheetValue(value).replace(/"/g, '""');
  return `"${text}"`;
}

function formatHcm(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function buildRegistryCsv({
  recordType,
  year,
  query,
  status,
  rows,
}: {
  recordType: string;
  year: number;
  query?: string;
  status?: string;
  rows: RegistryExportRow[];
}) {
  const metadata: Array<[string, unknown]> = [
    ["Loại hồ sơ", recordType],
    ["Năm", year],
    ["Từ khóa lọc", query?.trim() || "Tất cả"],
    ["Trạng thái lọc", status && status !== "ALL" ? status : "Tất cả"],
    ["Số hồ sơ xuất", rows.length],
  ];
  const lines = metadata.map(([label, value]) => [csvCell(label), csvCell(value)].join(";"));
  lines.push("");
  lines.push([
    "STT",
    "Mã hồ sơ",
    "Loại hồ sơ",
    "Tên hồ sơ",
    "Khoa/Phòng phụ trách",
    "Người phụ trách",
    "Trạng thái Registry",
    "Thời điểm tạo",
    "Cập nhật gần nhất",
  ].map(csvCell).join(";"));
  rows.forEach((row, index) => {
    lines.push([
      index + 1,
      row.record_code,
      row.record_type,
      row.title,
      row.department_name,
      row.owner_name,
      row.lifecycle_status,
      formatHcm(row.created_at),
      formatHcm(row.updated_at),
    ].map(csvCell).join(";"));
  });
  return `\uFEFF${lines.join("\r\n")}`;
}

export function registryExportFileName(recordType: string, year: number) {
  const safeType = (recordType || "registry").toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return `danh-sach-${safeType}-${year}.csv`;
}
