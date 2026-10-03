import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Đề xuất mua sắm/sửa chữa: standalone 2-level approval workflow (Tổ Đề
// xuất). No patient data, not an audit/checklist shape — doesn't reuse the
// Audit nội bộ KHTH engine or the generic records/findings pipeline.
describe("Procurement request module security and control gates", () => {
  it("separates view and manage permissions at API boundaries", () => {
    expect(read("src/app/api/procurement/requests/route.ts")).toContain('requireApiPermission("procurement.view")');
    expect(read("src/app/api/procurement/requests/route.ts")).toContain('requireApiPermission("procurement.manage")');
    expect(read("src/app/api/procurement/requests/[id]/route.ts")).toContain('requireApiPermission("procurement.manage")');
  });

  it("is reachable from the sidebar only behind procurement.view", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).toContain('{ label: "MUA SẮM & SỬA CHỮA", href: "/procurement", icon: "archive", permission: "procurement.view" }');
  });

  it("keeps every write tenant-scoped by organization_id", () => {
    expect(read("src/app/api/procurement/requests/route.ts")).toContain("organization_id: organizationId");
    expect(read("src/app/api/procurement/requests/[id]/route.ts")).toContain('.eq("organization_id", organizationId)');
  });

  it("stays off the Audit nội bộ KHTH tables and the generic records/findings tables", () => {
    const migration = read("supabase/migrations/20261014_procurement_requests_v1.sql");
    expect(migration).toContain("create table if not exists public.procurement_requests");
    expect(migration).not.toContain("public.hsba_");
    expect(migration).not.toContain("public.findings");
    expect(migration).not.toContain("public.records");
  });
});

describe("Procurement approval state machine", () => {
  const route = read("src/app/api/procurement/requests/[id]/route.ts");

  it("defines the exact 2-level chain: SUBMITTED -> (BGD) -> (TGD) -> NOTIFIED", () => {
    expect(route).toContain('BGD_APPROVE: { from: ["SUBMITTED"], to: "BGD_APPROVED" }');
    expect(route).toContain('BGD_REJECT: { from: ["SUBMITTED"], to: "BGD_REJECTED" }');
    expect(route).toContain('TGD_APPROVE: { from: ["BGD_APPROVED"], to: "TGD_APPROVED" }');
    expect(route).toContain('TGD_REJECT: { from: ["BGD_APPROVED"], to: "TGD_REJECTED" }');
    expect(route).toContain('NOTIFY: { from: ["TGD_APPROVED", "BGD_REJECTED", "TGD_REJECTED"], to: "NOTIFIED" }');
  });

  it("rejects a transition attempted from the wrong current status", () => {
    expect(route).toContain("if (!transition.from.includes(current.status))");
  });

  it("a BGĐ rejection or a TGĐ rejection both still reach NOTIFIED — rejection is reported, not silently dropped", () => {
    expect(route).toContain('"BGD_REJECTED", "TGD_REJECTED"');
  });
});
