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
    expect(nav).toContain('{ label: "Không gian riêng", href: "/me", icon: "book-open" },');
  });
});
