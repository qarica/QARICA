import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { workRowQuadrant } from "./eisenhower";

const read = (p: string) => readFileSync(p, "utf8");

describe("Ma trận Eisenhower trong Việc của tôi", () => {
  it("quan trọng = ưu tiên Cao/Khẩn/Rất khẩn; khẩn cấp = quá hạn hoặc hạn trong 2 ngày tới", () => {
    expect(workRowQuadrant("HIGH", "2026-11-26", "2026-11-27")).toBe("P1"); // quá hạn + quan trọng
    expect(workRowQuadrant("URGENT", "2026-11-29", "2026-11-27")).toBe("P1"); // đúng hạn chót 2 ngày
    expect(workRowQuadrant("CRITICAL", "2026-12-30", "2026-11-27")).toBe("P2"); // quan trọng, chưa gấp
    expect(workRowQuadrant("NORMAL", "2026-11-28", "2026-11-27")).toBe("P3"); // gấp nhưng không quan trọng
    expect(workRowQuadrant("LOW", null, "2026-11-27")).toBe("P4"); // không hạn, không quan trọng
    expect(workRowQuadrant("HIGH", "2026-11-30", "2026-11-27")).toBe("P2"); // hạn xa hơn 2 ngày
  });
  it("trang có chế độ xem 'Ma trận Eisenhower' (view=matrix), chỉ tính việc đang mở, giữ khi chuyển tab/tuần/tháng", () => {
    const page = read("src/app/(app)/tasks/page.tsx");
    expect(page).toContain('Ma trận Eisenhower</Link>');
    expect(page).toContain('view==="matrix"?<MyWorkMatrix rows={kanbanRows} today={today}/>');
    const comp = read("src/components/my-work-matrix.tsx");
    expect(comp).toContain("rows.filter((r) => !r.isDone)");
    expect(page).toContain('const viewParam=view!=="list"?`&view=${view}`:"";');
  });
});

describe("Chuyển việc cho người chưa có tài khoản + xem lại việc đã chuyển", () => {
  it("API nhận to_name (tên tự do), việc vẫn ở người giao, ghi nhật ký WORK_HANDOVER_EXTERNAL", () => {
    const route = read("src/app/api/work/reassign/route.ts");
    expect(route).toContain("body.to_name");
    expect(route).toContain("WORK_HANDOVER_EXTERNAL");
    expect(route).toContain('row.owner_user_id !== p.actorId');
    expect(route).toContain('waiting_for_type: "EXTERNAL_PARTY"');
  });
  it("hộp thoại cho gõ tên và có lựa chọn 'chưa có tài khoản'", () => {
    const c = read("src/components/work-reassign-button.tsx");
    expect(c).toContain("(chưa có tài khoản)");
    expect(c).toContain("{ source, id, to_name: extName, reason }");
  });
  it("tab 'Đã chuyển đi' lấy từ nhật ký của chính người dùng (actor = mình), kèm tình trạng hiện tại", () => {
    const lib = read("src/lib/my-work-handed.ts");
    expect(lib).toContain('.eq("actor_user_id", userId)');
    expect(lib).toContain('"WORK_REASSIGN", "WORK_HANDOVER_EXTERNAL"');
    const page = read("src/app/(app)/tasks/page.tsx");
    expect(page).toContain('["HANDED","Đã chuyển đi","",handed.rows.length]');
    expect(page).toContain('tab==="HANDED"?<MyWorkHanded');
  });
});

describe("hộp chuyển việc: người trong hệ thống xếp TRƯỚC, lựa chọn gõ tên tự do nằm cuối danh sách", () => {
  it("nút 'chưa có tài khoản' nằm sau phần liệt kê người nhận", () => {
    const c = read("src/components/work-reassign-button.tsx");
    expect(c.indexOf("(list || []).map((p)")).toBeGreaterThan(-1);
    expect(c.indexOf("(chưa có tài khoản)</strong>")).toBeGreaterThan(c.indexOf("(list || []).map((p)"));
  });
});

describe("Danh sách Việc của tôi có cột P1–P4 để nhìn nhanh", () => {
  const page = read("src/app/(app)/tasks/page.tsx");
  it("bảng có cột P (badge P1–P4 kèm tooltip), việc đã xong hiện gạch ngang; thẻ điện thoại cũng có badge", () => {
    expect(page).toContain('<th>Ưu tiên</th><th title="Ma trận Eisenhower');
    expect(page).toContain("<td>{pBadge(r)}</td>");
    expect(page).toContain("const q=workRowQuadrant(r.priority,r.dueDate,today)");
    expect(page).toContain("if(r.isDone)return <span");
    expect(page).toContain("{!r.isDone?<>{pBadge(r)}{\" \"}</>:null}");
  });
});
