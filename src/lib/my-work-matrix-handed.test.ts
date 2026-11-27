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

describe("hộp chuyển việc: lựa chọn gõ tên tự do chỉ hiện sau khi danh sách người đã tải xong", () => {
  it("điều kiện list !== null", () => {
    expect(read("src/components/work-reassign-button.tsx")).toContain('source !== "WORK_PLAN" && list !== null && q.trim().length >= 2');
  });
});

describe("Việc của tôi đồng bộ việc giao từ module Công văn đến", () => {
  const page = read("src/app/(app)/tasks/page.tsx");
  it("đọc trực tiếp incoming_document_tasks theo Chủ trì hoặc Phối hợp, không sao chép sang bảng khác", () => {
    expect(page).toContain('from("incoming_document_tasks")');
    expect(page).toContain("lead_user_id.eq.${user.id},collaborating_user_ids.cs.{${user.id}}");
    expect(page).not.toMatch(/insert\(.*incoming_document/);
  });
  it("hàng có nhãn Chủ trì/Phối hợp, hạn lấy từ việc (dự phòng hạn công văn), gộp vào danh sách việc được giao", () => {
    expect(page).toContain('`Công văn đến · ${t.lead_user_id===user.id?"Chủ trì":"Phối hợp"}`');
    expect(page).toContain("const dueDate=t.due_date||doc?.due_date||null;");
    expect(page).toContain("...unifiedWorkPlanRows,...unifiedIncomingRows]");
  });
  it("liên kết về /incoming-documents khi có quyền xem công văn", () => {
    expect(page).toContain('href:canOpenIncoming?"/incoming-documents":"/tasks"');
  });
});

describe("Nút Chờ phản hồi rõ chức năng: hộp thoại có giải thích, ngày hỏi lại có tác dụng", () => {
  const c = read("src/components/work-followup-control.tsx");
  it("không dùng hộp nhập của trình duyệt; có giải thích, ô ngày dd/mm/yyyy, nhãn Cần hỏi lại, nút Đã có phản hồi", () => {
    expect(c).not.toContain("window.prompt");
    expect(c).toContain("chờ người khác trả lời");
    expect(c).toContain("VnDateInput");
    expect(c).toContain("Cần hỏi lại");
    expect(c).toContain("Đã có phản hồi");
  });
});

describe("Chờ phản hồi cho việc cá nhân + nhắc đến hạn hỏi lại", () => {
  it("migration thêm nguồn REMINDER vào work_followups; API chỉ cho chủ việc đang mở", () => {
    const m = read("supabase/migrations/20261202000011_work_followup_reminder_source_v1.sql");
    expect(m).toContain("check (source_type in ('ACTION','EMR','RECORD','OTHER','REMINDER'))");
    const api = read("src/app/api/work/followups/route.ts");
    expect(api).toContain('"REMINDER"]');
    expect(api).toContain('.eq("owner_user_id",auth.user.id).eq("status","OPEN")');
  });
  it("việc cá nhân có nút Chờ phản hồi trong menu ⋯ và nhãn Đang chờ ở cột trạng thái; ghi chú tách khỏi trạng thái chờ", () => {
    const page = read("src/app/(app)/tasks/page.tsx");
    expect(page).toContain('sourceType:"REMINDER",followup:followupBySource.get("REMINDER:"+p.id)??null,noteText:p.note??null');
    expect(page).toContain("{reassignBtn(r)}{waitCtl(r)}</UnifiedPersonalTaskActions>");
    expect(page).toContain("{waitBadge(r)}");
  });
  it("nhắc 'Đến hạn hỏi lại' đăng ký ở bộ điều phối và cron, mỗi hẹn một lần", () => {
    const sync = read("src/lib/notification-sync.ts");
    expect(sync).toContain("export async function syncWorkFollowupDueForUser(");
    expect(sync).toContain("`work_followup_due:${f.id}:${String(f.follow_up_at)}`");
    expect(read("src/lib/notification-orchestrator.ts")).toContain("syncWorkFollowupDueForUser(admin, userId)");
    expect(read("src/app/api/cron/sync-notifications/route.ts")).toContain("syncWorkFollowupDueForUser(admin, userId)");
  });
});

describe("Hoàn tất việc công văn ngay trong Việc của tôi", () => {
  it("API chỉ cho Chủ trì/Phối hợp của chính việc đó, ghi vào incoming_document_tasks và nhật ký", () => {
    const api = read("src/app/api/work/incoming-task/route.ts");
    expect(api).toContain('requireApiContext("tasks.view")');
    expect(api).toContain("task.lead_user_id === auth.user.id || (task.collaborating_user_ids ?? []).includes(auth.user.id)");
    expect(api).toContain('from("incoming_document_tasks")');
    expect(api).toContain("INCOMING_TASK_COMPLETE_FROM_MY_WORK");
    expect(api).toContain("task.organization_id === organizationId");
  });
  it("hàng công văn có nút Hoàn tất/Mở lại ở cả bảng và thẻ điện thoại", () => {
    const page = read("src/app/(app)/tasks/page.tsx");
    expect(page).toContain('r.source==="incoming_task"&&r.sourceId?<IncomingTaskCompleteButton');
    expect((page.match(/<>\{incomingBtn\(r\)\}\{reassignBtn\(r\)\}<\/>/g) || []).length).toBe(2);
  });
});
