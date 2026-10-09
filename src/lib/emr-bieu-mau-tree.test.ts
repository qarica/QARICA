import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for a requested feature: a "cây master biểu mẫu" (master form
// tree) view for Biểu mẫu, grouped by Nhóm gáy (binding_group) — reusing the
// real emr_rollout_items data already entered for BIEU_MAU, not a separately
// maintained form catalog (single source of truth per CLAUDE.md).
//
// Later turned into a client component (EmrBieuMauTreeClient) so a manager
// can declare new Nhóm gáy names and reassign a form's group inline — see
// emr-bieu-mau-binding-groups.test.ts for that follow-up regression.
describe("EMR — Biểu mẫu master tree view", () => {
  const treePage = readFileSync("src/app/(app)/emr/bieu-mau/tree/page.tsx", "utf8");
  const treeClient = readFileSync("src/components/emr-bieu-mau-tree-client.tsx", "utf8");
  const categoryClient = readFileSync("src/components/emr-category-client.tsx", "utf8");

  it("enforces emr.view permission like every other EMR page", () => {
    expect(treePage).toContain('requirePermission(user, "emr.view");');
  });

  it("queries only BIEU_MAU items — the real data, not an invented separate tree dataset", () => {
    expect(treeClient).toContain('fetch("/api/emr/items?category=BIEU_MAU")');
  });

  it("groups items by details.binding_group (Nhóm gáy), with an explicit fallback bucket instead of silently dropping ungrouped forms", () => {
    expect(treeClient).toContain('const key = String(item.details?.binding_group || "").trim() || UNGROUPED;');
    // UNGROUPED is imported from the shared sort-order lib (src/lib/emr-bieu-mau-tree-order.ts),
    // not a locally re-declared string — so the tree and its Excel export can never drift apart.
    expect(treeClient).toContain('import { BIEU_MAU_TREE_UNGROUPED as UNGROUPED, sortBieuMauGroupItems, sortBieuMauGroupNames } from "@/lib/emr-bieu-mau-tree-order";');
  });

  // Originally sat up in the PageHeader actions row (next to "Xuất Excel");
  // moved down level with the "Thông tin biểu mẫu" / "Tiến độ triển khai"
  // view-switch buttons per explicit request, so all three Biểu mẫu views
  // (info, progress, tree) read as one row of alternatives instead of the
  // tree link looking like an unrelated header action.
  it("is reachable via a 'Cây biểu mẫu' button shown only on the Biểu mẫu category page, level with the Thông tin/Tiến độ triển khai view switch", () => {
    expect(categoryClient).toContain('categoryCode === "BIEU_MAU" ? <Link className="button secondary small" href="/emr/bieu-mau/tree">Cây biểu mẫu</Link> : null');
  });
});
