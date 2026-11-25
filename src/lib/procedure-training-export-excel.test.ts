import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { formatCheckInTime } from "./procedure-training-check-in-time";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// "Bổ sung xuất excel kết quả test nữa nha" — route xuất Excel danh sách
// nhân sự + điểm từng đợt + Đạt/Không đạt cho 1 đợt đào tạo. Cùng mẫu
// HTML-table-as-.xls đã dùng ở api/plans/[id]/export/excel và
// api/emr/items/export (không cần thư viện sinh file nhị phân riêng) —
// chỉ đọc (permission .view), tenant-scoped qua organization_id, và dùng
// CHÍNH computePassStatus dùng chung với UI (src/lib/procedure-training-
// pass-status.ts) để không lệch với màn hình (CLAUDE.md nguyên tắc 2, 5).
describe("Xuất Excel kết quả test đợt đào tạo", () => {
  it("computePassStatus được tách ra lib dùng chung (không định nghĩa riêng ở client và route export)", () => {
    const lib = read("src/lib/procedure-training-pass-status.ts");
    expect(lib).toContain("export function computePassStatus(");

    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain('import { computePassStatus } from "@/lib/procedure-training-pass-status"');
    expect(client).not.toContain("function computePassStatus(");

    const route = read("src/app/api/procedure-trainings/[id]/export/excel/route.ts");
    expect(route).toContain('import { computePassStatus } from "@/lib/procedure-training-pass-status"');
    expect(route).not.toContain("function computePassStatus(");
  });

  it("route GET /api/procedure-trainings/[id]/export/excel: chỉ permission .view, tenant-scoped, trả HTML-table-as-.xls", () => {
    const route = read("src/app/api/procedure-trainings/[id]/export/excel/route.ts");
    expect(route).toContain('requireApiPermission("procedure_training.view")');
    expect(route).not.toContain("procedure_training.manage");
    expect(route).toContain('.eq("organization_id", organizationId)');
    expect(route).toContain("application/vnd.ms-excel");
    expect(route).toContain('filename="${safe}.xls"');
  });

  it("route export dùng đúng cột: Họ tên, Mã NV, Đơn vị, Chức danh, Đã điểm danh, từng đợt kiểm tra, và Kết quả khi có pass_threshold", () => {
    const route = read("src/app/api/procedure-trainings/[id]/export/excel/route.ts");
    expect(route).toContain("<th>Họ tên</th>");
    expect(route).toContain("<th>Mã NV</th>");
    expect(route).toContain("<th>Đơn vị</th>");
    expect(route).toContain("<th>Chức danh</th>");
    expect(route).toContain("<th>Đã điểm danh</th>");
    expect(route).toContain("const showPassColumn = training.pass_threshold != null && rounds.length > 0;");
    expect(route).toContain('computePassStatus(myResults, rounds, training.pass_threshold, a.attended)');
  });

  // "Thêm cột giờ quét QR vào file Excel" — checked_in_at do route điểm danh QR ghi (xem
  // /api/public/training-attendance); người điểm danh thủ công/nhập file không có giờ quét.
  it("route export có cột Giờ quét QR ngay sau Đã điểm danh (trước các cột đợt kiểm tra), lấy từ checked_in_at, colCount khớp 7 cột cố định", () => {
    const route = read("src/app/api/procedure-trainings/[id]/export/excel/route.ts");
    expect(route).toContain(".select(\"id,employee_name,employee_code,department,job_title,attended,checked_in_at\")");
    expect(route).toContain("<th>Đã điểm danh</th><th>Giờ quét QR</th>${roundHeaders}");
    expect(route).toContain('<td>${a.attended ? "Có" : "Không"}</td><td>${esc(formatCheckInTime(a.checked_in_at))}</td>${roundCells}');
    expect(route).toContain("const colCount = 7 + rounds.length");
    // số ô mỗi dòng dữ liệu = số tiêu đề cột (7 cố định: STT..Giờ quét QR) — không lệch cột.
    const headerCells = (route.match(/<th>(STT|Họ tên|Mã NV|Đơn vị|Chức danh|Đã điểm danh|Giờ quét QR)<\/th>/g) || []).length;
    expect(headerCells).toBe(7);
  });

  it("formatCheckInTime: đổi UTC sang GIỜ VIỆT NAM (kể cả qua nửa đêm), rỗng/sai định dạng → —", () => {
    expect(formatCheckInTime("2026-11-25T05:42:00Z")).toBe("25/11/2026 12:42");
    expect(formatCheckInTime("2026-11-24T17:30:00Z")).toBe("25/11/2026 00:30"); // qua nửa đêm: sang NGÀY hôm sau
    expect(formatCheckInTime("2026-12-31T16:59:00Z")).toBe("31/12/2026 23:59");
    expect(formatCheckInTime("2026-12-31T17:00:00Z")).toBe("01/01/2027 00:00"); // qua năm
    expect(formatCheckInTime("2026-11-25T05:42:00+00:00")).toBe("25/11/2026 12:42"); // dạng timestamptz của Postgres
    expect(formatCheckInTime(null)).toBe("—");
    expect(formatCheckInTime(undefined)).toBe("—");
    expect(formatCheckInTime("")).toBe("—");
    expect(formatCheckInTime("không phải ngày")).toBe("—");
  });

  it("UI tab Nhân sự & điểm có nút Xuất Excel trỏ đúng route export", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain("Xuất Excel");
    expect(client).toContain("href={`/api/procedure-trainings/${trainingId}/export/excel`}");
  });
});
