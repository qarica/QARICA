import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("notification bell UX", () => {
  it("shows mark-read failures inline instead of browser alerts", () => {
    const source = readFileSync("src/components/notification-bell.tsx", "utf8");
    expect(source).not.toContain("window.alert");
    expect(source).toContain("actionError");
    expect(source).toContain("alert error");
  });
});
