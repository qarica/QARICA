import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Safety Alert permission separation", () => {
  it("does not borrow Incident workflow permissions", () => {
    const workflow=readFileSync("src/app/api/safety-alerts/[id]/workflow/route.ts","utf8");
    const content=readFileSync("src/app/api/safety-alerts/[id]/content/route.ts","utf8");
    const hub=readFileSync("src/app/(app)/safety-alerts/page.tsx","utf8");
    const detail=readFileSync("src/app/(app)/safety-alerts/[id]/page.tsx","utf8");
    const panel=readFileSync("src/components/domain-workflow-panel.tsx","utf8");
    const client=readFileSync("src/components/safety-alert-workflow-client.tsx","utf8");
    const migration=readFileSync("supabase/migrations/20260924185500_safety_alert_permissions_v1.sql","utf8");

    for (const source of [workflow,content,hub,detail]) {
      expect(source).not.toContain('p_permission_code: "incident.investigate"');
      expect(source).not.toContain('p_permission_code: "incident.close"');
    }
    expect(workflow).toContain('p_permission_code: "safety_alert.edit"');
    expect(workflow).toContain('p_permission_code: "safety_alert.publish"');
    expect(content).toContain('p_permission_code: "safety_alert.view"');
    expect(panel).toContain('user.permissions.includes("safety_alert.edit")');
    expect(panel).toContain('user.permissions.includes("safety_alert.publish")');
    expect(client).toContain("canEdit");
    expect(client).toContain("canPublish");
    expect(migration).toContain("'safety_alert.view'");
    expect(migration).toContain("'safety_alert.edit'");
    expect(migration).toContain("'safety_alert.publish'");
  });
});
