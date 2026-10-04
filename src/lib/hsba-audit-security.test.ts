import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// HSBA quality-check module: deliberately standalone, not routed through the
// generic findings/CAPA pipeline — explicit product decision (not the usual
// "reuse existing engine" default), because checklist + error-handling volume
// (per-hồ-sơ, daily) doesn't fit the periodic assessment-round shape. Same
// view/manage permission boundary discipline as EMR (CLAUDE.md principle 4).
describe("HSBA audit module security and control gates", () => {
  it("separates view and manage permissions at API boundaries", () => {
    expect(read("src/app/api/hsba-audit/checklist-items/route.ts")).toContain('requireApiPermission("hsba_audit.view")');
    expect(read("src/app/api/hsba-audit/checklist-items/route.ts")).toContain('requireApiPermission("hsba_audit.manage")');
    expect(read("src/app/api/hsba-audit/checklist-items/[id]/route.ts")).toContain('requireApiPermission("hsba_audit.manage")');
    expect(read("src/app/api/hsba-audit/audits/route.ts")).toContain('requireApiPermission("hsba_audit.view")');
    expect(read("src/app/api/hsba-audit/audits/route.ts")).toContain('requireApiPermission("hsba_audit.manage")');
    expect(read("src/app/api/hsba-audit/findings/route.ts")).toContain('requireApiPermission("hsba_audit.view")');
    expect(read("src/app/api/hsba-audit/audits/export/route.ts")).toContain('requireApiPermission("hsba_audit.view")');
  });

  it("exports audit results as UTF-8 BOM CSV (same convention as incidents/export, plans export) scoped to audit_type + optional period, with per-audit pass/fail item counts", () => {
    const route = read("src/app/api/hsba-audit/audits/export/route.ts");
    expect(route).toContain('"Content-Type": "text/csv; charset=utf-8"');
    expect(route).toContain("const bom = ");
    expect(route).toContain(".eq(\"audit_type\", auditType)");
    expect(route).toContain("passCountByAudit");
    expect(route).toContain("failCountByAudit");
    const reportPage = read("src/app/(app)/hsba-audit/report/page.tsx");
    expect(reportPage).toContain("/api/hsba-audit/audits/export?audit_type=${auditType}&period=${period}");
  });

  // Fixed real bug found by a full-app review: the "Khoa phản hồi" (ACK/
  // DISPUTE) button is shown to every viewer (department staff only ever
  // hold hsba_audit.view, never .manage — see role_permissions mapping in
  // 20261012_hsba_audit_module_v1.sql), but the route used to gate itself
  // entirely behind hsba_audit.manage — department staff clicking their own
  // "Đồng thuận"/"Giải trình" button got a silent 403. Base gate is now
  // .view; SEND/DECIDE/RESOLVE still require .manage, ACK/DISPUTE additionally
  // accept the caller's own department matching the finding's department.
  it("PATCH findings/[id] lets department staff (hsba_audit.view only) respond to their own department's finding, while SEND/DECIDE/RESOLVE stay manage-only", () => {
    const route = read("src/app/api/hsba-audit/findings/[id]/route.ts");
    expect(route).toContain('requireApiPermission("hsba_audit.view")');
    expect(route).not.toContain('requireApiPermission("hsba_audit.manage")');
    expect(route).toContain('const DEPARTMENT_SELF_RESPONSE_ACTIONS = new Set(["ACK", "DISPUTE"]);');
    expect(route).toContain('has_permission", { p_permission_code: "hsba_audit.manage" }');
    expect(route).toContain("profile.primary_department_id !== current.department_id");
  });

  // Real bug found by the user: a view-only account (hsba_audit.view without
  // hsba_audit.manage, the common case for a department/ward-level reviewer)
  // was told by the Overview tab to "go to Bảng kiểm to declare", then found
  // the declare form silently hidden there with no explanation — a dead end.
  // Both messages must now state the actual missing permission instead of
  // sending a view-only user on a wild goose chase.
  it("explains the missing hsba_audit.manage permission instead of silently hiding the declare form or sending the user on a dead-end hint", () => {
    const checklistClient = read("src/components/hsba-checklist-client.tsx");
    expect(checklistClient).toContain("Tài khoản của bạn chưa có quyền");
    expect(checklistClient).toContain("Quản lý kiểm tra chất lượng HSBA");
    const overviewClient = read("src/components/hsba-audit-overview-client.tsx");
    expect(overviewClient).toContain("? canManage\n");
    expect(overviewClient).toContain('Việc khai báo cần quyền "Quản lý kiểm tra chất lượng HSBA"');
  });

  it("is reachable from the sidebar only behind hsba_audit.view, as its own top-level menu (not nested under Quản lý chất lượng — explicit request)", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).toContain('{ label: "AUDIT HSBA", href: "/hsba-audit", icon: "list-checks", permission: "hsba_audit.view" }');
  });

  it("keeps every write tenant-scoped by organization_id", () => {
    expect(read("src/app/api/hsba-audit/checklist-items/route.ts")).toContain('organization_id: organizationId');
    expect(read("src/app/api/hsba-audit/audits/route.ts")).toContain('organization_id: organizationId');
    expect(read("src/app/api/hsba-audit/checklist-items/[id]/route.ts")).toContain('.eq("organization_id", organizationId)');
    expect(read("src/app/api/hsba-audit/findings/[id]/route.ts")).toContain('.eq("organization_id", organizationId)');
  });

  it("never stores clinical content — only the HSBA's mã/số hồ sơ as text", () => {
    const migration = read("supabase/migrations/20261012_hsba_audit_module_v1.sql");
    expect(migration).toContain("record_reference text not null");
    expect(migration).toContain("never clinical content");
  });

  it("stays off the generic findings/CAPA tables — its own tables, its own workflow", () => {
    const migration = read("supabase/migrations/20261012_hsba_audit_module_v1.sql");
    expect(migration).toContain("create table if not exists public.hsba_audit_findings");
    expect(migration).not.toContain("public.findings");
    expect(migration).not.toContain("public.capas");
  });
});

