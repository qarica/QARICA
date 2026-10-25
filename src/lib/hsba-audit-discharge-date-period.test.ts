import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Audit HSBA (Hồ sơ bệnh án): kỳ báo cáo (period) phải tính theo tháng hồ sơ
// RA VIỆN, không phải tháng thực hiện audit (audit thường làm sau khi bệnh
// nhân đã ra viện, có thể rơi sang tháng sau — nếu không tính theo tháng ra
// viện, báo cáo tháng sẽ sai). discharge_date chỉ là mốc ngày — không phải
// nội dung lâm sàng — giữ đúng nguyên tắc record_reference/discharge_date chỉ
// để tra cứu lại HIS, không trở thành nguồn dữ liệu bệnh nhân thứ hai.
describe("HSBA audit: period suy ra từ discharge_date (1 nguồn sự thật), Phác đồ/QTKT không đổi", () => {
  it("migration thêm cột discharge_date (date, nullable) vào hsba_audits", () => {
    const source = read("supabase/migrations/20261114000000_hsba_audit_discharge_date_v1.sql");
    expect(source).toContain("alter table public.hsba_audits add column if not exists discharge_date date;");
  });

  it("API: HSBA bắt buộc discharge_date hợp lệ, period luôn suy ra từ discharge_date (không nhận period client gửi)", () => {
    const source = read("src/app/api/hsba-audit/audits/route.ts");
    expect(source).toContain('if (auditType === "HSBA") {');
    expect(source).toContain("Chưa nhập ngày ra viện hợp lệ.");
    expect(source).toContain("Ngày ra viện không được ở tương lai.");
    expect(source).toContain("period = dischargeDateRaw.slice(0, 7);");
    expect(source).toContain('period = String(body.period || "").trim();');
  });

  it("API: discharge_date được lưu và trả về trong SELECT của GET/POST", () => {
    const source = read("src/app/api/hsba-audit/audits/route.ts");
    expect(source).toContain("id,department_id,record_reference,period,discharge_date,audited_by,audited_at,overall_result,status,audit_type,checklist_version_id");
    expect(source).toContain("discharge_date: dischargeDate,");
  });

  it("UI: form HSBA hiện ô ngày ra viện thay cho ô chọn tháng tay, Phác đồ/QTKT vẫn dùng ô chọn tháng cũ", () => {
    const source = read("src/components/hsba-audit-overview-client.tsx");
    expect(source).toContain('auditType === "HSBA" ? dischargeDate.slice(0, 7) : period');
    expect(source).toContain('<input className="input" type="date" aria-label="Ngày ra viện"');
    expect(source).toContain('<input className="input" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />');
  });

  it("UI: không submit được khi HSBA chưa nhập ngày ra viện, body POST gửi discharge_date", () => {
    const source = read("src/components/hsba-audit-overview-client.tsx");
    expect(source).toContain('if (auditType === "HSBA" && !dischargeDate) {');
    expect(source).toContain("Chưa nhập ngày ra viện.");
    expect(source).toContain('discharge_date: auditType === "HSBA" ? dischargeDate : null,');
  });
});
