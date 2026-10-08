import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Theo dõi quy trình đào tạo: modeled off the real tracking sheet (mỗi quy
// trình mới là 1 dòng, theo dõi đào tạo lần 1/lần 2, tình trạng là 1 trong 3
// giá trị thật dùng trong sổ theo dõi — not derived from a date comparison).
describe("Procedure trainings module security and control gates", () => {
  it("separates view and manage permissions at API boundaries", () => {
    expect(read("src/app/api/procedure-trainings/route.ts")).toContain('requireApiPermission("procedure_training.view")');
    expect(read("src/app/api/procedure-trainings/route.ts")).toContain('requireApiPermission("procedure_training.manage")');
    expect(read("src/app/api/procedure-trainings/[id]/route.ts")).toContain('requireApiPermission("procedure_training.manage")');
  });

  it("is reachable from the sidebar only behind procedure_training.view", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).toContain('{ label: "ĐÀO TẠO QUY TRÌNH", href: "/procedure-trainings", icon: "book-open", permission: "procedure_training.view" }');
  });

  it("keeps every write tenant-scoped by organization_id", () => {
    expect(read("src/app/api/procedure-trainings/route.ts")).toContain("organization_id: organizationId");
    expect(read("src/app/api/procedure-trainings/[id]/route.ts")).toContain('.eq("organization_id", organizationId)');
  });

  it("is its own table — not folded into incoming_documents or any other module", () => {
    const migration = read("supabase/migrations/20261017_procedure_trainings_v1.sql");
    expect(migration).toContain("create table if not exists public.procedure_trainings");
    expect(migration).not.toContain("create table if not exists public.incoming_documents");
    expect(migration).not.toContain("public.hsba_");
  });

  it("uses the exact 3 status values from the real tracking sheet, not a derived/computed status", () => {
    const migration = read("supabase/migrations/20261017_procedure_trainings_v1.sql");
    expect(migration).toContain("check (status in ('TRAINED','PLANNED','NOT_PLANNED'))");
    const route = read("src/app/api/procedure-trainings/[id]/route.ts");
    expect(route).toContain('if (!["TRAINED", "PLANNED", "NOT_PLANNED"].includes(body.status))');
  });

  // Real finding from a full-app review: the edit form built editDraft state
  // for trainer, feedback_qlcl, session_2_* and notes (all processed fine by
  // this same PATCH route and all selected back from the DB) but never
  // rendered an <input> for any of them — a classic UI-form-state-exists-but-
  // no-field-renders bug (CLAUDE.md principle 5: UI form state -> submitted
  // body -> API handling -> SELECT must all agree). Fixed by adding the 4
  // missing columns/inputs.
  it("the edit UI actually renders inputs for trainer, session 2, feedback_qlcl and notes (not just tracked in state)", () => {
    const client = read("src/components/procedure-trainings-client.tsx");
    expect(client).toContain('placeholder="Người đào tạo..."');
    expect(client).toContain("editDraft.trainer");
    expect(client).toContain("editDraft.session_2_time");
    expect(client).toContain("editDraft.session_2_location");
    expect(client).toContain("editDraft.session_2_method");
    expect(client).toContain('placeholder="Phản hồi QLCL..."');
    expect(client).toContain("editDraft.feedback_qlcl");
    expect(client).toContain('placeholder="Ghi chú..."');
    expect(client).toContain("editDraft.notes");
  });
});

// Real finding from a full-app review: status was ONE value for the whole
// quy trình — no way to answer "bao nhiêu % nhân sự khoa/phòng đã thực sự
// được đào tạo". Added a per-employee attendee roster (own table, own
// migration) so a completion rate can be computed, without changing the
// meaning of the existing overall status field.
describe("Procedure trainings track per-employee attendance for a real completion rate", () => {
  it("attendees live in their own table, tenant-scoped and cascade-deleted with their training", () => {
    const migration = read("supabase/migrations/20261025_procedure_training_attendees_v1.sql");
    expect(migration).toContain("create table if not exists public.procedure_training_attendees");
    expect(migration).toContain("references public.procedure_trainings(id) on delete cascade");
    expect(migration).toContain("organization_id uuid not null references public.organizations(id)");
  });

  it("attendee routes separate view (list) from manage (add/update/remove), scoped to the parent training's organization", () => {
    const listRoute = read("src/app/api/procedure-trainings/[id]/attendees/route.ts");
    expect(listRoute).toContain('requireApiPermission("procedure_training.view")');
    expect(listRoute).toContain('requireApiPermission("procedure_training.manage")');
    expect(listRoute).toContain('.eq("id", trainingId).eq("organization_id", organizationId)');

    const itemRoute = read("src/app/api/procedure-trainings/[id]/attendees/[attendeeId]/route.ts");
    expect(itemRoute).toContain('requireApiPermission("procedure_training.manage")');
    expect(itemRoute).toContain('.eq("training_id", trainingId)');
    expect(itemRoute).toContain('.eq("organization_id", organizationId)');
  });

  it("the main list computes a real completion rate (attended/total) with one aggregate query, not N+1 per row — in both the API and the SSR page", () => {
    const listApi = read("src/app/api/procedure-trainings/route.ts");
    expect(listApi).toContain('.from("procedure_training_attendees").select("training_id,attended").in("training_id", trainingIds)');
    expect(listApi).toContain("attendee_total: counts.get(t.id)?.total || 0");

    const page = read("src/app/(app)/procedure-trainings/page.tsx");
    expect(page).toContain('.from("procedure_training_attendees").select("training_id,attended").in("training_id", trainingIds)');
  });

  it("the table shows the completion rate and a roster manager, with add/toggle/remove gated behind canManage (not just viewable)", () => {
    const client = read("src/components/procedure-trainings-client.tsx");
    expect(client).toContain("Quản lý nhân sự");
    expect(client).toContain("t.attendee_attended}/{t.attendee_total}");
    expect(client).toContain("canManage ? (\n            <div style={{ display: \"grid\", gridTemplateColumns: \"2fr 1fr auto\", gap: 8 }}>");
  });
});
