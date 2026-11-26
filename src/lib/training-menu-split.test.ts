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
    for (const t of DETAIL_TABS.filter((x) => x !== "attendance")) expect(stepOfTab(stepsFor(false), t).tabs).toContain(t);
    for (const t of DETAIL_TABS.filter((x) => x !== "questions" && x !== "analysis")) expect(stepOfTab(stepsFor(true), t).tabs).toContain(t);
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

import { groupRowsByTopic } from "./procedure-training-topic-rollup";

describe("danh sách lớp: mỗi chủ đề 1 dòng", () => {
  const t = (id: string, name: string, doc: string | null = null) => ({ id, procedure_name: name, document_publication_id: doc });
  it("gộp lớp cùng tên (không phân biệt hoa/thường), giữ cả chủ đề 1 lớp và thứ tự xuất hiện", () => {
    const rows = groupRowsByTopic([t("a", "QT Cấp cứu"), t("b", "Khác"), t("c", "qt cấp cứu")]);
    expect(rows.map((r) => r.items.map((x) => x.id))).toEqual([["a", "c"], ["b"]]);
  });
  it("cùng văn bản nguồn thì gộp dù khác tên", () => {
    const rows = groupRowsByTopic([t("a", "X", "doc1"), t("b", "Y", "doc1")]);
    expect(rows).toHaveLength(1);
  });
});

describe("chi tiết lớp: mở mặc định ở Thông tin đào tạo (bước Chuẩn bị)", () => {
  it("tab mặc định là info, không nhảy thẳng vào Nhân sự & điểm", () => {
    const src = read("src/components/procedure-training-detail-client.tsx");
    expect(src).toContain('useState<DetailTab>(initialTab ?? "info")');
    expect(src).not.toContain('initialTab ?? "roster"');
  });
});

describe("không quét 2 lần: chỉ-điểm-danh dùng QR điểm danh, có-test chỉ dùng QR làm bài", () => {
  it("lớp có test không có tab/QR Điểm danh; lớp chỉ điểm danh thì có", () => {
    expect(stepsFor(false).flatMap((s) => s.tabs)).not.toContain("attendance");
    expect(stepsFor(true).flatMap((s) => s.tabs)).toContain("attendance");
  });
  it("API công khai điểm danh từ chối lớp không phải chỉ-điểm-danh (GET lẫn POST)", () => {
    const r = read("src/app/api/public/training-attendance/[trainingId]/route.ts");
    expect(r).toContain("!training.is_open_for_attendance || !training.is_attendance_only");
    expect(r.split("!training.is_attendance_only").length - 1).toBe(2);
  });
  it("PATCH lớp: không bật được QR điểm danh cho lớp có test; về chế độ có test thì đóng link", () => {
    const r = read("src/app/api/procedure-trainings/[id]/route.ts");
    expect(r).toContain("if (body.is_attendance_only === false) update.is_open_for_attendance = false;");
    expect(r).toContain("chỉ lớp chỉ điểm danh mới bật QR điểm danh");
  });
  it("nộp bài qua QR = điểm danh và ghi giờ quét (cả người mới lẫn người đã có)", () => {
    const r = read("src/app/api/public/training-test/[roundId]/submit/route.ts");
    expect(r).toContain("checked_in_at: matchedAttendee.checked_in_at ?? new Date().toISOString()");
    expect(r).toContain("checked_in_at: new Date().toISOString(),");
  });
});

describe("khung Thông tin đào tạo: nhóm thành các khối, bỏ nhãn 'lần 1'", () => {
  it("chế độ xem chia 4 khối; khối Bài kiểm tra chỉ hiện với lớp có test", () => {
    const src = read("src/components/procedure-training-detail-client.tsx");
    const start = src.indexOf('<div className="ptd-info">');
    const block = src.slice(start, src.indexOf("</style>", start));
    for (const h of ["Lớp học", "Thời gian &amp; địa điểm", "Bài kiểm tra", "Ghi nhận"]) expect(block).toContain(`<h3>${h}</h3>`);
    expect(block).toContain("training.is_attendance_only ? null : (");
    expect(src).not.toContain("Đào tạo lần 1");
    expect(block).toContain("<style jsx>");
  });
});

describe("trang chi tiết lớp: nút Xóa lớp", () => {
  const src = read("src/components/procedure-training-detail-client.tsx");
  it("gọi DELETE /api/procedure-trainings/[id], xác nhận trước, khóa khi lớp đã hoàn thành", () => {
    expect(src).toContain('fetch(`/api/procedure-trainings/${training.id}`, { method: "DELETE" })');
    expect(src).toContain("window.confirm(`${warning}");
    expect(src).toContain('disabled={deleting || training.status === "TRAINED"}');
  });
  it("sau khi xoá chuyển sang lớp khác cùng chủ đề hoặc về danh sách", () => {
    expect(src).toContain('router.push(nextClassId ? `/procedure-trainings/${nextClassId}` : "/procedure-trainings");');
    expect(src).toContain("nextClassId={(classOptions ?? []).find((o) => o.id !== training.id)?.id ?? null}");
  });
  it("API DELETE vẫn chặn lớp đã hoàn thành và cần procedure_training.manage", () => {
    const api = read("src/app/api/procedure-trainings/[id]/route.ts");
    const del = api.slice(api.indexOf("export async function DELETE"));
    expect(del).toContain('requireApiPermission("procedure_training.manage")');
    expect(del).toContain('existing.status === "TRAINED"');
  });
});

describe("khung Thông tin: Trạng thái / Hình thức là ô chọn, không còn nút chuyển chế độ", () => {
  const src = read("src/components/procedure-training-detail-client.tsx");
  it("2 ô chọn (chỉ người có quyền quản lý), đủ lựa chọn", () => {
    expect(src).toContain('aria-label="Trạng thái lớp"');
    expect(src).toContain('aria-label="Hình thức lớp"');
    for (const o of ['value="NOT_PLANNED"', 'value="PLANNED"', 'value="TRAINED"', 'value="WITH_TEST"', 'value="ATTENDANCE_ONLY"']) expect(src).toContain(o);
    expect(src).toContain("{canManage ? (\n                    <select");
  });
  it("bỏ nút 'Chuyển sang chỉ điểm danh' / 'Chuyển về có bài test' / '✓ Hoàn thành lớp'", () => {
    expect(src).not.toContain("Chuyển sang chỉ điểm danh");
    expect(src).not.toContain("Chuyển về có bài test");
    expect(src).not.toContain("✓ Hoàn thành lớp");
  });
  it("đổi hình thức vẫn xác nhận và gọi PATCH is_attendance_only", () => {
    expect(src).toContain("body: JSON.stringify({ is_attendance_only: next })");
    expect(src).toContain("if (!window.confirm(message)) return;");
  });
});

describe("ô chọn trong khung Thông tin: cỡ chữ ghi đè được rule global", () => {
  it("font-size 16px !important (rule .workspace-app select ép 13px)", () => {
    expect(read("src/components/procedure-training-detail-client.tsx")).toContain("font-size: 16px !important;");
  });
});
