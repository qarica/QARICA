import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for an explicit complaint: "khi bấm chọn gáy cho từng biểu mẫu
// khi chọn xong web load lại và kéo lên đầu trang" — every post-save refetch
// flipped `loading` back to true, which unmounted the whole list for a
// moment (replaced by the "Đang tải..." empty-state) and reset the page's
// scroll position to the top on every single tick/edit. Fixed by only
// showing the loading state on the INITIAL mount fetch — every refresh after
// a create/edit/delete/upload now refetches silently (`{ silent: true }`),
// leaving the already-rendered list in place while it resolves. Same root
// cause existed in 3 components; fixed in all 3.
describe("EMR client refetches — silent after the initial load, so editing never resets scroll", () => {
  const tree = readFileSync("src/components/emr-bieu-mau-tree-client.tsx", "utf8");
  const category = readFileSync("src/components/emr-category-client.tsx", "utf8");
  const timeline = readFileSync("src/components/emr-timeline-milestones-client.tsx", "utf8");

  it("emr-bieu-mau-tree-client: loadAll() takes an optional silent flag, and only the initial mount call omits it", () => {
    expect(tree).toContain("async function loadAll(opts?: { silent?: boolean }) {");
    expect(tree).toContain("if (!opts?.silent) setLoading(true);");
    expect(tree).not.toContain("await loadAll();");
    expect(tree).toContain("await loadAll({ silent: true });");
    expect(tree).toContain("useEffect(() => { loadAll(); }, []);");
  });

  it("emr-category-client: load() takes an optional silent flag, and only the initial mount call omits it", () => {
    expect(category).toContain("async function load(opts?: { silent?: boolean }) {");
    expect(category).toContain("if (!opts?.silent) setLoading(true);");
    expect(category).not.toContain("await load();");
    expect(category).toContain("await load({ silent: true });");
  });

  it("emr-timeline-milestones-client: load() takes an optional silent flag, and only the initial mount call omits it", () => {
    expect(timeline).toContain("async function load(opts?: { silent?: boolean }) {");
    expect(timeline).toContain("if (!opts?.silent) setLoading(true);");
    expect(timeline).not.toContain("await load();");
    expect(timeline).toContain("await load({ silent: true });");
  });
});
