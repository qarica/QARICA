import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Yêu cầu tường minh: áp dụng khung Eisenhower (quan trọng x khẩn cấp) vào
// QARICA. Dùng chung cho Việc cá nhân (personal-reminders.tsx) và module
// Kế hoạch công việc (work-plans) — một hàm phân loại duy nhất, không lặp
// logic P1-P4 ở nhiều nơi.
describe("src/lib/eisenhower.ts: phân loại Eisenhower (P1-P4) dùng chung toàn app", () => {
  const lib = read("src/lib/eisenhower.ts");

  it("đúng 4 ô theo 2 trục quan trọng x khẩn cấp, đúng hành động gợi ý mỗi ô (Làm ngay/Lên lịch/Ủy thác/Xóa bỏ)", () => {
    expect(lib).toContain('if (params.important && params.urgent) return "P1";');
    expect(lib).toContain('if (params.important && !params.urgent) return "P2";');
    expect(lib).toContain('if (!params.important && params.urgent) return "P3";');
    expect(lib).toContain("return \"P4\";");
    expect(lib).toContain('P1: "Làm ngay",');
    expect(lib).toContain('P2: "Lên lịch làm",');
    expect(lib).toContain('P3: "Ủy thác / giao việc",');
    expect(lib).toContain('P4: "Xóa bỏ",');
  });

  it("personalReminderQuadrant(): quan trọng = priority HIGH/URGENT; khẩn cấp = hạn đã qua hoặc đúng hôm nay (<=today)", () => {
    expect(lib).toContain('const important = priority === "HIGH" || priority === "URGENT";');
    expect(lib).toContain("const urgent = !!dueDateOnly && dueDateOnly <= todayDateOnly;");
  });
});
