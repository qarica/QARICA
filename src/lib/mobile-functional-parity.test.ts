import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for a real, confirmed bug: "Việc của tôi" (src/app/(app)/tasks/page.tsx)
// used to wrap its ENTIRE all-work section (tab filter, search form, table AND
// pagination) in a single `work-section desktop-only` block, with the mobile
// replacement being just a bare card list with an "Mở" button. On mobile there was
// no way to filter by tab, search, or reach page 2+ of results — a genuine capability
// loss, not just a visual recomposition. The fix narrows `desktop-only` to just the
// <table>, keeps the tab nav / search form / pagination rendering on every viewport
// (they're plain query-string links and a GET form, so there was never a technical
// reason to hide them), and gives the mobile card list its own scoped wrapper.
describe("mobile functional parity — Việc của tôi (tasks page)", () => {
  const page = readFileSync("src/app/(app)/tasks/page.tsx", "utf8");

  it("no longer hides the entire tab/search/table/pagination block behind desktop-only", () => {
    expect(page).not.toContain('id="all-work" className="work-section desktop-only"');
  });

  it("scopes desktop-only to just the table, not the surrounding controls", () => {
    expect(page).toContain('className="table-wrap all-table desktop-only"');
  });

  it("renders the tab filter (ALL/REMINDER/ASSIGNED/WATCH/DONE) outside any desktop-only wrapper", () => {
    const tabsIndex = page.indexOf('<nav className="work-tabs"');
    const allWorkSectionIndex = page.indexOf('id="all-work" className="work-section"');
    expect(tabsIndex).toBeGreaterThan(-1);
    expect(allWorkSectionIndex).toBeGreaterThan(-1);
    // the tab nav must be inside the plain (non desktop-only) all-work section,
    // i.e. it appears after that section's opening tag
    expect(tabsIndex).toBeGreaterThan(allWorkSectionIndex);
    // and before the desktop-only table that follows it
    const desktopOnlyTableIndex = page.indexOf('className="table-wrap all-table desktop-only"');
    expect(tabsIndex).toBeLessThan(desktopOnlyTableIndex);
  });

  it("renders the search form outside any desktop-only wrapper", () => {
    const searchFormIndex = page.indexOf('className="work-search-row"');
    const desktopOnlyTableIndex = page.indexOf('className="table-wrap all-table desktop-only"');
    expect(searchFormIndex).toBeGreaterThan(-1);
    expect(searchFormIndex).toBeLessThan(desktopOnlyTableIndex);
  });

  it("renders pagination outside any desktop-only/mobile-only split (reachable regardless of viewport)", () => {
    const paginationIndex = page.indexOf('className="work-pagination"');
    const mobileCardListIndex = page.indexOf('className="mobile-only work-card-list"');
    expect(paginationIndex).toBeGreaterThan(-1);
    // pagination must render AFTER both the desktop table and the mobile card
    // list (so it applies to whichever one is visible), not nested inside either
    expect(paginationIndex).toBeGreaterThan(mobileCardListIndex);
  });

  it("gives the mobile card list its own scoped class instead of a bare desktop-only sibling section", () => {
    expect(page).toContain('className="mobile-only work-card-list"');
    expect(page).not.toMatch(/<section className="mobile-only">\{tableRowsPage/);
  });

  it("keeps the mobile tab strip horizontally scrollable instead of wrapping into a multi-row block now that it always renders", () => {
    expect(page).toContain(".tqm-my-work .work-tabs{flex-wrap:nowrap;overflow-x:auto");
  });
});

// Regression for a real, confirmed bug: Đo lường & Giám sát's "Danh mục chỉ số
// đang vận hành" list (src/components/indicator-quality-overview.tsx) hid the
// 4th, 5th AND 6th children of each .iq-assignment row — via
// `nth-child(n+4){display:none}` — between 701px and 1200px viewport width.
// The 6th child is the "Mở" / "Chờ nhập" link, the only way to open a
// measurement record from this list, so a tablet/small-laptop user in that
// width band lost the ability to open any indicator measurement from here,
// with no restoration until the separate ≤700px rule kicked in.
describe("mobile functional parity — Đo lường & Giám sát (indicator operating list)", () => {
  const component = readFileSync("src/components/indicator-quality-overview.tsx", "utf8");

  it("no longer hides the row's action link (6th child) at the 1200px breakpoint", () => {
    expect(component).not.toContain(".iq-assignment>*:nth-child(n+4){display:none}");
  });

  it("only hides the two data cells (department/collector, latest result) that have no action, keeping the 'Mở' link reachable", () => {
    expect(component).toContain(".iq-assignment>*:nth-child(4),.iq-assignment>*:nth-child(5){display:none}");
  });
});
