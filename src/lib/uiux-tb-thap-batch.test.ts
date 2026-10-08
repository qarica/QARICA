import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("UIUX TB/Thấp batch", () => {
  it("dashboard no longer hand-rolls raw <svg> icons, uses the shared Icon component like every other page", () => {
    const page = read("src/app/(app)/dashboard/page.tsx");
    expect(page).not.toMatch(/<svg width="(18|20|26|16)"/);
    expect(page).toContain('<Icon name="building-2" size={20}/>');
    expect(page).toContain('<Icon name="layers" size={26}/>');
    expect(page).toContain('<Icon name="circle-alert" size={16}/>');
  });

  it("checkbox sizing no longer relies on repeated inline style overrides — uses .inline-check/.check-card like CLAUDE.md documents", () => {
    expect(read("src/components/plan-composer-client.tsx")).not.toContain('style={{ width: "auto", minHeight: 0, marginTop: 2 }}');
    expect(read("src/components/plan-action-create-client.tsx")).not.toContain('style={{ width: 18, height: 18, minHeight: 18, flex: "0 0 auto" }}');
    expect(read("src/components/record-action-create-client.tsx")).toContain('className="inline-check"');
  });

  it("the 4 bespoke checkbox CSS classes were consolidated onto the 3 standard ones", () => {
    expect(read("src/components/record-quality-domains-client.tsx")).toContain('className="check-card"');
    expect(read("src/components/domain-create-client.tsx")).toContain("check-card");
    expect(read("src/app/domain-create.css")).not.toContain(".domain-checkbox");
    expect(read("src/components/incident-lessons-learned-client.tsx")).toContain('className="wide check-card"');
    expect(read("src/components/quality-record-edit-client.tsx")).toContain('className="wide inline-check"');
  });

  it("a shared .loading-state primitive exists so a loading view no longer looks identical to an empty one", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain(".loading-state{");
    const component = read("src/components/loading-state.tsx");
    expect(component).toContain("export function LoadingState(");
  });

  it("the trend table (and multi-series variant) are wrapped in table-wrap", () => {
    const source = read("src/components/tqm-charts.tsx");
    expect(source).toContain('<div className="table-wrap"><table className="tqm-trend-table">');
  });

  it("login-form.tsx goes through the shared Icon wrapper instead of importing lucide-react directly", () => {
    const source = read("src/components/login-form.tsx");
    expect(source).not.toContain('from "lucide-react"');
    expect(source).toContain('import { Icon } from "@/components/icon";');
  });
});