describe("HSBA finding workflow transitions", () => {
  const route = read("src/app/api/hsba-audit/findings/[id]/route.ts");

  it("defines the exact state machine: OPEN -> SENT_TO_DEPT -> (ACK | DISPUTE) -> ... -> RESOLVED", () => {
    expect(route).toContain('SEND: { from: ["OPEN"], to: "SENT_TO_DEPT" }');
    expect(route).toContain('ACK: { from: ["SENT_TO_DEPT"], to: "DEPT_ACKNOWLEDGED" }');
    expect(route).toContain('DISPUTE: { from: ["SENT_TO_DEPT"], to: "DEPT_DISPUTED" }');
    expect(route).toContain('DECIDE: { from: ["DEPT_DISPUTED"], to: "HEAD_APPROVED" }');
    expect(route).toContain('RESOLVE: { from: ["DEPT_ACKNOWLEDGED", "HEAD_APPROVED"], to: "RESOLVED" }');
  });

  it("rejects a transition attempted from the wrong current status", () => {
    expect(route).toContain("if (!transition.from.includes(current.status))");
  });

  it("requires a department_response note before ACK or DISPUTE", () => {
    expect(route).toContain('if (action === "ACK" || action === "DISPUTE")');
    expect(route).toContain("Khoa cần nhập nội dung phản hồi.");
  });

  it("requires an explicit head_decision (UPHELD or WAIVED) before DECIDE", () => {
    expect(route).toContain('body.head_decision === "WAIVED"');
    expect(route).toContain('body.head_decision === "UPHELD"');
  });
});

