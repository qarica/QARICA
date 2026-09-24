// So sánh chỉ số giữa các khoa/phòng cùng đo một chỉ số: xếp hạng khoa/phòng
// theo giá trị kỳ đo gần nhất (đã VERIFIED/LOCKED), theo đúng chiều tốt/xấu
// của chỉ số, và tính khoảng cách (gap) giữa khoa tốt nhất và khoa cần chú ý
// nhất — để QLCL ưu tiên hỗ trợ khoa/phòng đang lệch xa nhất, không phải để
// xếp hạng thi đua.

export type DesiredDirection = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER" | "TARGET_RANGE" | "NEUTRAL" | null | undefined;

export type BenchmarkInputRow = {
  indicator_key: string;
  indicator_label: string;
  department_id: string;
  department_label: string;
  direction: DesiredDirection;
  unit?: string | null;
  value: number | string | null;
  period_end?: string | null;
};

export type BenchmarkDepartmentRank = {
  department_id: string;
  department_label: string;
  value: number;
  period_end: string | null;
  rank: number;
};

export type BenchmarkGroup = {
  indicator_key: string;
  indicator_label: string;
  direction: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";
  unit?: string | null;
  departments: BenchmarkDepartmentRank[];
  best: BenchmarkDepartmentRank;
  worst: BenchmarkDepartmentRank;
  /** % chênh lệch tương đối giữa khoa tốt nhất và khoa cần chú ý nhất. */
  gapPct: number;
};

const EVALUABLE_DIRECTIONS = new Set(["HIGHER_IS_BETTER", "LOWER_IS_BETTER"]);

/**
 * `rows`: mỗi phần tử là 1 khoa/phòng cho 1 chỉ số, giá trị đo kỳ gần nhất đã
 * VERIFIED/LOCKED (đã lọc trước khi truyền vào). Nếu 1 chỉ số có nhiều dòng
 * cùng khoa/phòng (nhiều phân công), chỉ giữ dòng có period_end mới nhất.
 * Chỉ trả về nhóm chỉ số có từ `minDepartments` khoa/phòng trở lên (mặc định 2)
 * — không đủ khoa để so sánh thì không có ý nghĩa benchmark.
 */
export function buildDepartmentBenchmark(rows: BenchmarkInputRow[], options?: { minDepartments?: number }): BenchmarkGroup[] {
  const minDepartments = options?.minDepartments ?? 2;

  const byIndicator = new Map<string, BenchmarkInputRow[]>();
  for (const row of rows) {
    const direction = String(row.direction || "").toUpperCase();
    if (!EVALUABLE_DIRECTIONS.has(direction)) continue;
    if (row.value === null || row.value === undefined || row.value === "") continue;
    const value = Number(row.value);
    if (!Number.isFinite(value)) continue;
    if (!row.department_id) continue;
    const list = byIndicator.get(row.indicator_key) || [];
    list.push(row);
    byIndicator.set(row.indicator_key, list);
  }

  const groups: BenchmarkGroup[] = [];
  for (const [key, list] of byIndicator) {
    const byDept = new Map<string, BenchmarkInputRow>();
    for (const row of list) {
      const existing = byDept.get(row.department_id);
      if (!existing || String(row.period_end || "") > String(existing.period_end || "")) byDept.set(row.department_id, row);
    }
    if (byDept.size < minDepartments) continue;

    const direction = String(list[0].direction || "").toUpperCase() as "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";
    const sorted = Array.from(byDept.values()).sort((a, b) =>
      direction === "HIGHER_IS_BETTER" ? Number(b.value) - Number(a.value) : Number(a.value) - Number(b.value),
    );

    const departments: BenchmarkDepartmentRank[] = sorted.map((row, index) => ({
      department_id: row.department_id,
      department_label: row.department_label,
      value: Number(row.value),
      period_end: row.period_end ?? null,
      rank: index + 1,
    }));

    const best = departments[0];
    const worst = departments[departments.length - 1];
    const denom = Math.max(Math.abs(best.value), Math.abs(worst.value), 1e-9);
    const gapPct = Math.round((Math.abs(best.value - worst.value) / denom) * 1000) / 10;

    groups.push({
      indicator_key: key,
      indicator_label: list[0].indicator_label,
      direction,
      unit: list[0].unit ?? null,
      departments,
      best,
      worst,
      gapPct,
    });
  }

  return groups.sort((a, b) => b.gapPct - a.gapPct);
}
