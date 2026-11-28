import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  countCapaEffectivenessDue,
  countOutOfTargetIndicators,
  countOverdueActions,
  countOverdueFindings,
  countSeriousOpenIncidents,
  isPastDue,
  sumOverduePlanActions,
} from "./quality-priority-signals";

const today = "2026-11-28";

describe("quality-priority-signals — một cách tính cho cả hai khối ưu tiên trên Dashboard", () => {
  it("quá hạn là ngày hạn đã qua; đến hạn đúng hôm nay chưa tính", () => {
    expect(isPastDue("2026-11-27", today)).toBe(true);
    expect(isPastDue("2026-11-28", today)).toBe(false);
    expect(isPastDue("2026-11-28T23:00:00+07:00", today)).toBe(false);
    expect(isPastDue(null, today)).toBe(false);
  });

  it("sự cố nghiêm trọng đang mở: loại CLOSED, CANCELLED và REJECTED (trước đây Smart vẫn đếm REJECTED)", () => {
    const rows = [
      { serious_event_flag: true, workflow_status: "INVESTIGATING" },
      { serious_event_flag: true, workflow_status: "REJECTED" },
      { serious_event_flag: true, workflow_status: "CLOSED" },
      { serious_event_flag: false, workflow_status: "REPORTED" },
    ];
    expect(countSeriousOpenIncidents(rows)).toBe(1);
  });

  it("CAPA cần đánh giá: không đếm CAPA đã đóng / đã có hiệu lực dù hạn đã qua (trước đây Dashboard vẫn đếm)", () => {
    const rows = [
      { workflow_status: "IN_PROGRESS", effectiveness_due_date: "2026-11-01" },
      { workflow_status: "EFFECTIVENESS_REVIEW", effectiveness_due_date: null },
      { workflow_status: "CLOSED", effectiveness_due_date: "2026-10-01" },
      { workflow_status: "EFFECTIVE", effectiveness_due_date: "2026-10-01" },
      { workflow_status: "IN_PROGRESS", effectiveness_due_date: "2026-11-28" },
    ];
    expect(countCapaEffectivenessDue(rows, today)).toBe(2);
  });

  it("Finding quá hạn, chỉ số ngoài mục tiêu, Action", () => {
    expect(countOverdueFindings([{ workflow_status: "OPEN", due_date: "2026-11-01" }, { workflow_status: "CLOSED", due_date: "2026-11-01" }], today)).toBe(1);
    expect(countOutOfTargetIndicators([{ workflow_status: "VERIFIED", result_level: "OUT_OF_TARGET" }, { workflow_status: "SUBMITTED", result_level: "OUT_OF_TARGET" }])).toBe(1);
    expect(sumOverduePlanActions([{ overdue_actions: 2 }, { overdue_actions: "3" }, {}])).toBe(5);
    expect(countOverdueActions([{ workflow_status: "IN_PROGRESS", is_overdue: true }, { workflow_status: "COMPLETED", is_overdue: true }, { workflow_status: "ASSIGNED", due_date: "2026-11-20" }], today)).toBe(2);
  });

  it("cả Dashboard (Ưu tiên điều hành) và Smart Command Center (Ưu tiên đề xuất) đều dùng chung các hàm này, cùng bộ lọc khoa/phòng", () => {
    const dash = readFileSync("src/app/(app)/dashboard/page.tsx", "utf8");
    const smart = readFileSync("src/components/tqm-smart-command-center.tsx", "utf8");
    for (const fn of ["countSeriousOpenIncidents", "countOverdueFindings", "countCapaEffectivenessDue", "countOutOfTargetIndicators"]) {
      expect(dash).toContain(`${fn}(`);
      expect(smart).toContain(`${fn}(`);
    }
    expect(dash).toContain("<TqmSmartCommandCenter year={year} departmentId={selectedDept || null} />");
    expect(smart).toContain("(!departmentId || row.owner_department_id === departmentId)");
  });
});
