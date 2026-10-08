import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Phát hiện từ review "hoàn thiện HSBA audit": toàn bộ vòng đời finding
// (SEND/ACK/DISPUTE/DECIDE/RESOLVE/ASSIGN_OWNER) và tạo audit đều không ghi
// audit_logs — trong khi 3 RPC tạo/nhân bản/phát hành template cùng nhóm đã
// ghi đầy đủ (bất nhất nội bộ). Nghiêm trọng nhất là DECIDE (TP quyết định
// Giữ nguyên/Miễn lỗi — ảnh hưởng trách nhiệm cá nhân nhân viên) và
// ASSIGN_OWNER (gán "nhân viên vi phạm" dùng tổng hợp báo cáo gửi Phòng Nhân
// sự) không truy vết được ai làm/khi nào nếu làm sai.
describe("HSBA audit — audit_logs cho vòng đời finding/audit/template (trước đây thiếu hoàn toàn)", () => {
  const findingsRoute = read("src/app/api/hsba-audit/findings/[id]/route.ts");
  const auditsRoute = read("src/app/api/hsba-audit/audits/route.ts");
  const templateRoute = read("src/app/api/hsba-audit/checklist-templates/[id]/route.ts");

  it("mọi action chuyển trạng thái finding (SEND/ACK/DISPUTE/DECIDE/RESOLVE) đều ghi audit_logs", () => {
    expect(findingsRoute).toContain("action_type: `HSBA_FINDING_${action}`");
    expect(findingsRoute).toContain("Đã lưu nhưng không ghi được audit trail");
  });

  it("ASSIGN_OWNER (gán nhân viên phụ trách/vi phạm) ghi riêng audit_logs kèm giá trị cũ/mới", () => {
    expect(findingsRoute).toContain('action_type: "HSBA_FINDING_ASSIGN_OWNER"');
    expect(findingsRoute).toContain("old_value: { owner_user_id: before?.owner_user_id ?? null }");
  });

  it("tạo lượt kiểm tra (audits POST) ghi audit_logs — kể cả khi có tự tạo finding kèm theo", () => {
    expect(auditsRoute).toContain('action_type: "HSBA_AUDIT_CREATE"');
    expect(auditsRoute).toContain("findings_created:");
  });

  it("sửa template (PATCH đổi tên/mô tả/ngừng dùng) ghi audit_logs, nhất quán với 3 RPC tạo/nhân bản/phát hành cùng nhóm", () => {
    expect(templateRoute).toContain('action_type: "HSBA_CHECKLIST_TEMPLATE_UPDATE"');
  });

  it("mọi audit_logs.insert mới đều kiểm tra lỗi (không fire-and-forget)", () => {
    for (const route of [findingsRoute, auditsRoute, templateRoute]) {
      expect(route).toMatch(/const \{ error: audit(Log)?Error \} = await admin\.from\("audit_logs"\)\.insert/);
    }
  });
});

// Phát hiện Trung bình: xuất CSV bỏ cột "Không áp dụng" (NA) — với
// PHAC_DO_DIEU_TRI/QTKT_NOI_TRU (4 mức kết quả), tổng 3 cột Đạt/Đạt 1
// phần/Không đạt không khớp tổng số tiêu chí đã chấm của lượt kiểm có NA.
describe("HSBA audit — xuất CSV có cột riêng đếm tiêu chí Không áp dụng (NA)", () => {
  const exportRoute = read("src/app/api/hsba-audit/audits/export/route.ts");

  it("đếm NA riêng, không gộp vào Đạt/Đạt 1 phần/Không đạt", () => {
    expect(exportRoute).toContain("const naCountByAudit = new Map<string, number>();");
    expect(exportRoute).toContain('r.result === "NA" ? naCountByAudit : null');
  });

  it("thêm cột 'Số tiêu chí không áp dụng' vào header và từng dòng xuất", () => {
    expect(exportRoute).toContain('"Số tiêu chí không áp dụng"');
    expect(exportRoute).toContain("naCountByAudit.get(a.id) || 0");
  });
});
