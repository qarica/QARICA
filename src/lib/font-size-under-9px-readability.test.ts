import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Rà soát cỡ chữ toàn app: tìm thấy vài chỗ dưới 9px chứa nội dung thật
// (không phải icon/badge trang trí) — khó đọc kể cả trên máy tính, không
// chỉ điện thoại. Nâng tối thiểu lên 9-10px, khớp thang .tiny/.subline/
// .code-pill (9-10px) đã có trong globals.css. Không đổi toàn bộ hệ thống
// cỡ chữ (phạm vi rộng hơn, để sau).
describe("Các chỗ chữ dưới 9px đã phát hiện qua rà soát toàn app — không lùi lại mức cũ", () => {
  it("calendar/page.tsx: tên ngày nghỉ và nhãn thứ trong lịch mini không còn dưới 9px", () => {
    const source = read("src/app/(app)/calendar/page.tsx");
    expect(source).not.toContain("calendar-mini-weekday{text-align:center;font-size:8px");
    expect(source).not.toContain("calendar-holiday-name{font-size:8.5px");
    expect(source).toContain("calendar-mini-weekday{text-align:center;font-size:9px");
    expect(source).toContain("calendar-holiday-name{font-size:10px");
  });

  it("risks/page.tsx: giá trị phụ trong ô ma trận rủi ro không còn 8px", () => {
    const source = read("src/app/(app)/risks/page.tsx");
    expect(source).not.toContain(".risk-cell small{font-size:8px");
    expect(source).toContain(".risk-cell small{font-size:10px");
  });

  it("calendar/gantt/page.tsx: nhãn trên thanh Gantt không còn 8px", () => {
    const source = read("src/app/(app)/calendar/gantt/page.tsx");
    expect(source).not.toContain("color:#fff;font-size:8px;font-weight:800");
  });

  it("monitoring/[id]/page.tsx: eyebrow/scope-note trong info panel (không phải vùng in ấn) không còn dưới 9px", () => {
    const source = read("src/app/(app)/monitoring/[id]/page.tsx");
    expect(source).not.toContain(".monitoring-info-panel .eyebrow{font-size:7.5px");
    expect(source).not.toContain(".monitoring-info-panel .scope-note{padding:4px 6px!important;margin-top:5px!important;font-size:8px!important}");
    expect(source).toContain(".monitoring-info-panel .eyebrow{font-size:9px!important}");
    expect(source).toContain(".monitoring-info-panel .scope-note{padding:4px 6px!important;margin-top:5px!important;font-size:10px!important}");
  });

  it("emr-command-center.tsx: pill trạng thái và ghi chú action-list không còn 8px", () => {
    const source = read("src/components/emr-command-center.tsx");
    expect(source).not.toContain(".pill{padding:3px 6px;border-radius:99px;font-size:8px}");
    expect(source).not.toContain(".action-list small{font-size:8px");
  });
});
