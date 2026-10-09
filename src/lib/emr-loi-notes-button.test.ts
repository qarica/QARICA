import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { categoriesReferencing, EMR_CATEGORY_FIELDS } from "./emr-categories";

// Regression for an explicit user report: "Anh cần 1 nút để xem lỗi và ghi
// chú" — Lỗi liên quan (reverse reference from LOI.related_form_id) and Ghi
// chú (Biểu mẫu's own "notes" field) already existed, but were only reachable
// by opening the generic "▸ Xem chi tiết" expand row alongside every other
// compact field. A first iteration added a small per-row button in the
// actions column, but the user corrected the placement: "Nút lỗi và ghi chú
// sẽ ngang hàng với các nút thông tin biểu mẫu, tiến độ ... để bấm xem chứ ko
// phải nút con" — it must be a TAB at the same level as "Thông tin .../Tiến
// độ triển khai" (a whole-table view switch), not a small button nested
// inside each row's action column. Clicking the tab now swaps the table's
// visible columns to show Ghi chú + Lỗi liên quan for every row at once,
// exactly like how "Tiến độ triển khai" swaps to progressField columns.
//
// Implemented generically (loiReference via categoriesReferencing — the same
// reverse-reference mechanism already used elsewhere in this file — and
// hasNotesField via extraFields.some(f => f.key === "notes")) rather than
// hard-coded to categoryCode === "BIEU_MAU", so the tab also appears for any
// future category that gains a Lỗi reverse-reference or a notes field, and
// stays hidden for every category that has neither.
describe("EMR — 'Lỗi & Ghi chú' tab (ngang hàng với Thông tin/Tiến độ, không phải nút con)", () => {
  const client = readFileSync("src/components/emr-category-client.tsx", "utf8");

  it("Biểu mẫu has both a notes field and an incoming Lỗi reference, so the tab applies to it", () => {
    const fields = EMR_CATEGORY_FIELDS.BIEU_MAU;
    expect(fields.find((f) => f.key === "notes")?.type).toBe("textarea");
    const incoming = categoriesReferencing("BIEU_MAU");
    expect(incoming.some((r) => r.category === "LOI")).toBe(true);
  });

  it("derives loiReference, hasNotesField and hasNotesSplit generically, not hard-coded to a specific category", () => {
    expect(client).toContain('const loiReference = incomingReferences.find((r) => r.category === "LOI");');
    expect(client).toContain('const hasNotesField = extraFields.some((f) => f.key === "notes");');
    expect(client).toContain("const hasNotesSplit = Boolean(loiReference) || hasNotesField;");
  });

  it("renders a 'Lỗi & Ghi chú' tab button at the same level as 'Thông tin .../Tiến độ triển khai', gated on hasNotesSplit — not a per-row button", () => {
    expect(client).toContain('{hasNotesSplit ? <button type="button" className={`button ${view === "notes" ? "primary" : "tertiary"} small`} onClick={() => setView("notes")}>Lỗi &amp; Ghi chú</button> : null}');
    // No more per-item popover trigger/state from the earlier iteration.
    expect(client).not.toContain("notesPopoverItem");
    expect(client).not.toContain('onClick={() => setNotesPopoverItem(item)}');
  });

  it("selecting the tab (view === 'notes') switches visible columns to Ghi chú + Lỗi liên quan and hides the other column groups", () => {
    expect(client).toContain('const showNotesColumns = hasNotesSplit && view === "notes";');
    expect(client).toContain('{showNotesColumns?<>{hasNotesField?<th>Ghi chú</th>:null}{loiReference?<th>Lỗi liên quan</th>:null}</>:null}');
    // view === "notes" also empties out the info/progress columns and hides
    // description/priority-due-status, so the notes tab isn't just added on
    // top of everything else.
    expect(client).toContain('view === "notes" ? [] : infoColumns');
    expect(client).toContain('view === "notes" ? [] : progressColumns');
    expect(client).toContain('&& view !== "notes";');
  });

  it("renders the Ghi chú text and a Lỗi liên quan count/link per row when the tab is active", () => {
    expect(client).toContain('{hasNotesField?<td>{item.details?.notes ? String(item.details.notes) : "—"}</td>:null}');
    expect(client).toContain("const loiCount = (refItems.LOI || []).filter((r) => r.details?.[loiReference.field.key] === item.id).length;");
    expect(client).toContain('{loiCount ? <Link className="table-link" href="/emr/loi">{loiCount} lỗi liên quan →</Link> : <Link className="table-link" href="/emr/loi">Ghi nhận lỗi mới →</Link>}');
  });

  it("the toolbar-right tab group wraps on narrow screens instead of being clipped (body has overflow-x:hidden, so an unwrapped row would just disappear off-screen)", () => {
    expect(client).toContain('<div className="toolbar-right" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>');
  });
});
