import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("Dev TB/Thấp batch", () => {
  it("CLAUDE.md's styled-jsx gotcha matches the real fix applied (dropped styled-jsx entirely, not inline style)", () => {
    const claudeMd = read("CLAUDE.md");
    expect(claudeMd).toContain("bỏ hẳn `<style jsx>`, chuyển sang thẻ `<style>` thường");
    expect(claudeMd).toContain("emr-command-center-style-scoping.test.ts");
    expect(claudeMd).not.toContain("inline `style={{...}}` thay vì trông chờ vào CSS scoped, hoặc chuyển hẳn sang class CSS\n  global.");
  });

  it("CLAUDE.md documents that SYSTEM_ADMIN bootstrap migrations are historical and must not be edited, with the real audit/revoke path pointed at /admin/users", () => {
    const claudeMd = read("CLAUDE.md");
    expect(claudeMd).toContain("Không bootstrap SYSTEM_ADMIN bằng cách hard-code email vào migration mới");
    expect(claudeMd).toContain("KHÔNG sửa lại, migration không được chỉnh sau khi đã chạy");
    expect(claudeMd).toContain("src/app/api/admin/users/[id]/route.ts");
  });

  it("the EXTERNAL_ASSESSMENT source label no longer hardcodes a stale inspection year", () => {
    const spec = read("src/lib/module-operating-spec.ts");
    expect(spec).not.toContain("Kết quả kiểm tra SYT 2025");
    expect(spec).toContain('"Kết quả kiểm tra SYT"');
  });
});
