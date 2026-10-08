import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Yêu cầu tường minh: Bảng kiểm QTKT nội trú và Phác đồ điều trị cần (1) phân
// nhóm tiêu chí tự khai báo (đã có sẵn qua field "category" — chỉ cần hiển
// thị nhóm khi chấm), và (2) 4 mức đánh giá Đạt/Đạt 1 phần/Không đạt/Không áp
// dụng thay vì chỉ Đạt/Không đạt. "Bảng kiểm thường quy Hồ sơ bệnh án (HSBA)
// chưa đụng" — HSBA phải giữ nguyên đúng 2 mức và luồng tạo lỗi gửi khoa.
describe("HSBA-audit overview: Phác đồ/QTKT có 4 mức đánh giá + phân nhóm, HSBA không đổi", () => {
  const client = read("src/components/hsba-audit-overview-client.tsx");
  const route = read("src/app/api/hsba-audit/audits/route.ts");

  it("chỉ audit_type khác HSBA mới hiện 2 nút bổ sung Đạt 1 phần / Không áp dụng", () => {
    expect(client).toContain('const supportsPartialAndNa = auditType !== "HSBA";');
    expect(client).toContain("supportsPartialAndNa ?");
    expect(client).toContain("Đạt 1 phần");
    expect(client).toContain("Không áp dụng");
  });

  it("HSBA vẫn chỉ có đúng 2 nút Đạt/Chưa đạt luôn hiện không điều kiện (không bọc trong supportsPartialAndNa)", () => {
    const toggleStart = client.indexOf('<div className="hsba-result-toggle">');
    const toggleBlock = client.slice(toggleStart, client.indexOf("</div>", toggleStart));
    expect(toggleBlock).toContain('onClick={() => setResult(item.id, "PASS")}');
    expect(toggleBlock).toContain('onClick={() => setResult(item.id, "FAIL")}');
    expect(toggleBlock.indexOf('onClick={() => setResult(item.id, "PASS")}')).toBeLessThan(toggleBlock.indexOf("{supportsPartialAndNa ?"));
  });

  it("tiêu chí được nhóm theo category tự khai báo, không hardcode tên nhóm, và không hiện tiêu đề nhóm khi chưa ai khai category", () => {
    expect(client).toContain("const groupedItems = (()");
    expect(client).toContain("const showCategoryGroups = groupedItems.length > 1 || (groupedItems.length === 1 && groupedItems[0].category !== null);");
    expect(client).not.toContain('"Lâm sàng"');
    expect(client).not.toContain('"Cận lâm sàng"');
  });

  it("backend: HSBA vẫn chỉ nhận PASS/FAIL (coalesce như cũ); Phác đồ/QTKT nhận cả PARTIAL/NA", () => {
    expect(route).toContain('auditType === "HSBA" ? (r.result === "FAIL" ? "FAIL" : "PASS") : (EXTRA_RESULTS.has(r.result) ? r.result : "PASS")');
  });

  it("overall_result tổng hợp 3 mức: FAIL > PARTIAL > PASS", () => {
    expect(route).toContain('normalizedResults.some((r) => r.result === "FAIL") ? "FAIL" : normalizedResults.some((r) => r.result === "PARTIAL") ? "PARTIAL" : "PASS"');
  });

  it("đã nới check constraint DB cho result/overall_result qua migration mới, không sửa migration cũ", () => {
    const migration = read("supabase/migrations/20261027_hsba_audit_partial_na_result_v1.sql");
    expect(migration).toContain("check (result in ('PASS','FAIL','PARTIAL','NA'))");
    expect(migration).toContain("check (overall_result in ('PENDING','PASS','FAIL','PARTIAL'))");
  });

  it("chỉ tạo lỗi gửi khoa cho HSBA như cũ — Phác đồ/QTKT vẫn không tạo finding", () => {
    expect(route).toContain('if (auditType === "HSBA" && failedResults.length)');
  });
});

describe("HSBA-audit: gán nhân viên phụ trách (owner_user_id) có UI + chặn tự gán ké qua ACK/DISPUTE", () => {
  const findingRoute = read("src/app/api/hsba-audit/findings/[id]/route.ts");
  const client = read("src/components/hsba-audit-overview-client.tsx");

  it("có action ASSIGN_OWNER riêng, yêu cầu hsba_audit.manage, không cần đổi status", () => {
    expect(findingRoute).toContain('if (action === "ASSIGN_OWNER")');
    expect(findingRoute).toContain('"Chỉ người quản lý mới được gán nhân viên phụ trách."');
  });

  it("owner_user_id không còn bị set 'ké' qua body của action chuyển trạng thái khác (ACK/DISPUTE...)", () => {
    expect(findingRoute).not.toContain('if (body.owner_user_id !== undefined) update.owner_user_id = body.owner_user_id || null;');
  });

  it("owner_user_id được validate thuộc đúng tổ chức trước khi gán", () => {
    expect(findingRoute).toContain('.eq("organization_id", organizationId).eq("is_active", true).maybeSingle();');
  });

  it("UI overview gọi đúng action ASSIGN_OWNER khi đổi dropdown phụ trách", () => {
    expect(client).toContain('action: "ASSIGN_OWNER", owner_user_id: ownerUserId || null');
  });

  it("route department-staff yêu cầu hsba_audit.manage (không phải view)", () => {
    const staffRoute = read("src/app/api/hsba-audit/department-staff/route.ts");
    expect(staffRoute).toContain('requireApiPermission("hsba_audit.manage")');
  });
});

describe("HSBA report: 'Nhân viên vi phạm lặp lại' hiện tên thay vì UUID thô", () => {
  const page = read("src/app/(app)/hsba-audit/report/page.tsx");
  it("resolve owner_user_id sang full_name/email qua bảng profiles", () => {
    expect(page).toContain('const ownerName = new Map((ownersRes.data ?? []).map((p: any) => [p.user_id, p.full_name || p.email || p.user_id]));');
    expect(page).toContain("{ownerName.get(userId) || userId}");
  });
  it("tiêu đề cột không còn ghi 'Mã người dùng' (gây hiểu lầm vì giờ hiện tên)", () => {
    expect(page).not.toContain("Mã người dùng");
  });
});
