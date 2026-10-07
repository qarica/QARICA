import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Real finding from a full-app review: qlcl_review_capa_effectiveness_v1 let
// a CAPA be concluded "EFFECTIVE" the same day it entered
// EFFECTIVENESS_REVIEW — no minimum observation window, so "hiệu quả" had no
// real evidentiary basis. Fixed by gating on effectiveness_due_date, which is
// already an optional field set at CAPA creation: a CAPA that never set one
// is unaffected (no retroactive requirement), closing exactly the loophole
// the report pointed at.
describe("CAPA effectiveness review enforces a minimum observation window when effectiveness_due_date is set", () => {
  const migration = read("supabase/migrations/20261024_capa_effectiveness_minimum_wait_v1.sql");

  it("raises before allowing a conclusion if now() is still before the declared due date", () => {
    expect(migration).toContain("if v_capa.effectiveness_due_date is not null and v_now < v_capa.effectiveness_due_date::timestamptz then");
    expect(migration).toContain("raise exception 'Chưa đến hạn đánh giá hiệu lực");
  });

  it("does not retroactively block CAPAs that never set an effectiveness_due_date", () => {
    expect(migration).toContain("v_capa.effectiveness_due_date is not null and");
  });

  it("stays security definer with a locked search_path and service_role-only execute, like every other qlcl_*_v1 transaction", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path to ''");
    expect(migration).toContain("revoke all on function public.qlcl_review_capa_effectiveness_v1");
    expect(migration).toContain("grant execute on function public.qlcl_review_capa_effectiveness_v1");
    expect(migration).toContain("to service_role;");
  });
});