describe("HSBA audit creation auto-generates findings only for FAIL results", () => {
  const route = read("src/app/api/hsba-audit/audits/route.ts");

  it("computes overall_result FAIL if any checklist item failed", () => {
    expect(route).toContain('normalizedResults.some((r) => r.result === "FAIL") ? "FAIL" : "PASS"');
  });

  // Explicit business rule: Phác đồ điều trị và QTKT nội trú là kiểm bổ sung
  // không bắt buộc — Không đạt chỉ ghi nhận vào báo cáo (hsba_audit_item_results),
  // KHÔNG tạo "lỗi" gửi khoa như HSBA. Chỉ audit_type HSBA mới có vòng đời
  // finding/SEND-to-department.
  it("only creates findings (sent to department) for audit_type HSBA — Phác đồ/QTKT fails are recorded but never become a sendable finding", () => {
    expect(route).toContain('if (auditType === "HSBA" && failedResults.length)');
    expect(route).toContain("findings_created: auditType === \"HSBA\" ? failedResults.length : 0");
  });

  it("creates one finding per FAIL item result, not per PASS", () => {
    expect(route).toContain('const failedResults = (itemResults ?? []).filter((r: any) => r.result === "FAIL");');
    expect(route).toContain("hsba_audit_findings");
  });
});

// Generalized into a shared "Audit nội bộ KHTH" engine (explicit request:
// "Giám sát phác đồ điều trị & QTKT nội trú" reuses the exact same
// checklist/audit/finding shape as HSBA, via an audit_type discriminator,
// instead of a second set of near-duplicate tables).
describe("Audit nội bộ KHTH is generalized across audit_type, not duplicated per kind", () => {
  it("adds audit_type to the existing tables instead of creating parallel ones", () => {
    const migration = read("supabase/migrations/20261013_hsba_audit_type_generalization_v1.sql");
    expect(migration).toContain("alter table public.hsba_checklist_items add column if not exists audit_type");
    expect(migration).toContain("alter table public.hsba_audits add column if not exists audit_type");
    expect(migration).toContain("alter table public.hsba_audit_findings add column if not exists audit_type");
    expect(migration).toContain("check (audit_type in ('HSBA','PHAC_DO_DIEU_TRI'))");
  });

  it("defines the shared type list once and reuses it everywhere (checklist-items, audits, findings routes)", () => {
    const types = read("src/lib/internal-audit-types.ts");
    expect(types).toContain('export const INTERNAL_AUDIT_TYPES = ["HSBA", "PHAC_DO_DIEU_TRI", "QTKT_NOI_TRU"] as const;');
    for (const route of ["src/app/api/hsba-audit/audits/route.ts", "src/app/api/hsba-audit/findings/route.ts"]) {
      expect(read(route)).toContain('from "@/lib/internal-audit-types"');
      expect(read(route)).toContain('.eq("audit_type", auditType)');
    }
    // checklist-items/route.ts no longer filters by audit_type directly — it
    // is scoped by checklist_version_id, whose template already pins audit_type
    // (see the multi-template describe block below).
    expect(read("src/app/api/hsba-audit/checklist-items/route.ts")).toContain("checklist_version_id");
  });

  // Replaced by the multi-template architecture below: a new audit now pins
  // to an exact checklist_version_id (validated to belong to the caller's org
  // AND match audit_type AND be PUBLISHED) instead of inferring item scope
  // from organization_id+audit_type alone — see the describe block below.
  it("scopes a new audit's checklist-item lookup to its checklist_version_id, itself validated against org + audit_type + PUBLISHED status", () => {
    const route = read("src/app/api/hsba-audit/audits/route.ts");
    expect(route).toContain('.eq("checklist_version_id", checklistVersionId)\n    .in("id", itemIds);');
    expect(route).toContain("versionTemplate.organization_id !== organizationId || versionTemplate.audit_type !== auditType");
    expect(route).toContain('if (version.status !== "PUBLISHED")');
  });

  it("the workspace nav lets the user switch audit_type and preserves it across the 3 sub-pages", () => {
    const nav = read("src/components/hsba-audit-workspace-nav.tsx");
    expect(nav).toContain("INTERNAL_AUDIT_TYPES.map((type) =>");
    expect(nav).toContain('params.set("type", type);');
    expect(nav).toContain("href = `${d.slug ? `/hsba-audit/${d.slug}` : \"/hsba-audit\"}?type=${auditType}`;");
  });

  // Real bug reported from screenshots: the "Tổng quan / Bảng kiểm / Báo
  // cáo tháng" sub-nav rendered as plain unstyled text in production — no
  // visible button/pill boundary at all — so users never realized it was
  // clickable and never found the "Bảng kiểm" tab where checklist items
  // get declared. Root cause: this nav reused the exact same class names
  // (.emr-workspace-nav, .emr-tab) as the unrelated EMR module's own nav
  // component (emr-workspace-nav.tsx), each scoping its own <style jsx> —
  // in production the <Link>-based row lost its styling. Fixed by dropping
  // scoped CSS for this nav entirely in favor of inline styles.
  it("styles its tabs with inline styles, not scoped <style jsx> that collides with emr-workspace-nav.tsx's identically-named classes", () => {
    const nav = read("src/components/hsba-audit-workspace-nav.tsx");
    expect(nav).not.toContain("<style jsx>{`");
    expect(nav).toContain("function tabStyle(active: boolean): CSSProperties {");
    expect(nav).toContain("style={tabStyle(auditType === type)}");
    expect(nav).toContain("style={tabStyle(active)}");
  });
});

