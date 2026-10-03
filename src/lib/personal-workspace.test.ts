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
  const nav = readFileSync("src/lib/navigation.ts", "utf8");

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

  it("is reachable from every logged-in user — no permission gate on the nav entry", () => {
    expect(nav).toContain('{ label: "CÁ NHÂN", href: "/me", icon: "users" },');
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
