import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { categoriesReferencing, EMR_CATEGORY_FIELDS } from "./emr-categories";

// Regression for an explicit user report: "Anh cần 1 nút để xem lỗi và ghi
// chú" — Lỗi liên quan (reverse reference from LOI.related_form_id) and Ghi
// chú (Biểu mẫu's own "notes" field) already existed, but were only reachable
// by opening the generic "▸ Xem chi tiết" expand row alongside every other
// compact field. This adds a dedicated, clearly-labeled "Lỗi & Ghi chú"
// button (visible to every user, not gated behind canManage, since viewing is
// not a write) that opens a popover showing both together, plus a badge with
// the related-Lỗi count and a link to record a new one.
//
// Implemented generically (loiReference via categoriesReferencing — the same
// reverse-reference mechanism already used elsewhere in this file — and
// hasNotesField via extraFields.some(f => f.key === "notes")) rather than
// hard-coded to categoryCode === "BIEU_MAU", so the button also appears for
// any future category that gains a Lỗi reverse-reference or a notes field,
// and stays hidden (no empty button) for every category that has neither.
describe("EMR — 'Lỗi & Ghi chú' button on each row", () => {
  const client = readFileSync("src/components/emr-category-client.tsx", "utf8");

  it("Biểu mẫu has both a notes field and an incoming Lỗi reference, so the button applies to it", () => {
    const fields = EMR_CATEGORY_FIELDS.BIEU_MAU;
    expect(fields.find((f) => f.key === "notes")?.type).toBe("textarea");
    const incoming = categoriesReferencing("BIEU_MAU");
    expect(incoming.some((r) => r.category === "LOI")).toBe(true);
  });

  it("derives loiReference and hasNotesField generically, not hard-coded to a specific category", () => {
    expect(client).toContain('const loiReference = incomingReferences.find((r) => r.category === "LOI");');
    expect(client).toContain('const hasNotesField = extraFields.some((f) => f.key === "notes");');
    expect(client).not.toMatch(/loiReference[\s\S]{0,200}categoryCode === "BIEU_MAU"/);
  });

  it("renders the button only when the category has a Lỗi reference or a notes field, visible to every user (not gated by canManage)", () => {
    expect(client).toContain("{loiReference || hasNotesField ? (");
    expect(client).toContain('onClick={() => setNotesPopoverItem(item)}');
    expect(client).toContain("Lỗi &amp; Ghi chú");
  });

  it("shows a danger badge with the related-Lỗi count on the button, derived from refItems.LOI filtered by the reference field", () => {
    expect(client).toContain("const loiCount = (refItems.LOI || []).filter((r) => r.details?.[loiReference.field.key] === item.id).length;");
    expect(client).toContain('<span className="status-badge danger" style={{ marginLeft: 5 }}>{loiCount}</span>');
  });

  it("renders a popover modal with the item's Ghi chú text and a list of related Lỗi items linking to /emr/loi", () => {
    expect(client).toContain("{notesPopoverItem ? (");
    expect(client).toContain('<h3>Lỗi &amp; Ghi chú — {notesPopoverItem.title}</h3>');
    expect(client).toContain("{notesPopoverItem.details?.notes ? String(notesPopoverItem.details.notes) : \"—\"}");
    expect(client).toContain('href="/emr/loi"');
    expect(client).toContain("Ghi nhận lỗi mới →");
    expect(client).toContain("Chưa có lỗi nào được ghi nhận cho mục này.");
  });

  it("the popover reuses the existing modal-backdrop/modal-card chrome instead of a one-off style", () => {
    expect(client).toMatch(/notesPopoverItem \? \(\s*<div className="modal-backdrop"/);
    expect(client).toContain('<div className="modal-card" onClick={(e) => e.stopPropagation()}>');
  });
});
