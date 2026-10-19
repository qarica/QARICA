import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Phát hiện từ rà soát UI/UX: checkbox "Có cần nhắc nhở việc này không?" ở
// form Tạo việc cá nhân (Không gian riêng, tab === "TASK") đặt trần trong
// .pw-reminder-choice mà không có override input{width:auto;min-height:0}
// — CSS mặc định toàn cục input{width:100%;min-height:40px} áp luôn vào
// checkbox này, làm nó to bất thường. Cùng lớp lỗi đã sửa cho
// work-row-checkbox.tsx (task #27).
describe("Personal Workspace — checkbox \"Có cần nhắc nhở việc này không?\" không còn to bất thường", () => {
  const source = readFileSync("src/components/personal-workspace-client.tsx", "utf8");

  it(".pw-reminder-choice có override kích thước cho input", () => {
    expect(source).toContain(".pw-reminder-choice input { width:auto; min-height:0; }");
  });
});
