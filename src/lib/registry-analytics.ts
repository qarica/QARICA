import { hcmMonthNumber } from "./hcm-date";

export type RegistryAnalyticsRow = {
  record_type: string;
  lifecycle_status: string;
  owner_department_id: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type RegistryAnalyticsFilter = {
  month?: number | null;
  departmentId?: string | null;
  status?: string | null;
};

export function registryMonth(value: string | null | undefined) {
  return hcmMonthNumber(value);
}

export function filterRegistryAnalyticsRows<T extends RegistryAnalyticsRow>(rows: T[], filter: RegistryAnalyticsFilter) {
  const month = filter.month && filter.month >= 1 && filter.month <= 12 ? filter.month : null;
  const departmentId = filter.departmentId?.trim() || null;
  const status = filter.status?.trim().toUpperCase() || null;
  return rows.filter((row) => {
    if (month && registryMonth(row.created_at) !== month) return false;
    if (departmentId && row.owner_department_id !== departmentId) return false;
    if (status && status !== "ALL" && String(row.lifecycle_status).toUpperCase() !== status) return false;
    return true;
  });
}

export function registryMonthlyCounts(rows: RegistryAnalyticsRow[]) {
  const months = Array.from({ length: 12 }, (_, index) => ({ label: `T${index + 1}`, value: 0 }));
  for (const row of rows) {
    const month = registryMonth(row.created_at);
    if (month) months[month - 1].value += 1;
  }
  return months;
}
