import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Real findings from a full-app UI/UX review.
describe("UI consistency fixes (checkbox class, modal-head wrapper)", () => {
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
    expect(source).toContain('{!isDone?<button type="button" className="button tertiary small" disabled={busy||isPending} onClick={()=>{setError("");setEditing(true)}}>Cập nhật tiến độ</button>:null}');
    expect(source).toContain('{!isDone?<button type="button" className="button tertiary small" disabled={busy||isPending} onClick={()=>{setError("");setExtending(true)}}>Xin gia hạn</button>:null}');
    expect(source).toContain('onClick={()=>void toggle()}>{busy||isPending?"Đang cập nhật...":isDone?"Mở lại":"Hoàn tất"}</button>');
  });

  // Báo cáo tiếp theo: "giao diện đổi trạng thái ko mượt và đơ" — router.refresh()
  // re-runs the whole page's server-component query chain (dozens of Supabase
  // calls), which is slow, but setBusy(false) used to fire immediately BEFORE
  // router.refresh() — the button looked idle while the real reload was still
  // silently happening, which read as sluggish/stuck. Fix: wrap router.refresh()
  // in useTransition and fold isPending into disabled, so the button stays
  // visibly busy until the refreshed data is actually ready.
  it("UnifiedPersonalTaskActions wraps router.refresh() in useTransition instead of calling it right after setBusy(false)", () => {
    const source = read("src/components/unified-personal-task-actions.tsx");
    expect(source).toContain('import {useState,useTransition} from "react";');
    expect(source).toContain("const [isPending,startTransition]=useTransition();");
    expect(source.match(/startTransition\(\(\)=>\{router\.refresh\(\);\}\);/g)?.length).toBe(3);
    expect(source).not.toContain("setBusy(false);router.refresh();");
  });

  // Reported from a desktop screenshot of the floating quick-capture panel
  // (GlobalQuickCapture): on a wide screen it was still fixed at a narrow
  // 340px with a cramped 3-row textarea — too small to comfortably type a
  // note. Widened the panel and gave the textarea real room to type into.
  it("GlobalQuickCapture panel is wide enough and its textarea has real room to type (not a cramped 340px/3-row box)", () => {
    const source = read("src/components/global-quick-capture.tsx");
    expect(source).toContain("width:min(440px,calc(100vw - 32px))");
    expect(source).not.toContain("width:min(340px,calc(100vw - 32px))");
    expect(source).toContain('rows={6}');
    expect(source).toContain("min-height:140px");
  });

  // Reported from a screenshot: "Việc của tôi" showed a row-selection
  // checkbox column plus "Liên quan đến"/"Người giao" columns that were
  // always empty and had no bulk action behind them (work-row-checkbox.tsx's
  // own source comment: "Không có bulk action thật gắn kèm"). Deleted the
  // dead component entirely rather than leave unused decoration in the table.
  it("removes the purely-decorative work-row-checkbox.tsx (no real bulk action was ever wired to it)", () => {
    expect(existsSync("src/components/work-row-checkbox.tsx")).toBe(false);
    const source = read("src/app/(app)/tasks/page.tsx");
    expect(source).not.toContain("WorkRowCheckbox");
    expect(source).not.toContain("WorkRowSelectionProvider");
    expect(source).not.toContain("WorkSelectionCount");
  });

  // Reported from a screenshot of the installed-app window title bar: it
  // showed "QARICA — Nền tảng Quản trị Chất lượng & Cải tiến - QARICA" — the
  // long PWA manifest `name` concatenated with `short_name` by the OS/browser
  // chrome, reading as a duplicated/cluttered line. Shortened `name` to match
  // `short_name` so the title bar no longer shows the name twice.
  it("manifest name matches short_name (no duplicated long title text in the installed-app window title bar)", () => {
    const source = read("src/app/manifest.ts");
    expect(source).toContain('name: "QARICA",');
    expect(source).not.toContain("Nền tảng Quản trị Chất lượng & Cải tiến");
  });

  // Reported from a screenshot: the 3 date/department scope filters on
  // "Trung tâm Điều hành Chất lượng" (/dashboard) each inherited globals.css's
  // input,select,textarea{width:100%} as a flex item, so each one stretched
  // to the full width of its flex container and wrapped onto its own row —
  // not actually "3 buttons in 1 row" despite the flex-wrap container.
  it("dashboard scope-controls constrains input/select width so the 3 filters sit on one row instead of each stretching to 100% and wrapping", () => {
    const source = read("src/app/(app)/dashboard/page.tsx");
    expect(source).toContain(".qcc-dashboard .scope-controls input,.qcc-dashboard .scope-controls select{width:auto;min-height:38px}");
  });

  // Reported from a screenshot: the "Xin chào, ..." hero banner between the
  // scope filters and the KPI cards added no information (just a greeting)
  // and was called out as clutter — removed entirely, including its
  // now-unused .hero-banner* CSS.
  it("removes the Xin chào hero banner from the dashboard", () => {
    const source = read("src/app/(app)/dashboard/page.tsx");
    expect(source).not.toContain("Xin chào");
    expect(source).not.toContain("hero-banner");
  });
});