// Explicit request: "Audit KHTH ko có nút khai báo bảng kiểm chất lượng hsba,
// bảng kiểm phác đồ, bảng kiểm qtkt" — the combined "Phác đồ & QTKT nội trú"
// audit_type didn't give QTKT its own checklist/declare button. Split it into
// its own third audit_type (QTKT_NOI_TRU) alongside HSBA and the now
// phác-đồ-only PHAC_DO_DIEU_TRI, reusing the same shared engine — no new
// tables, just a third discriminator value, so the workspace nav's generic
// `INTERNAL_AUDIT_TYPES.map(...)` picks it up automatically.
describe("Audit nội bộ KHTH splits QTKT nội trú into its own third audit_type", () => {
  it("widens the CHECK constraint on all 3 shared tables to accept QTKT_NOI_TRU", () => {
    const migration = read("supabase/migrations/20261019_hsba_audit_type_split_qtkt_v1.sql");
    for (const table of ["hsba_checklist_items", "hsba_audits", "hsba_audit_findings"]) {
      expect(migration).toContain(`alter table public.${table} drop constraint if exists ${table}_audit_type_check;`);
      expect(migration).toContain(`check (audit_type in ('HSBA','PHAC_DO_DIEU_TRI','QTKT_NOI_TRU'));`);
    }
  });

  it("labels each of the 3 types distinctly, no longer combining phác đồ and QTKT under one label", () => {
    const types = read("src/lib/internal-audit-types.ts");
    expect(types).toContain('HSBA: "Hồ sơ bệnh án",');
    expect(types).toContain('PHAC_DO_DIEU_TRI: "Phác đồ điều trị",');
    expect(types).toContain('QTKT_NOI_TRU: "QTKT nội trú",');
    expect(types).not.toContain("Phác đồ & QTKT nội trú");
  });
});

