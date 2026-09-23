const HCM_MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Ho_Chi_Minh",
  month: "numeric",
});

export function hcmMonthNumber(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const month = Number(HCM_MONTH_FORMATTER.format(date));
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
}


const HCM_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function hcmDateKey(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return HCM_DATE_FORMATTER.format(date);
}
