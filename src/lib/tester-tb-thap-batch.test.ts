import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("Tester TB/Thấp batch", () => {
  it("routeForRecord falls back to /dashboard instead of the never-implemented /records/{id}", () => {
    const source = read("src/lib/record-route.ts");
    expect(source).not.toContain('"/records/{id}"');
    expect(source).toContain('if (!raw) return "/dashboard";');
  });

  it("navigation-route-existence requires a real page.tsx for a direct href, not just an existing directory", () => {
    const source = read("src/lib/navigation-route-existence.test.ts");
    expect(source).not.toContain("existsSync(page) || existsSync(workspaceDir)");
    expect(source).toContain("expect(existsSync(page)).toBe(true);");
  });

  it("deleting a personal note requires confirmation", () => {
    const source = read("src/components/personal-reminders.tsx");
    expect(source).toContain('if(!window.confirm("Xóa note này? Không thể hoàn tác."))return;');
  });

  it("closing an incident requires confirmation before the irreversible CLOSE call", () => {
    const source = read("src/components/incident-workflow-client.tsx");
    expect(source).toContain('window.confirm("Đóng sự cố này?');
  });

  it("CAPA's RCA and effectiveness-review forms disable submit until their own required fields are filled, not just the server", () => {
    const source = read("src/components/capa-workflow-client.tsx");
    expect(source).toContain('disabled={busy||!conclusion.trim()}>Lưu/hoàn tất RCA');
    expect(source).toContain('disabled={busy||!evalMethod.trim()||!target.trim()||!actual.trim()}>Lưu đánh giá hiệu lực');
  });

  it("\"Việc của tôi\" resyncs periodically and when the tab becomes visible again, not only once on mount", () => {
    const source = read("src/components/my-work-sync-client.tsx");
    expect(source).toContain("RESYNC_INTERVAL_MS");
    expect(source).toContain('document.addEventListener("visibilitychange", onVisibilityChange);');
  });
});
