import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for an explicit request: "bỏ mũi tên" — the ↑/↓ buttons used to
// reorder a biểu mẫu within its gáy didn't work well on the phones anh/chị
// test with, so they were replaced with touch-friendly drag-and-drop
// (pointer events, not HTML5 draggable — HTML5 drag-and-drop has no touch
// support). Dropping a row renumbers the WHOLE gáy sequentially (1..N) so
// the numbers always stay clean and contiguous, regardless of whatever
// gaps/duplicates/missing values existed before — same guarantee the old
// move up/down buttons gave.
describe("EMR Biểu mẫu tree — drag-and-drop reorder auto-renumbers the whole gáy", () => {
  const client = readFileSync("src/components/emr-bieu-mau-tree-client.tsx", "utf8");

  it("no longer renders the old up/down move buttons", () => {
    expect(client).not.toContain("moveItemOrder");
    expect(client).not.toContain("bieu-mau-tree-order-buttons");
    expect(client).not.toContain('direction: "up" | "down"');
  });

  it("uses pointer events (not HTML5 draggable) so dragging works on touch devices, not just mouse", () => {
    expect(client).toContain("onPointerDown={(e) => startDrag(e, groupName, groupItems, idx)}");
    expect(client).toContain("onPointerMove={onDragPointerMove}");
    expect(client).toContain("onPointerUp={onDragPointerUp}");
    expect(client).toContain("onPointerCancel={onDragPointerUp}");
    expect(client).not.toMatch(/draggable[= ]/);
    expect(client).not.toContain("onDragStart");
  });

  it("captures the pointer on the drag handle so move/up events keep targeting it as the finger moves across other rows", () => {
    expect(client).toContain("(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);");
  });

  it("finds the row under the pointer via elementFromPoint and only reorders within the same gáy (never drags an item into a different group)", () => {
    expect(client).toContain("document.elementFromPoint(e.clientX, e.clientY)");
    expect(client).toContain('target?.closest<HTMLElement>("tr[data-row-index]")');
    expect(client).toContain("rowEl.dataset.groupName !== drag.groupName");
  });

  it("drops the moved item at the hovered position and commits the full reordered array", () => {
    expect(client).toContain("async function onDragPointerUp()");
    expect(client).toContain("const [moved] = reordered.splice(fromIndex, 1);");
    expect(client).toContain("reordered.splice(overIndex, 0, moved);");
    expect(client).toContain("await commitOrder(groupName, reordered);");
  });

  it("renumbers every item in the group sequentially (1..N) after the drop, not just the moved item", () => {
    expect(client).toContain("async function commitOrder(groupName: string, reordered: TreeItem[])");
    expect(client).toContain("for (const [i, it] of reordered.entries()) {");
    expect(client).toContain("const newOrder = i + 1;");
  });

  it("skips the network call for an item whose order already matches, instead of rewriting every row on every drop", () => {
    expect(client).toContain("if (current === newOrder) continue;");
  });

  it("blocks starting a new drag while a previous drop is still saving, to avoid overlapping reorder commits", () => {
    expect(client).toContain("if (reorderingGroup) return;");
  });

  it("the drag handle is only rendered for managers (emr.manage), not every viewer", () => {
    expect(client).toMatch(/canManage \? \(\s*<td>\s*<div className="bieu-mau-tree-order-controls">/);
  });
});
