import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Tiếp nhận công văn đến (Tổ Đề xuất): modeled off the real tracking sheet
// (intake + a single GĐ routing annotation + deployment + deadline +
// completion tracking) — explicitly NOT the procurement BGĐ/TGĐ approve-
// reject chain, which doesn't match how công văn is actually processed.
describe("Incoming documents module security and control gates", () => {
  it("separates view and manage permissions at API boundaries", () => {
    expect(read("src/app/api/incoming-documents/route.ts")).toContain('requireApiPermission("incoming_documents.view")');
    expect(read("src/app/api/incoming-documents/route.ts")).toContain('requireApiPermission("incoming_documents.manage")');
    expect(read("src/app/api/incoming-documents/[id]/route.ts")).toContain('requireApiPermission("incoming_documents.manage")');
  });

  it("is reachable from the sidebar only behind incoming_documents.view", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).toContain('{ label: "QUẢN LÝ CÔNG VĂN", href: "/incoming-documents", icon: "file-input", permission: "incoming_documents.view" }');
  });

  it("keeps every write tenant-scoped by organization_id", () => {
    expect(read("src/app/api/incoming-documents/route.ts")).toContain("organization_id: organizationId");
    expect(read("src/app/api/incoming-documents/[id]/route.ts")).toContain('.eq("organization_id", organizationId)');
  });

  it("is its own table — not a procurement_requests approval-chain discriminator", () => {
    const migration = read("supabase/migrations/20261016_incoming_documents_v1.sql");
    expect(migration).toContain("create table if not exists public.incoming_documents");
    expect(migration).not.toContain("procurement_requests");
    expect(migration).not.toContain("BGD_APPROVE");
  });
});

describe("Incoming document status is computed, not manually typed", () => {
  const client = read("src/components/incoming-documents-client.tsx");

  it("derives Hoàn thành đúng hạn / trễ hạn from completed_at vs due_date", () => {
    expect(client).toContain("if (doc.completed_at) {");
    expect(client).toContain('if (doc.due_date && doc.completed_at > doc.due_date) return { label: "Hoàn thành trễ hạn"');
    expect(client).toContain('return { label: "Hoàn thành đúng hạn"');
  });

  it("flags an unfinished document past its due_date as Trễ hạn, otherwise Đang xử lý", () => {
    expect(client).toContain('if (doc.due_date && doc.due_date < now) return { label: "Trễ hạn"');
    expect(client).toContain('return { label: "Đang xử lý"');
  });
});
