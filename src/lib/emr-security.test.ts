import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p:string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("EMR security and control gates", () => {
  it("separates view and manage permissions at API boundaries", () => {
    expect(read("src/app/api/emr/dashboard/route.ts")).toContain('requireApiPermission("emr.view")');
    const items = read("src/app/api/emr/items/route.ts");
    expect(items).toContain('requireApiPermission("emr.view")');
    expect(items).toContain('requireApiPermission("emr.manage")');
    expect(read("src/app/api/emr/items/[id]/route.ts")).toContain('requireApiPermission("emr.manage")');
  });

  // CLAUDE.md nguyên tắc 4 yêu cầu cập nhật test này mỗi khi thêm route EMR
  // mới — test gốc ở trên chỉ phủ dashboard/items/items[id], bỏ sót 7 route
  // đã thêm sau đó (binding-groups, items/[id]/file, items/export, options,
  // timeline-milestones). Rà lại: cả 7 route đều ĐÃ đúng ranh giới (đọc dùng
  // emr.view, mọi thao tác ghi dùng emr.manage) — bổ sung assertion để một
  // thay đổi sai ranh giới ở các route này không còn lọt qua được test.
  it("separates view and manage permissions for every other EMR route (binding-groups, item file upload, export, options, timeline-milestones)", () => {
    const bindingGroups = read("src/app/api/emr/binding-groups/route.ts");
    expect(bindingGroups).toContain('export async function GET() {\n  const auth = await requireApiPermission("emr.view");');
    expect(bindingGroups).toContain('export async function POST(request: Request) {\n  const auth = await requireApiPermission("emr.manage");');

    const bindingGroupById = read("src/app/api/emr/binding-groups/[id]/route.ts");
    expect(bindingGroupById).toContain('export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {\n  const auth = await requireApiPermission("emr.manage");');
    expect(bindingGroupById).toContain('export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {\n  const auth = await requireApiPermission("emr.manage");');

    const itemFile = read("src/app/api/emr/items/[id]/file/route.ts");
    expect(itemFile).toContain('export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {\n  const auth = await requireApiPermission("emr.manage");');
    expect(itemFile).toContain('export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {\n  const auth = await requireApiPermission("emr.view");');
    expect(itemFile).toContain('export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {\n  const auth = await requireApiPermission("emr.manage");');

    expect(read("src/app/api/emr/items/export/route.ts")).toContain('requireApiPermission("emr.view")');
    expect(read("src/app/api/emr/options/route.ts")).toContain('requireApiPermission("emr.view")');

    const timelineMilestones = read("src/app/api/emr/timeline-milestones/route.ts");
    expect(timelineMilestones).toContain('export async function GET() {\n  const auth = await requireApiPermission("emr.view");');
    expect(timelineMilestones).toContain('export async function POST(request: Request) {\n  const auth = await requireApiPermission("emr.manage");');

    const timelineMilestoneById = read("src/app/api/emr/timeline-milestones/[id]/route.ts");
    expect(timelineMilestoneById).toContain('export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {\n  const auth = await requireApiPermission("emr.manage");');
    expect(timelineMilestoneById).toContain('export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {\n  const auth = await requireApiPermission("emr.manage");');
  });
  it("hides EMR navigation from users without emr.view (nav group label renamed from the raw EMR acronym to Bệnh án điện tử — explicit request; every one of the 11 expanded EMR sidebar rows still requires emr.view)", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).toContain('label: "BỆNH ÁN ĐIỆN TỬ"');
    expect(nav).toContain('{ label: "Tổng quan EMR", href: "/emr", icon: "layout-dashboard", permission: "emr.view" }');
    expect(nav.match(/permission: "emr\.view"/g)?.length).toBe(3);
  });
  it("uses Vietnam-local calendar dates for deadline control", () => {
    const dashboard = read("src/app/api/emr/dashboard/route.ts");
    expect(dashboard).toContain('timeZone: "Asia/Ho_Chi_Minh"');
    expect(dashboard).toContain('x.due_date < today');
  });
  it("keeps dashboard and mutations tenant-scoped", () => {
    expect(read("src/app/api/emr/dashboard/route.ts")).toContain('.eq("organization_id", organizationId)');
    expect(read("src/app/api/emr/items/[id]/route.ts")).toContain('existing.organization_id !== organizationId');
  });
  it("requires DONE plus evidence before verification", () => {
    const route = read("src/app/api/emr/items/[id]/route.ts");
    expect(route).toContain('effectiveStatus !== "DONE" || !effectiveEvidence');
    expect(route).toContain('patch.verified_at = null');
  });

  // Real finding from a full-app security review: emr.manage was shared by
  // whoever moves an item to DONE and whoever verifies it, with no check
  // that they differ — one person could flag their own work DONE and
  // immediately self-verify the go-live gate. Block both the same-request
  // combo (status->DONE + verify_completed in one call) and the two-call
  // case (verifier is the same person who last touched the item).
  it("blocks self-verification of the go-live gate (verifier must differ from whoever last updated the item)", () => {
    const route = read("src/app/api/emr/items/[id]/route.ts");
    expect(route).toContain('select("id,organization_id,status,evidence_url,category,updated_by,title,description,details,due_date,priority,publish_status,department_ids")');
    expect(route).toContain('const selfTransitionToDone = typeof body.status === "string" && body.status === "DONE" && existing.status !== "DONE";');
    expect(route).toContain("selfTransitionToDone || existing.updated_by === auth.user.id");
    expect(route).toContain("Người xác minh phải khác người vừa cập nhật hạng mục này");
  });

  // Phát hiện Cao (review "hoàn thiện EMR"): điều kiện cũ chỉ kiểm tra "body
  // có gửi status=DONE", không kiểm tra "có THỰC SỰ đang chuyển sang DONE" —
  // vì emr-category-client.tsx's save() luôn PATCH nguyên form.status mỗi
  // lần sửa (kể cả không đổi), mọi lượt xác minh trên hạng mục ĐÃ DONE từ
  // trước (trường hợp bình thường nhất) đều bị chặn, dù người xác minh là ai.
  // Tính năng xác minh go-live gate coi như không dùng được qua UI.
  it("không còn chặn nhầm người KHÁC xác minh 1 hạng mục đã DONE sẵn (chỉ chặn đúng trường hợp chuyển DONE + xác minh trong cùng 1 request)", () => {
    const route = read("src/app/api/emr/items/[id]/route.ts");
    expect(route).toContain('existing.status !== "DONE"');
    const client = read("src/components/emr-category-client.tsx");
    // Xác nhận tiền đề của lỗi: UI luôn gửi nguyên form (gồm status) mỗi lần PATCH.
    expect(client).toContain("body: JSON.stringify(isEdit ? form : { ...form, category: categoryCode }),");
  });

  // Phát hiện Trung bình: đổi evidence_url sang 1 giá trị MỚI (không rỗng) mà
  // không kèm verify_completed:false thì verified_at/verified_by cũ vẫn giữ
  // nguyên — gate "đã xác minh" dựa trên minh chứng đã đổi, không phải minh
  // chứng hiện tại. Null hoá bất cứ khi nào evidence_url thực sự đổi giá trị
  // so với bản ghi hiện có, không chỉ khi đổi thành rỗng.
  it("đổi evidence_url sang giá trị khác (không chỉ xoá rỗng) đều làm mất hiệu lực xác minh cũ", () => {
    const route = read("src/app/api/emr/items/[id]/route.ts");
    expect(route).toContain("if (patch.evidence_url !== existing.evidence_url) { patch.verified_at = null; patch.verified_by = null; }");
  });

  // Phát hiện Trung bình: DELETE, upload/xoá file đính kèm, và chính hành
  // động xác minh (khi không đi kèm đổi status trong cùng request — trường
  // hợp bình thường nhất) trước đây không ghi audit_logs.
  it("ghi audit_logs cho xoá hạng mục, upload/xoá file đính kèm, và hành động xác minh dù không đổi status trong cùng request", () => {
    const route = read("src/app/api/emr/items/[id]/route.ts");
    expect(route).toContain("let justVerified = false;");
    expect(route).toContain("justVerified = true;");
    expect(route).toContain('action_type: "EMR_ITEM_VERIFY"');
    expect(route).toContain('action_type: "EMR_ITEM_DELETE"');
    const fileRoute = read("src/app/api/emr/items/[id]/file/route.ts");
    expect(fileRoute).toContain('action_type: "EMR_ITEM_FILE_UPLOAD"');
    expect(fileRoute).toContain('action_type: "EMR_ITEM_FILE_REMOVE"');
  });

  it("legacy prototype tables are quarantined", () => {
    const migration = read("supabase/migrations/20260926_emr_legacy_quarantine_v1.sql");
    expect(migration).toContain("revoke all privileges");
    expect(migration).toContain("emr_departments");
    expect(migration).toContain("emr_digital_signatures");
  });
});
