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
});
