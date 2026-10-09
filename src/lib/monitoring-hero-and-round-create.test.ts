import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for 2 explicit reports on the same screenshot of /monitoring
// ("Rà soát vỡ giao diện và thiếu nút mở đợt giám sát bên nút đợt giám sát"):
//
// 1) "Vỡ giao diện": the hero section's 4 stat spans ("13 mẫu bảng kiểm",
//    "13 mẫu đã phát hành", "0 đợt trong năm", "0 việc cần xử lý") and the
//    "Luồng TQM" flow line rendered visually concatenated with no spacing —
//    .monitoring-hero/.monitoring-hero-meta/.monitoring-flow had NEVER had a
//    base CSS definition anywhere in the codebase; only qlvb-theme.css
//    color-overrode them with !important, which only makes sense if a base
//    layout already existed. It never did.
// 2) "Thiếu nút mở đợt giám sát": the "Đợt giám sát" tab's toolbar only ever
//    had a "Xóa bộ lọc" button — "+ Tạo mẫu bảng kiểm" existed only on the
//    sibling "Mẫu bảng kiểm" tab, with no equivalent to actually open/create
//    a monitoring round from this screen.
describe("Monitoring — hero layout CSS exists; '+ Tạo đợt giám sát' button added next to Đợt giám sát", () => {
  const page = readFileSync("src/app/(app)/monitoring/page.tsx", "utf8");
  const client = readFileSync("src/components/monitoring-client.tsx", "utf8");

  it("declares base layout CSS for .monitoring-hero/.monitoring-hero-meta/.monitoring-flow (previously undefined anywhere)", () => {
    expect(page).toContain(".monitoring-workspace .monitoring-hero{position:relative;overflow:hidden;display:flex;flex-wrap:wrap");
    expect(page).toContain(".monitoring-workspace .monitoring-hero-meta{position:relative;display:flex;flex-wrap:wrap;gap:8px");
    expect(page).toContain(".monitoring-workspace .monitoring-hero-meta span{display:inline-flex");
    expect(page).toContain(".monitoring-workspace .monitoring-flow{position:relative;flex:0 0 auto");
  });

  it("collapses the hero to a single column on mobile instead of relying only on flex-wrap", () => {
    expect(page).toContain("@media(max-width:700px){.monitoring-workspace .monitoring-hero{flex-direction:column}");
  });

  it("threads a canCreateRounds (monitoring.perform) permission down to MonitoringClient, separate from canManageTemplates (checklists.manage)", () => {
    expect(page).toContain('const canCreateRounds = user.permissions.includes("monitoring.perform");');
    expect(page).toContain("canCreateRounds={canCreateRounds}");
    expect(client).toContain("canCreateRounds: boolean;");
  });

  it("renders a '+ Tạo đợt giám sát' button on the Đợt giám sát tab's toolbar, gated by canCreateRounds", () => {
    expect(client).toContain('{tab === "rounds" && canCreateRounds ? <button className="button primary" onClick={() => setRoundPickerOpen(true)}><Icon name="plus" size={17} /> Tạo đợt giám sát</button> : null}');
  });

  it("the button opens a picker of PUBLISHED, active templates that links into each template's own page (where version resolution + scheduling already works correctly), instead of re-implementing version lookup", () => {
    expect(client).toContain("const publishedTemplatesForRound = templateRows.filter((x) => x.latest_version_status === \"PUBLISHED\" && x.is_active);");
    expect(client).toContain("{roundPickerOpen ? <div className=\"modal-backdrop\" onClick={() => setRoundPickerOpen(false)}>");
    expect(client).toContain('href={`/monitoring/templates/${t.id}`}');
    expect(client).toContain("Chưa có mẫu bảng kiểm nào đã phát hành");
  });
});
