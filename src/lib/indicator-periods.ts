export type IndicatorFrequency = "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL";

export type IndicatorPeriod = {
  key: string;
  label: string;
  start: string;
  end: string;
};

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function lastDay(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthPeriod(year: number, month: number): IndicatorPeriod {
  return {
    key: `${year}-M${String(month).padStart(2, "0")}`,
    label: `T${month}/${year}`,
    start: isoDate(year, month, 1),
    end: isoDate(year, month, lastDay(year, month)),
  };
}

function quarterPeriod(year: number, quarter: number): IndicatorPeriod {
  const firstMonth = (quarter - 1) * 3 + 1;
  const lastMonth = firstMonth + 2;
  return {
    key: `${year}-Q${quarter}`,
    label: `Quý ${quarter}/${year}`,
    start: isoDate(year, firstMonth, 1),
    end: isoDate(year, lastMonth, lastDay(year, lastMonth)),
  };
}

function halfPeriod(year: number, half: number): IndicatorPeriod {
  const firstMonth = half === 1 ? 1 : 7;
  const lastMonth = half === 1 ? 6 : 12;
  return {
    key: `${year}-H${half}`,
    label: `6 tháng ${half}/${year}`,
    start: isoDate(year, firstMonth, 1),
    end: isoDate(year, lastMonth, lastDay(year, lastMonth)),
  };
}

export function expectedIndicatorPeriods(input: {
  workYear: number;
  frequency: string | null | undefined;
  activeFrom: string | null | undefined;
  activeTo?: string | null | undefined;
  throughDate: string;
}) {
  const year = input.workYear;
  const frequency = String(input.frequency || "").toUpperCase() as IndicatorFrequency;
  const activeFrom = input.activeFrom || `${year}-01-01`;
  const activeTo = input.activeTo || `${year}-12-31`;
  const throughDate = input.throughDate < activeTo ? input.throughDate : activeTo;
  if (throughDate < activeFrom) return [] as IndicatorPeriod[];

  let periods: IndicatorPeriod[] = [];
  if (frequency === "MONTHLY") {
    periods = Array.from({ length: 12 }, (_, index) => monthPeriod(year, index + 1));
  } else if (frequency === "QUARTERLY") {
    periods = Array.from({ length: 4 }, (_, index) => quarterPeriod(year, index + 1));
  } else if (frequency === "SEMIANNUAL") {
    periods = [halfPeriod(year, 1), halfPeriod(year, 2)];
  } else if (frequency === "ANNUAL") {
    periods = [{ key: `${year}`, label: `Năm ${year}`, start: `${year}-01-01`, end: `${year}-12-31` }];
  } else {
    return [] as IndicatorPeriod[];
  }

  return periods
    .filter((period) => period.end >= activeFrom && period.start <= throughDate)
    .map((period) => ({
      ...period,
      start: period.start < activeFrom ? activeFrom : period.start,
      end: period.end > activeTo ? activeTo : period.end,
    }));
}
