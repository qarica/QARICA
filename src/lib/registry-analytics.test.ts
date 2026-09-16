import { describe, expect, it } from "vitest";
import { filterRegistryAnalyticsRows, registryMonthlyCounts, registryMonth } from "./registry-analytics";

const rows = [
  { record_type: "FINDING", lifecycle_status: "ACTIVE", owner_department_id: "d1", created_at: "2026-01-15T01:00:00Z", updated_at: "2026-09-10T01:00:00Z" },
  { record_type: "CAPA", lifecycle_status: "CLOSED", owner_department_id: "d1", created_at: "2026-02-10T01:00:00Z", updated_at: "2026-02-11T01:00:00Z" },
  { record_type: "RISK", lifecycle_status: "ACTIVE", owner_department_id: "d2", created_at: "2026-02-20T01:00:00Z", updated_at: "2026-08-11T01:00:00Z" },
];

describe("registry analytics semantics", () => {
  it("uses created_at for monthly buckets, not updated_at", () => {
    expect(registryMonth(rows[0].created_at)).toBe(1);
    const months = registryMonthlyCounts(rows);
    expect(months[0].value).toBe(1);
    expect(months[1].value).toBe(2);
    expect(months[8].value).toBe(0);
  });

  it("buckets timestamps by Asia/Ho_Chi_Minh instead of server timezone", () => {
    expect(registryMonth("2026-01-31T17:30:00Z")).toBe(2);
    expect(registryMonth("2026-02-28T17:30:00Z")).toBe(3);
  });

  it("applies month, department and status filters together", () => {
    const filtered = filterRegistryAnalyticsRows(rows, { month: 2, departmentId: "d1", status: "CLOSED" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].record_type).toBe("CAPA");
  });

  it("treats ALL status as no status filter", () => {
    expect(filterRegistryAnalyticsRows(rows, { status: "ALL" })).toHaveLength(3);
  });
});
