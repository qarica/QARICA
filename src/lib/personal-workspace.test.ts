import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Explicit request: a personal space that follows the user across hospitals —
// "dùng bất cứ đâu, không phụ thuộc bệnh viện nào". Unlike personal_reminders
// (organization_id NOT NULL, RLS checks org membership), personal_workspace_items
// must never read or write organization_id — only owner_user_id — so it survives
// the user's profile.organization_id changing.
describe("Personal workspace is scoped to the user only, never to an organization", () => {
  const page = readFileSync("src/app/(app)/me/page.tsx", "utf8");
  const client = readFileSync("src/components/personal-workspace-client.tsx", "utf8");
  const quickCapture = readFileSync("src/components/global-quick-capture.tsx", "utf8");

  it("server page fetches personal_workspace_items filtered only by owner_user_id", () => {
    expect(page).toContain('.from("personal_workspace_items")');
    expect(page).toContain('.eq("owner_user_id", user.id)');
    expect(page).not.toContain("organization_id");
  });

  it("client component never reads or writes organization_id", () => {
    expect(client).toContain('.from("personal_workspace_items")');
    expect(client).not.toContain("organization_id");
    expect(client).not.toContain("organizationId");
  });

  it("insert payload carries owner_user_id and item_type but no org field", () => {
    expect(client).toContain("owner_user_id: userId");
    expect(client).toContain("item_type: tab");
  });

  // /me is intentionally no longer a sidebar nav entry (explicit request,
  // 2026-10-15: "sổ tay nên là 1 nút linh động trên màn hình", not hard-coded
  // on the master menu) — it's still reachable from every logged-in user,
  // without any permission gate, via the "Mở sổ tay cá nhân đầy đủ" link in
  // the always-rendered floating quick-capture button (see navigation-v2.test.ts
  // for the corresponding assertions on navigation.ts/app-shell.tsx/layout.tsx).
  it("is reachable from every logged-in user via the floating quick-capture button — no permission gate", () => {
    expect(quickCapture).toContain('href="/me"');
    expect(quickCapture).not.toContain("permission");
  });
});

// Follow-up: digitize the head-of-department-level recurring duties from the
// 93-page job description doc into seedable template notes, importable via a
// button (client-side insert, since the table has no row to seed by migration
// without knowing the real auth user id).
describe("Head-of-department checklist can be imported as personal notes", () => {
  const client = readFileSync("src/components/personal-workspace-client.tsx", "utf8");

  it("defines a curated template list, not the full per-staff breakdown", () => {
    expect(client).toContain("HEAD_OF_DEPARTMENT_TEMPLATES");
    expect(client).toContain("Rà soát & giải trình xuất toán BHYT với Đoàn giám định");
    expect(client).toContain("Lập kế hoạch kiểm tra, kiểm chéo HSBA năm");
  });

  it("imports templates as NOTE items owned by the user, skipping ones already present", () => {
    expect(client).toContain("async function importTemplates()");
    expect(client).toContain('item_type: "NOTE" as const');
    expect(client).toContain("owner_user_id: userId");
    expect(client).toContain("!existingTitles.has(t.title)");
  });
});

import { activeItems, deletedItems, mergeWorkspaceItems, vietnamDateToIso } from "./personal-workspace";

describe("Personal workspace recycle bin regression", () => {
  const active = { id: "a", title: "Active", item_type: "TASK" as const, deleted_at: null };
  const deleted = { id: "b", title: "Deleted", item_type: "NOTE" as const, deleted_at: "2026-10-12T00:00:00Z" };
  it("separates active and deleted records", () => {
    expect(activeItems([active, deleted]).map((row) => row.id)).toEqual(["a"]);
    expect(deletedItems([active, deleted]).map((row) => row.id)).toEqual(["b"]);
  });
  it("keeps legacy rows visible when deleted_at is missing", () => {
    expect(activeItems([{ id: "legacy", title: "Legacy", item_type: "TASK" }])).toHaveLength(1);
  });
  it("merges refreshed records without duplicating retained rows", () => {
    expect(mergeWorkspaceItems([active], [active, deleted]).map((row) => row.id)).toEqual(["a", "b"]);
  });
  it("converts Vietnamese calendar dates without browser timezone drift", () => {
    expect(vietnamDateToIso("2026-10-12")).toBe("2026-10-11T17:00:00.000Z");
    expect(vietnamDateToIso("2026-02-30")).toBeNull();
    expect(vietnamDateToIso("invalid")).toBeNull();
  });
});


describe("Personal workspace initial load safeguards", () => {
  const page = readFileSync("src/app/(app)/me/page.tsx", "utf8");
  it("does not mistake a failed query for an empty personal workspace", () => {
    expect(page).toContain("error: workspaceError");
    expect(page).toContain("{workspaceError ? (");
    expect(page).toContain('role="alert"');
  });
  it("fetches only active owner records with a bounded page size", () => {
    expect(page).toContain('.eq("owner_user_id", user.id)');
    expect(page).toContain('.is("deleted_at", null)');
    expect(page).toContain(".limit(500)");
  });
});
