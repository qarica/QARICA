import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for an explicit request: "về thứ tự biểu mẫu khi di chuyển lên
// xuống tự động cập nhật số thứ tự sẽ ok hơn" — typing an exact STT by hand
// for every form in a gáy was replaced by move up/down buttons that
// renumber automatically. Moving a form swaps it with its neighbor in the
// already-sorted list, then renumbers the WHOLE gáy sequentially (1..N) so
// the numbers always stay clean and contiguous, regardless of whatever
// gaps/duplicates/missing values existed before.
describe("EMR Biểu mẫu tree — move up/down auto-renumbers the whole gáy", () => {
  const client = readFileSync("src/components/emr-bieu-mau-tree-client.tsx", "utf8");

  it("declares a move function that swaps the clicked item with its neighbor in the sorted group list", () => {
    expect(client).toContain('async function moveItemOrder(groupItems: TreeItem[], item: TreeItem, direction: "up" | "down")');
    expect(client).toContain("const swapIdx = direction === \"up\" ? idx - 1 : idx + 1;");
    expect(client).toContain("[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];");
  });

  it("renumbers every item in the group sequentially (1..N) after the swap, not just the two swapped items", () => {
    expect(client).toContain("for (const [i, it] of reordered.entries()) {");
    expect(client).toContain("const newOrder = i + 1;");
  });

  it("skips the network call for an item whose order already matches, instead of rewriting every row on every move", () => {
    expect(client).toContain("if (current === newOrder) continue;");
  });

  it("renders an up and a down button per row instead of a typed number input", () => {
    expect(client).toContain('onClick={() => moveItemOrder(groupItems, item, "up")}');
    expect(client).toContain('onClick={() => moveItemOrder(groupItems, item, "down")}');
  });

  it("disables the up button on the first row and the down button on the last row of its gáy", () => {
    expect(client).toContain("disabled={savingId === item.id || idx === 0}");
    expect(client).toContain("disabled={savingId === item.id || idx === groupItems.length - 1}");
  });

  it("the move control is only rendered for managers (emr.manage), not every viewer", () => {
    expect(client).toMatch(/canManage \? \(\s*<td>\s*<div className="bieu-mau-tree-order-controls">/);
  });
});