// Explicit request: "Audit hsba có nhiều loại bảng kiểm khác nhau chứ ko phải
// 1 loại như đang thiết kế" — reuses the Giám sát module's own architecture
// (Template -> Version DRAFT/PUBLISHED/RETIRED -> Items), simplified (no
// sections/answer_type/scoring, still flat PASS/FAIL) since HSBA's checklist
// is intentionally simpler. Applies to all 3 audit_types; the user picks a
// PUBLISHED template from a dropdown when starting a new audit round.
describe("HSBA audit supports multiple named checklist templates per audit_type (Template -> Version -> Items)", () => {
  it("creates templates/versions tables pinned to a published version per audit, so later template edits never change historical audits", () => {
    const migration = read("supabase/migrations/20261022_hsba_checklist_templates_v1.sql");
    expect(migration).toContain("create table if not exists public.hsba_checklist_templates");
    expect(migration).toContain("check (audit_type in ('HSBA','PHAC_DO_DIEU_TRI','QTKT_NOI_TRU'))");
    expect(migration).toContain("create table if not exists public.hsba_checklist_versions");
    expect(migration).toContain("check (status in ('DRAFT','PUBLISHED','RETIRED'))");
    expect(migration).toContain("unique(checklist_template_id, version_no)");
    expect(migration).toContain("alter table public.hsba_checklist_items\n  add column if not exists checklist_version_id");
    expect(migration).toContain("alter table public.hsba_audits\n  add column if not exists checklist_version_id");
  });

  it("defines 3 atomic security-definer RPCs for create/clone/publish, each revoked from authenticated and granted only to service_role", () => {
    const migration = read("supabase/migrations/20261022_hsba_checklist_templates_v1.sql");
    for (const fn of [
      "qlcl_create_hsba_checklist_template_v1",
      "qlcl_clone_hsba_checklist_version_v1",
      "qlcl_publish_hsba_checklist_version_v1",
    ]) {
      expect(migration).toContain(`create or replace function public.${fn}(`);
      expect(migration).toContain(`revoke all on function public.${fn}`);
      expect(migration).toContain(`grant execute on function public.${fn}`);
    }
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path to ''");
  });

  it("publish requires at least 1 active item and auto-retires the template's previously PUBLISHED version — only one live version at a time", () => {
    const migration = read("supabase/migrations/20261022_hsba_checklist_templates_v1.sql");
    expect(migration).toContain("if v_item_count < 1 then");
    expect(migration).toContain("raise exception 'Phiên bản cần ít nhất 1 tiêu chí đang dùng trước khi phát hành';");
    expect(migration).toContain("set status = 'RETIRED'\n  where checklist_template_id = p_template_id\n    and status = 'PUBLISHED'");
  });

  it("gates template list/create behind hsba_audit.view/manage, and version-clone/publish behind hsba_audit.manage", () => {
    const list = read("src/app/api/hsba-audit/checklist-templates/route.ts");
    expect(list).toContain('requireApiPermission("hsba_audit.view")');
    expect(list).toContain('requireApiPermission("hsba_audit.manage")');
    expect(read("src/app/api/hsba-audit/checklist-templates/[id]/route.ts")).toContain('requireApiPermission("hsba_audit.manage")');
    expect(read("src/app/api/hsba-audit/checklist-templates/[id]/versions/route.ts")).toContain('requireApiPermission("hsba_audit.manage")');
    expect(read("src/app/api/hsba-audit/checklist-templates/[id]/publish/route.ts")).toContain('requireApiPermission("hsba_audit.manage")');
  });

  it("only allows adding/editing/deleting checklist items while their version is still DRAFT", () => {
    const createRoute = read("src/app/api/hsba-audit/checklist-items/route.ts");
    expect(createRoute).toContain('if (version.status !== "DRAFT")');
    const itemRoute = read("src/app/api/hsba-audit/checklist-items/[id]/route.ts");
    expect(itemRoute).toContain('itemVersion.versionStatus !== "DRAFT"');
    expect(itemRoute).toContain("Chỉ được sửa tiêu chí khi phiên bản đang ở trạng thái Nháp.");
    expect(itemRoute).toContain("Chỉ được xoá tiêu chí khi phiên bản đang ở trạng thái Nháp.");
  });

  it("requires a template dropdown in the new-audit form, scoped to PUBLISHED versions of the current audit_type", () => {
    const page = read("src/app/(app)/hsba-audit/page.tsx");
    expect(page).toContain('find((v: any) => v.status === "PUBLISHED")');
    const client = read("src/components/hsba-audit-overview-client.tsx");
    expect(client).toContain("templates: ChecklistTemplateOption[]");
    expect(client).toContain("checklist_version_id: selectedTemplate.versionId");
  });

  it("the Bảng kiểm tab lists templates with their DRAFT/PUBLISHED version status and offers clone + publish actions", () => {
    const client = read("src/components/hsba-checklist-client.tsx");
    expect(client).toContain("/api/hsba-audit/checklist-templates?audit_type=");
    expect(client).toContain("/versions`, { method: \"POST\" }");
    expect(client).toContain("/publish`, {");
    expect(client).toContain("CHECKLIST_VERSION_STATUS_LABEL");
  });
});
