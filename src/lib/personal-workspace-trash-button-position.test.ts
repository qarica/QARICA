import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Real report: "rà soát vị trí Thùng rác" — the trash toggle used to be the
// FIRST button in .pw-tabs, ahead of both real content tabs ("Việc cần
// làm"/"Ghi chú / quy trình"), reading as if it were a third tab rather
// than a secondary utility action. Moved to the end of the row and pushed
// flush right so primary tabs (left) and the secondary trash action
// (right) read as visually distinct groups.
describe("Cá nhân workspace: Thùng rác button sits after the content tabs, not before them", () => {
  const source = readFileSync("src/components/personal-workspace-client.tsx", "utf8");

  it("Việc cần làm / Ghi chú tabs appear before the Thùng rác button in source order", () => {
    const taskTabIndex = source.indexOf("Việc cần làm");
    const noteTabIndex = source.indexOf("Ghi chú / quy trình");
    const trashButtonIndex = source.indexOf("pw-trash-btn");
    expect(taskTabIndex).toBeGreaterThan(0);
    expect(noteTabIndex).toBeGreaterThan(taskTabIndex);
    expect(trashButtonIndex).toBeGreaterThan(noteTabIndex);
  });

  it("the trash button is pushed to the right of the tab row, not just reordered", () => {
    expect(source).toContain(".pw-trash-btn { margin-left: auto; }");
  });
});
