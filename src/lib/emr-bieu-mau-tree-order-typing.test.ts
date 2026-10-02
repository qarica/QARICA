import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for an explicit complaint: "phần nhập số cho gáy và số thứ tự
// biểu mẫu trong gáy khó khăn" — both order number inputs saved on every
// keystroke (onChange), so typing a 2-digit number fired 2 separate network
// requests and the silent list refresh after each one reset the input mid-
// typing. Fixed by keeping the in-progress text in local draft state and
// only saving onBlur (and only when the value actually changed from the
// server's current one) — typing itself never triggers a network call.
describe("EMR Biểu mẫu tree — order number inputs save on blur, not on every keystroke", () => {
  const client = readFileSync("src/components/emr-bieu-mau-tree-client.tsx", "utf8");

  it("declares local draft state for both the group order and the in-gáy item order", () => {
    expect(client).toContain("const [groupOrderDrafts, setGroupOrderDrafts] = useState<Record<string, string>>({});");
    expect(client).toContain("const [itemOrderDrafts, setItemOrderDrafts] = useState<Record<string, string>>({});");
  });

  it("onChange only updates the local draft — it never calls the save function directly", () => {
    expect(client).toContain("onChange={(e) => setGroupOrderDrafts((prev) => ({ ...prev, [group.id]: e.target.value }))}");
    expect(client).toContain("onChange={(e) => setItemOrderDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}");
  });

  it("onBlur commits the change to the server, but only if the value actually differs from the current one", () => {
    expect(client).toContain("if (Number.isFinite(next) && next !== group.sort_order) setGroupOrder(group, next);");
    expect(client).toContain("if (raw !== current) updateItemDetails(item, { binding_group_order: raw });");
  });

  it("pressing Enter blurs the input, so the user isn't forced to click away to commit", () => {
    expect(client).toContain('onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}');
  });
});
