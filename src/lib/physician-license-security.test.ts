import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Theo dõi hành nghề bác sĩ: deadline compliance tracking (Tổ Hành chính) —
// no checklist, no approval chain, its own lean table.
describe("Physician license tracking module security and control gates", () => {
  it("separates view and manage permissions at API boundaries", () => {
    expect(read("src/app/api/physician-license/registrations/route.ts")).toContain('requireApiPermission("physician_license.view")');
    expect(read("src/app/api/physician-license/registrations/route.ts")).toContain('requireApiPermission("physician_license.manage")');
    expect(read("src/app/api/physician-license/registrations/[id]/route.ts")).toContain('requireApiPermission("physician_license.manage")');
  });

  it("is reachable from the sidebar only behind physician_license.view", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).toContain('{ label: "Theo dõi hành nghề bác sĩ", href: "/physician-license", icon: "badge-check", permission: "physician_license.view" }');
  });

  it("keeps every write tenant-scoped by organization_id", () => {
    expect(read("src/app/api/physician-license/registrations/route.ts")).toContain("organization_id: organizationId");
    expect(read("src/app/api/physician-license/registrations/[id]/route.ts")).toContain('.eq("organization_id", organizationId)');
  });

  it("stays off every other module's tables", () => {
    const migration = read("supabase/migrations/20261015_physician_license_registrations_v1.sql");
    expect(migration).toContain("create table if not exists public.physician_license_registrations");
    expect(migration).not.toContain("public.hsba_");
    expect(migration).not.toContain("public.procurement_requests");
  });
});

describe("Physician license deadline rules", () => {
  const route = read("src/app/api/physician-license/registrations/route.ts");

  it("gives GĐTT/Trưởng khoa 14 days and bác sĩ 60 days from the effective date for new hires", () => {
    expect(route).toContain('const days = roleType === "GDTT_TK" ? 14 : 60;');
  });

  it("requires internal-transfer registrations to complete 10 days BEFORE the effective date, regardless of role", () => {
    expect(route).toContain('if (caseType === "INTERNAL_TRANSFER") return new Date(base.getTime() - 10 * DAY_MS)');
  });

  it("rejects marking an already-registered record as registered again", () => {
    const idRoute = read("src/app/api/physician-license/registrations/[id]/route.ts");
    expect(idRoute).toContain('if (current.status === "REGISTERED") return NextResponse.json({ error: "Bản ghi này đã đăng ký xong." }, { status: 400 });');
  });
});
