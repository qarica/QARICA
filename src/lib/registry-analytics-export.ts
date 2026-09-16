export type AnalyticsExportRow = {
  record_code: string;
  record_type: string;
  title: string;
  lifecycle_status: string;
  department_name: string;
  owner_name: string;
  created_at: string;
  updated_at?: string | null;
};

function safe(value: unknown) {
  const text = value == null ? "" : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function cell(value: unknown) {
  return `"${safe(value).replace(/"/g, '""')}"`;
}

function hcm(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

export function buildRegistryAnalyticsCsv({ year, month, department, status, rows }: { year: number; month?: number | null; department?: string | null; status?: string | null; rows: AnalyticsExportRow[] }) {
  const metadata: Array<[string, unknown]> = [
    ["Báo cáo", "Quality Intelligence - Registry"],
    ["Năm", year],
    ["Tháng", month || "Tất cả"],
    ["Khoa/Phòng", department || "Tất cả"],
    ["Trạng thái", status && status !== "ALL" ? status : "Tất cả"],
    ["Số hồ sơ", rows.length],
  ];
  const lines = metadata.map(([label, value]) => [cell(label), cell(value)].join(";"));
  lines.push("");
  lines.push(["STT", "Mã hồ sơ", "Module", "Tên hồ sơ", "Khoa/Phòng", "Người phụ trách", "Trạng thái", "Ngày ghi nhận", "Cập nhật gần nhất"].map(cell).join(";"));
  rows.forEach((row, index) => lines.push([index + 1, row.record_code, row.record_type, row.title, row.department_name, row.owner_name, row.lifecycle_status, hcm(row.created_at), hcm(row.updated_at)].map(cell).join(";")));
  return `\uFEFF${lines.join("\r\n")}`;
}

export function analyticsExportFileName(year: number, month?: number | null) {
  return `quality-intelligence-${year}${month ? `-thang-${String(month).padStart(2, "0")}` : ""}.csv`;
}
