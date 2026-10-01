import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for a requested feature: a "cây master biểu mẫu" (master form
// tree) view for Biểu mẫu, grouped by Nhóm gáy (binding_group) — reusing the
// real emr_rollout_items data already entered for BIEU_MAU, not a separately
// maintained form catalog (single source of truth per CLAUDE.md).
describe("EMR — Biểu mẫu master tree view", () => {
  const treePage = readFileSync("src/app/(app)/emr/bieu-mau/tree/page.tsx", "utf8");
  const categoryPage = readFileSync("src/app/(app)/emr/[category]/page.tsx", "utf8");

  it("enforces emr.view permission like every other EMR page", () => {
    expect(treePage).toContain('requirePermission(user, "emr.view");');
  });

  it("queries only BIEU_MAU items — the real data, not an invented separate tree dataset", () => {
    expect(treePage).toContain('.eq("category", "BIEU_MAU")');
  });

  it("groups items by details.binding_group (Nhóm gáy), with an explicit fallback bucket instead of silently dropping ungrouped forms", () => {
    expect(treePage).toContain('const key = String(item.details?.binding_group || "").trim() || UNGROUPED;');
    expect(treePage).toContain('const UNGROUPED = "Chưa phân nhóm";');
  });

  it("is reachable via a 'Xem cây biểu mẫu' button shown only on the Biểu mẫu category page, not every category", () => {
    expect(categoryPage).toContain('category.code === "BIEU_MAU" ? <Link className="button secondary" href="/emr/bieu-mau/tree">Xem cây biểu mẫu</Link> : null');
  });

  it("shares the same EMR workspace nav strip (no separate/duplicate navigation mechanism)", () => {
    expect(treePage).toContain("<EmrWorkspaceNav");
  });
});
