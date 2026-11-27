import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fmtDate, fmtDateFile, maskVnDate, parseVnDate } from "./lab-supplies";

const read = (p: string) => readFileSync(p, "utf8");

describe("định dạng ngày dd/mm/yyyy", () => {
  it("fmtDate: ISO → dd/mm/yyyy; rỗng → —", () => {
    expect(fmtDate("2026-11-26")).toBe("26/11/2026");
    expect(fmtDate("2026-11-26T08:00:00Z")).toBe("26/11/2026");
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("")).toBe("—");
  });
  it("fmtDateFile: dùng được trong tên file", () => {
    expect(fmtDateFile("2026-01-05")).toBe("05-01-2026");
  });
  it("parseVnDate: chỉ nhận ngày có thật trên lịch", () => {
    expect(parseVnDate("26/11/2026")).toBe("2026-11-26");
    expect(parseVnDate("5/1/2026")).toBe("2026-01-05");
    expect(parseVnDate("29/02/2024")).toBe("2024-02-29");
    expect(parseVnDate("29/02/2026")).toBeNull();
    expect(parseVnDate("31/04/2026")).toBeNull();
    expect(parseVnDate("32/01/2026")).toBeNull();
    expect(parseVnDate("2026-11-26")).toBeNull();
    expect(parseVnDate("abc")).toBeNull();
  });
  it("maskVnDate: tự chèn dấu / khi gõ, bỏ ký tự lạ, tối đa 8 chữ số", () => {
    expect(maskVnDate("2")).toBe("2");
    expect(maskVnDate("261")).toBe("26/1");
    expect(maskVnDate("26112026")).toBe("26/11/2026");
    expect(maskVnDate("26/11/2026999")).toBe("26/11/2026");
    expect(maskVnDate("2a6-1")).toBe("26/1");
  });
  it("vòng đi vòng lại ISO ↔ dd/mm/yyyy", () => {
    for (const iso of ["2026-11-26", "2027-01-05", "2024-02-29"]) expect(parseVnDate(fmtDate(iso))).toBe(iso);
  });
});

describe("mọi màn hình của Kho dùng dd/mm/yyyy", () => {
  const files = readdirSync("src/components").filter((f) => /^lab-supplies-.*\.tsx$/.test(f) && f !== "lab-supplies-date-input.tsx");
  it("không còn <input type=\"date\"> trần (phụ thuộc ngôn ngữ trình duyệt): dùng LabDateInput", () => {
    for (const f of files) expect(read(`src/components/${f}`), f).not.toContain('type="date"');
    expect(read("src/components/lab-supplies-date-input.tsx")).toContain('placeholder="dd/mm/yyyy"');
  });
  it("các chỗ hiển thị ngày đều đi qua fmtDate (không in thẳng chuỗi ISO)", () => {
    const raw = /\{(?:r|m|c|a|x|lot|v\.older)\??\.(?:lot\??\.)?(?:movement_date|expiry_date|nextExpiry)\}|\{lastClosing\.period_end\}|\$\{lastClosing\.period_end\}|\$\{closeDate\}/;
    for (const f of files) expect(read(`src/components/${f}`).split("\n").filter((l) => raw.test(l)), f).toEqual([]);
  });
  it("file Excel: ngày và tiêu đề dd/mm/yyyy, tên file dd-mm-yyyy", () => {
    const exp = read("src/lib/lab-supplies-export.ts");
    expect(exp).toContain("fmtDate");
    expect(exp).not.toMatch(/ngày \$\{today\}/);
    expect(exp).not.toMatch(/từ \$\{from\} đến/);
    expect(read("src/app/api/lab-supplies/export/route.ts")).toContain("fmtDateFile(");
    expect(read("src/app/api/lab-supplies/report/route.ts")).toContain("fmtDateFile(");
  });
});

describe("điều chỉnh tồn có chỗ làm việc rõ ràng", () => {
  it("tab Kiểm kê & chốt kỳ có mục 2 Điều chỉnh tồn trước mục 3 Chốt kỳ", () => {
    const st = read("src/components/lab-supplies-stocktake.tsx");
    expect(st).toContain("<LabAdjust ");
    expect(st).toContain("<h2>3. Chốt kỳ</h2>");
    expect(st.indexOf("<LabAdjust ")).toBeLessThan(st.indexOf("<h2>3. Chốt kỳ</h2>"));
    const ad = read("src/components/lab-supplies-adjust.tsx");
    expect(ad).toContain("<h2>2. Điều chỉnh tồn</h2>");
    expect(ad).toContain('movement_type: "ADJUST"');
    expect(ad).toContain("lot_id: lotId");
  });
  it("hướng dẫn nói rõ chỗ điều chỉnh", () => {
    const g = read("src/components/lab-supplies-guide.tsx");
    expect(g).toContain("Điều chỉnh tồn");
  });
});

describe("hồi quy QC: ô ngày không bị CSS ẩn nhãn nuốt mất", () => {
  const css = read("src/components/lab-supplies-client.tsx");
  it("quy tắc ẩn nhãn chữ của .ls-f không áp lên vỏ ô ngày (.ls-date là <span> con trực tiếp của label)", () => {
    expect(css).toContain(".lab-supplies .ls-f>span:not(.ls-date){display:none}");
    expect(css).toContain(".lab-supplies .ls-f>span:not(.ls-date){display:block;font-weight:700}");
    expect(css).not.toMatch(/\.ls-f>span\{display:none\}/);
  });
  it("mã vật tư không xuống dòng", () => {
    expect(css).toContain(".lab-supplies .code-pill{white-space:nowrap}");
  });
});

describe("sửa theo kết quả QC", () => {
  it("điều chỉnh tồn: luôn nêu lý do khóa nút, kể cả khi đang có dòng xem trước tồn", () => {
    const a = read("src/components/lab-supplies-adjust.tsx");
    expect(a).toContain('.filter(Boolean).join(" — ")');
    expect(a).toContain("problem && (lotId || quantity) ? problem");
  });
  it('ô "Đổi lô" của phiếu xuất xếp lô theo FEFO (hạn gần nhất trước)', () => {
    expect(read("src/components/lab-supplies-voucher.tsx")).toContain("sortLotsFefo(lotsByItem.get(item.id) || []).filter(");
  });
  it("thông báo ghi phiếu nói số dòng người dùng nhập, kèm số lô ghi sổ khi khác nhau", () => {
    const v = read("src/components/lab-supplies-voucher.tsx");
    expect(v).toContain("${filled.length} dòng${written !== filled.length ?");
    expect(v).toContain("lô ghi sổ");
  });
});
