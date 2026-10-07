import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Real finding from a full-app review: "Tiền tố mã hồ sơ" (record code
// prefix) still rendered, saved and round-tripped through Cài đặt hệ thống,
// but next_record_code() (migration 20260918_record_code_no_org_prefix_v1.sql
// — an intentional, already-shipped design decision) stopped using any org
// prefix when generating codes ("TYPE-YEAR-0001", no prefix at all). Changing
// this field did nothing — a classic UI-field-with-no-backend-effect bug.
// Removed from UI/API (not resurrected into code generation, since dropping
// the org prefix from codes was a deliberate earlier decision this session
// has no reason to reverse).
describe("removed dead 'Tiền tố mã hồ sơ' field (no longer affects record codes)", () => {
  it("next_record_code still generates codes with no organization prefix", () => {
    const migration = read("supabase/migrations/20260918_record_code_no_org_prefix_v1.sql");
    expect(migration).toContain("v_type || '-' || p_work_year::text || '-' || lpad(v_seq::text, 4, '0')");
  });

  it("admin-settings-client.tsx no longer has a prefix field", () => {
    const source = read("src/components/admin-settings-client.tsx");
    expect(source).not.toContain("record_code_prefix");
    expect(source).not.toContain("prefix:");
    expect(source).not.toContain("Tiền tố mã hồ sơ");
  });

  it("admin/settings API route and page no longer read/write record_code_prefix", () => {
    expect(read("src/app/api/admin/settings/route.ts")).not.toContain("record_code_prefix");
    expect(read("src/app/(app)/admin/settings/page.tsx")).not.toContain("record_code_prefix");
  });
});
