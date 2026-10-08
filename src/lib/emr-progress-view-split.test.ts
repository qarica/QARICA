import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMR_CATEGORY_FIELDS } from "./emr-categories";

// Regression for an explicit complaint: "menu biểu mẫu nên để thông tin về
// biểu mẫu thôi, còn tiến độ liên quan số hóa và triển khai từng biểu mẫu
// cần có menu riêng hoặc menu con... hiện đang nhét hết vào 1 màn hình rất
// khó". Implemented as a "menu con" (tab switcher within the SAME page/list,
// not a second page) so the underlying data stays one source of truth — a
// generic `progressField` flag any category's field can opt into, grouping
// it under a "Tiến độ triển khai" tab instead of the default info tab. A
// category with no progressField fields (every category except Biểu mẫu
// today) renders exactly as before: no tabs, nothing hidden.
describe("EMR grid — Thông tin / Tiến độ triển khai tab split", () => {
  const client = readFileSync("src/components/emr-category-client.tsx", "utf8");

  it("Biểu mẫu's deployment_phase and training_required are marked progressField; digitized (catalog info) is not", () => {
    const fields = EMR_CATEGORY_FIELDS.BIEU_MAU;
    expect(fields.find((f) => f.key === "deployment_phase")?.progressField).toBe(true);
    expect(fields.find((f) => f.key === "training_required")?.progressField).toBe(true);
    expect(fields.find((f) => f.key === "digitized")?.progressField).toBeFalsy();
  });

  it("splits columnFields into infoColumns/progressColumns, and only shows the tab switcher when a category actually has progressField columns", () => {
    expect(client).toContain("const infoColumns = columnFields.filter((f) => !f.progressField);");
    expect(client).toContain("const progressColumns = columnFields.filter((f) => f.progressField);");
    expect(client).toContain("const hasProgressSplit = progressColumns.length > 0;");
    expect(client).toContain('{hasProgressSplit ? (');
  });

  it("a category with no progressField fields keeps its single unified table — visible columns and the description/priority/due/status fields all stay on regardless of `view`", () => {
    expect(client).toContain('const showDescription = !(hasProgressSplit && view === "progress");');
    expect(client).toContain('const showPriorityDueStatus = !(hasProgressSplit && view === "info");');
    expect(client).toContain('const visibleInfoColumns = hasProgressSplit && view === "progress" ? [] : infoColumns;');
    expect(client).toContain('const visibleProgressColumns = hasProgressSplit && view === "info" ? [] : progressColumns;');
  });

  it("the generic Ưu tiên/Hạn/Trạng thái triển khai columns move to the Tiến độ triển khai tab together with progressField columns, not the info tab", () => {
    expect(client).toContain('{showPriorityDueStatus?<><th>Ưu tiên</th><th>Hạn</th><th>Trạng thái triển khai</th></>:null}');
  });

  it("the create/edit modal is unaffected by the view split — every field (info or progress) is still editable in one modal", () => {
    expect(client).toContain('{extraFields.filter((f) => !f.pairWithStatus && !(categoryCode === "BIEU_MAU" && f.key === "record_types")).map((f) => (');
  });
});
