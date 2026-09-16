export type IndicatorMeasurementLike = {
  workflow_status?: string | null;
  result_level?: string | null;
  period_end?: string | null;
};

export type ProjectProgressLike = {
  actions?: number | null;
  completed?: number | null;
};

export function buildIndicatorKpi(rows: IndicatorMeasurementLike[]) {
  const evaluable = rows.filter((row) =>
    ["VERIFIED", "LOCKED"].includes(String(row.workflow_status || "").toUpperCase()) &&
    ["MEETS_TARGET", "OUT_OF_TARGET"].includes(String(row.result_level || "").toUpperCase()),
  );
  const inTarget = evaluable.filter((row) => String(row.result_level || "").toUpperCase() === "MEETS_TARGET").length;
  const outTarget = evaluable.filter((row) => String(row.result_level || "").toUpperCase() === "OUT_OF_TARGET").length;
  const percentage = evaluable.length ? Math.round((inTarget / evaluable.length) * 100) : 0;
  const trend = Array.from({ length: 12 }, (_, index) => {
    const monthRows = evaluable.filter((row) => Number(String(row.period_end || "").slice(5, 7)) === index + 1);
    const monthTarget = monthRows.filter((row) => String(row.result_level || "").toUpperCase() === "MEETS_TARGET").length;
    return { label: `T${index + 1}`, value: monthRows.length ? Math.round((monthTarget / monthRows.length) * 100) : 0 };
  });
  return { evaluable, inTarget, outTarget, percentage, trend };
}

export function buildProjectActionKpi(rows: ProjectProgressLike[]) {
  const actions = rows.reduce((sum, row) => sum + Number(row.actions || 0), 0);
  const completed = rows.reduce((sum, row) => sum + Number(row.completed || 0), 0);
  return { actions, completed, percentage: actions ? Math.round((completed / actions) * 100) : 0 };
}

export function isDueOnOrBeforeToday(value: unknown, today: string) {
  if (!value) return false;
  return String(value).slice(0, 10) <= today;
}

export function operationalRiskTone(count: number): "good" | "risk" {
  return count > 0 ? "risk" : "good";
}
