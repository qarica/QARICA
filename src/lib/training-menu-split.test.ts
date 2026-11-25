import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stepsFor, stepOfTab, parseDetailTab, DETAIL_TABS } from "./procedure-training-detail-nav";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("tách menu Đào tạo / Tự đọc hiểu", () => {
  it("2 route mỏng dùng chung 1 nội dung với mode khác nhau", () => {
    expect(read("src/app/(app)/procedure-trainings/page.tsx")).toContain('mode="training"');
    expect(read("src/app/(app)/tu-doc-hieu/page.tsx")).toContain('mode="self_read"');
  });
  it("menu có 2 mục với đường dẫn không lồng nhau", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).toContain('label: "Đào tạo", href: "/procedure-trainings"');
    expect(nav).toContain('label: "Tự đọc hiểu", href: "/tu-doc-hieu"');
  });
  it("Thư viện văn bản trỏ SELF_READ sang /tu-doc-hieu", () => {
    expect(read("src/components/document-publications-client.tsx")).toContain('href="/tu-doc-hieu"');
  });
});

describe("điều hướng chi tiết lớp: tab gom thành bước", () => {
  it("mọi tab thuộc đúng 1 bước và tab lạ rơi về mặc định", () => {
    for (const t of DETAIL_TABS) expect(stepOfTab(stepsFor(false), t).tabs).toContain(t);
    expect(parseDetailTab("không-có")).toBeNull();
    expect(parseDetailTab("roster")).toBe("roster");
  });
  it("trang chi tiết có bộ chọn lớp cùng chủ đề", () => {
    expect(read("src/components/procedure-training-detail-client.tsx")).toContain('aria-label="Chọn lớp cùng chủ đề"');
  });
});

describe("chế độ chỉ điểm danh", () => {
  it("bỏ bước Kết quả và các tab test", () => {
    const steps = stepsFor(true);
    expect(steps.map((s) => s.key)).toEqual(["prepare", "run"]);
    expect(steps.flatMap((s) => s.tabs)).not.toContain("questions");
  });
});

describe("tab Điểm danh: CSS nút bật/tắt QR phải nằm cùng component (styled-jsx scoping)", () => {
  it("AttendanceTab tự khai báo .ptd-registration-open-toggle", () => {
    const src = read("src/components/procedure-training-detail-client.tsx");
    const start = src.indexOf("function AttendanceTab(");
    const end = src.indexOf("function AnalysisTab(");
    const block = src.slice(start, end);
    expect(block).toContain("<style jsx>");
    expect(block).toContain(".ptd-registration-open-toggle {");
  });
});
