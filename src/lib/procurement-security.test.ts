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

// Real finding from a full-app review: both approval tiers were gated by the
// SAME single procurement.manage permission — anyone who could do one step
// could do the other, which defeats the entire point of a 2-level BGĐ -> TGĐ
// chain. Split into procurement.approve_bgd / procurement.approve_tgd
// (migration: 20261024_procurement_bgd_tgd_split_v1.sql, backfilled onto
// every role that had procurement.manage so nobody loses access the moment
// it ships — splitting who actually holds which one is an Admin task after).
describe("Procurement 2-tier approval requires separate BGĐ/TGĐ permissions", () => {
  const route = read("src/app/api/procurement/requests/[id]/route.ts");

  it("BGĐ actions require procurement.approve_bgd, TGĐ actions require procurement.approve_tgd — not the same shared permission", () => {
    expect(route).toContain('has_permission", { p_permission_code: "procurement.approve_bgd" }');
    expect(route).toContain('has_permission", { p_permission_code: "procurement.approve_tgd" }');
  });

  it("the new permissions are backfilled onto every role that already had procurement.manage, so the split doesn't lock anyone out on deploy", () => {
    const migration = read("supabase/migrations/20261024_procurement_bgd_tgd_split_v1.sql");
    expect(migration).toContain("('procurement.approve_bgd'");
    expect(migration).toContain("('procurement.approve_tgd'");
    expect(migration).toContain("p_old.code='procurement.manage'");
  });

  it("the same person cannot approve their own BGĐ decision again at the TGĐ step, even if they hold both permissions", () => {
    expect(route).toContain("if (isTgdAction && current.bgd_decided_by && current.bgd_decided_by === auth.user.id)");
  });

  it("the client only shows each tier's approve/reject buttons to the account that actually holds that tier's permission", () => {
    const client = read("src/components/procurement-requests-client.tsx");
    expect(client).toContain("canApproveBgd");
    expect(client).toContain("canApproveTgd");
    expect(client).toContain('r.status === "SUBMITTED" && canApproveBgd');
    expect(client).toContain('r.status === "BGD_APPROVED" && canApproveTgd');

    const page = read("src/app/(app)/procurement/page.tsx");
    expect(page).toContain('hasPermission(user, "procurement.approve_bgd")');
    expect(page).toContain('hasPermission(user, "procurement.approve_tgd")');
  });
});

// Real finding: BGĐ/TGĐ had to approve a proposal with no quantity, unit
// price or estimated cost at all — nothing to gauge the spend against.
describe("Procurement request carries quantity/unit price/estimated cost", () => {
  it("the migration adds the 3 cost columns", () => {
    const migration = read("supabase/migrations/20261024_procurement_cost_fields_v1.sql");
    expect(migration).toContain("add column if not exists quantity integer");
    expect(migration).toContain("add column if not exists unit_price numeric(14,2)");
    expect(migration).toContain("add column if not exists estimated_cost numeric(14,2)");
  });

  it("POST computes estimated_cost from quantity * unit_price server-side rather than trusting a client-sent total", () => {
    const route = read("src/app/api/procurement/requests/route.ts");
    expect(route).toContain("const estimatedCost = quantity !== null && unitPrice !== null ? quantity * unitPrice : null;");
    expect(route).toContain("quantity,\n      unit_price: unitPrice,\n      estimated_cost: estimatedCost,");
  });

  it("the create form and the list both expose quantity/unit price/estimated cost, not just the API", () => {
    const client = read("src/components/procurement-requests-client.tsx");
    expect(client).toContain('placeholder="Số lượng (tùy chọn)"');
    expect(client).toContain('placeholder="Đơn giá — VNĐ (tùy chọn)"');
    expect(client).toContain("r.estimated_cost");
  });
});
