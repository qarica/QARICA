import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync("src/components/personal-workspace-client.tsx","utf8");
describe("Personal workspace usability guards",()=>{
 it("shows explicit counts for open, completed and all tasks",()=>{
  expect(source).toContain("Chưa hoàn thành ({openCount})");
  expect(source).toContain("Đã hoàn thành ({doneCount})");
  expect(source).toContain("Tất cả ({activeTasks.length})");
 });
 it("supports task details and editing under owner scope",()=>{
  expect(source).toContain('tab === "NOTE" || tab === "TASK"');
  expect(source).toContain("Ghi chú / sửa");
  expect(source).toContain('.eq("owner_user_id", userId)');
 });
 it("asks about reminders and does not silently claim notifications are scheduled",()=>{
  expect(source).toContain("Bạn có muốn đặt nhắc nhở");
  expect(source).toContain("chưa phải thông báo tự động");
  expect(source).toContain("Vui lòng chọn ngày đến hạn khi bật nhắc nhở");
 });
});
