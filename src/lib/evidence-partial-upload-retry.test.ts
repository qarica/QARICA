import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Action evidence partial upload retry", () => {
  it("removes successful files from pending selection before the next upload", () => {
    const source=readFileSync("src/components/task-workflow-client.tsx","utf8");
    expect(source).toContain("const pendingFiles = [...files]");
    expect(source).toContain("pendingFiles.shift()");
    expect(source).toContain("setFiles([...pendingFiles])");
    expect(source).toContain("Danh sách chọn chỉ còn các file chưa tải");
  });
});
