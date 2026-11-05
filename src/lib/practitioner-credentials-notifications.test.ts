import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Rà soát nghiệp vụ: license_expiry_date chỉ tô màu trên bảng, không có cảnh
// báo chủ động nào trước khi ship cái này — người quản lý phải tự mở app mới
// biết GPHN/CCHN sắp/đã hết hạn. Gấp vào đúng pipeline notification chung
// (cùng cách physician_license đã làm), không tạo cơ chế riêng.
describe("Cảnh báo hết hạn GPHN/CCHN (practitioner_credentials.license_expiry_date) qua pipeline notification chung", () => {
  it("syncPractitionerCredentialExpiryRemindersForUser chỉ chạy cho người có practitioner_credentials.manage, lọc theo organization_id, ngưỡng 60 ngày", () => {
    const shared = read("src/lib/notification-sync.ts");
    expect(shared).toContain("export async function syncPractitionerCredentialExpiryRemindersForUser(admin: AdminClient, userId: string) {");
    expect(shared).toContain('userHasPermission(admin, userId, "practitioner_credentials.manage")');
    expect(shared).toContain('.eq("organization_id", profile.organization_id)');
    expect(shared).toContain('attentionPhaseFor(row.license_expiry_date, today, 60)');
    expect(shared).toContain('target_route: "/practitioner-credentials"');
  });

  it("đã đăng ký vào notification-orchestrator để chạy cùng mọi job khác mỗi lần /api/notifications/sync được gọi", () => {
    const orchestrator = read("src/lib/notification-orchestrator.ts");
    expect(orchestrator).toContain("syncPractitionerCredentialExpiryRemindersForUser");
    expect(orchestrator).toContain('["practitioner_credentials", () => syncPractitionerCredentialExpiryRemindersForUser(admin, userId)]');
  });
});
