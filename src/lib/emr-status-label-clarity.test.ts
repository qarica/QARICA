import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression: the user flagged that the generic EMR "Trạng thái" (status)
// column — a workflow status shared by every EMR category — looked
// confusingly similar to Biểu mẫu's own "Tình trạng số hóa" field (a form
// can be digitized but its rollout status is still in progress; the two are
// independent on purpose, not a duplicate). Relabeled to "Trạng thái triển
// khai" (rollout/deployment status) to make that distinction explicit,
// without touching the underlying `status` column, its TODO/IN_PROGRESS/
// DONE/BLOCKED values, or the Go-live gate logic that depends on it.
describe("EMR — generic status column relabeled for clarity", () => {
  const client = readFileSync("src/components/emr-category-client.tsx", "utf8");
  const exportRoute = readFileSync("src/app/api/emr/items/export/route.ts", "utf8");

  it("the table header and edit-modal label both read 'Trạng thái triển khai'", () => {
    expect(client).toContain("<th>Trạng thái triển khai</th>");
    expect(client).toContain("<label>Trạng thái triển khai");
  });

  it("the Excel export header matches the same label", () => {
    expect(exportRoute).toContain("<th>Trạng thái triển khai</th>");
  });

  it("only the label changed — the underlying status values/select options are untouched", () => {
    expect(client).toContain("value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}");
    expect(client).toContain("Object.entries(EMR_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)");
  });
});
