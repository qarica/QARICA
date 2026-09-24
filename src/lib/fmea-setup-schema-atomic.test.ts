import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("FMEA setup schema and atomic workflow", () => {
  it("uses canonical schema columns and atomic setup RPCs", () => {
    const route=readFileSync("src/app/api/fmea/[id]/setup/route.ts","utf8");
    const panel=readFileSync("src/components/domain-workflow-panel.tsx","utf8");
    expect(route).toContain('const ADD_STEP_RPC = "qlcl_add_fmea_step_v1"');
    expect(route).toContain('const ADD_MODE_RPC = "qlcl_add_fmea_mode_v1"');
    expect(route).toContain("admin.rpc(ADD_STEP_RPC");
    expect(route).toContain("admin.rpc(ADD_MODE_RPC");
    expect(route).not.toContain('from("fmea_process_steps").insert');
    expect(route).not.toContain('from("fmea_failure_modes").insert');
    expect(panel).toContain('select("id,sequence_no,step_name,description,responsible_department_id")');
    expect(panel).toContain('failure_mode,effect,cause,current_control,is_high_priority');
    expect(panel).not.toContain("step_no,step_name");
    expect(panel).not.toContain("potential_effect,potential_cause");
  });

  it("does not assign a rowtype and scalar in the same INTO list", () => {
    const migration=readFileSync("supabase/migrations/20260924180000_fmea_setup_schema_atomic_v1.sql","utf8");
    expect(migration).not.toContain("into v_study,v_org");
    expect(migration).toContain("select s.* into v_study");
    expect(migration).toContain("select r.organization_id into v_org");
  });
});
