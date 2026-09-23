import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("plan composer task preservation", () => {
  it("blocks save instead of silently dropping untitled tasks", () => {
    const source=readFileSync("src/components/plan-composer-client.tsx","utf8");
    expect(source).toContain("const untitledTasks = taskTreeRows.filter");
    expect(source).toContain("nhiệm vụ chưa có tiêu đề");
    expect(source).not.toContain('.filter((task) => task.title.trim())');
  });
});
