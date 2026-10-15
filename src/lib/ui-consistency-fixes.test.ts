import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Real findings from a full-app UI/UX review.
describe("UI consistency fixes (checkbox class, modal-head wrapper)", () => {
  // CLAUDE.md gotcha: a bare <input type="checkbox"> inherits globals.css's
  // input,select,textarea{width:100%;min-height:40px}, rendering it abnormally
  // large. work-row-checkbox.tsx (the "Việc của tôi" row-selection checkbox)
  // had exactly this bug — no .inline-check/.check-card/.radio-row wrapper.
  it("WorkRowCheckbox wraps its bare checkbox in .inline-check", () => {
    const source = read("src/components/work-row-checkbox.tsx");
    expect(source).toContain('<span className="inline-check"><input type="checkbox"');
  });

  // Both validation popups put their <h3> directly inside a manually-padded
  // div instead of .modal-head — inconsistent with every other modal in the
  // app (no border-bottom divider, custom font-size instead of the shared
  // .modal-head h2 style).
  it("monitoring-recheck-client and five-s-checklist-run-client validation popups use .modal-head", () => {
    for (const path of ["src/components/monitoring-recheck-client.tsx", "src/components/five-s-checklist-run-client.tsx"]) {
      const source = read(path);
      expect(source).toContain('<div className="modal-head">');
      expect(source).not.toContain('<h3 id="validation-title"');
    }
    expect(read("src/components/five-s-checklist-run-client.tsx")).toContain('<h2 id="validation-title">');
  });

  // Same bare-checkbox gotcha found again in a proactive UI audit (2026-10-15):
  // the "Chỉ đề xuất khẩn" filter checkbox sat directly in a <label> with no
  // wrapper class, and the HSBA checklist "Đạt một phần tạo lỗi" checkbox sat
  // directly in a <td> — both would render oversized under globals.css's
  // input,select,textarea{width:100%;min-height:40px}.
  it("procurement filter checkbox wraps in .inline-check", () => {
    const source = read("src/components/procurement-requests-client.tsx");
    expect(source).toContain('<label className="inline-check"><input type="checkbox" checked={urgentOnly}');
  });

  it("HSBA checklist table checkbox wraps in .inline-check (same pattern emr-category-client.tsx already uses for in-table checkboxes)", () => {
    const source = read("src/components/hsba-checklist-client.tsx");
    expect(source).toContain('<span className="inline-check"><input type="checkbox" checked={item.create_finding_on_partial}');
  });

  // Reported from a screenshot of "Việc của tôi" > tab Đã hoàn thành: every
  // completed note still showed "Cập nhật tiến độ" and "Xin gia hạn" —
  // requesting a deadline extension (or logging progress) on a task that is
  // already done is nonsensical and reads as confusing on a weekly report
  // view. Only "Mở lại" (reopen) is a coherent action once isDone is true.
  it("UnifiedPersonalTaskActions hides Cập nhật tiến độ / Xin gia hạn once a task is done — only Mở lại remains", () => {
    const source = read("src/components/unified-personal-task-actions.tsx");
    expect(source).toContain('{!isDone?<button type="button" className="button tertiary small" disabled={busy} onClick={()=>{setError("");setEditing(true)}}>Cập nhật tiến độ</button>:null}');
    expect(source).toContain('{!isDone?<button type="button" className="button tertiary small" disabled={busy} onClick={()=>{setError("");setExtending(true)}}>Xin gia hạn</button>:null}');
    expect(source).toContain('onClick={()=>void toggle()}>{isDone?"Mở lại":"Hoàn tất"}</button>');
  });
});
