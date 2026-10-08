import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Phát hiện (báo cáo thực tế: "Gantt khoa phòng chỉ xem được nửa bảng" / "Ko
// phải lỗi cuộn ngang vì đang bị cứng chỉ xem được 1 nửa"): CalendarModuleLayout
// bọc mọi trang con (Lịch tổng hợp/Gantt tiến độ/Bộ lịch nền/Công việc định
// kỳ/Việc của tôi) trong `.calendar-module-shell{display:grid}`. Mỗi trang con
// lại tự canh giữa bằng `max-width:...px;margin:0 auto` (hoặc inline style
// tương đương) nhưng KHÔNG khai báo width — theo đúng đặc tả CSS Grid, một
// grid item có margin ngang là "auto" sẽ KHÔNG tự giãn (stretch) theo track,
// mà co theo max-content của chính nó. Vì `.gantt-grid{min-width:1100px}`
// (Gantt) nằm sâu bên trong, toàn bộ trang bị kéo rộng ra ngoài viewport trên
// mobile — bị `html,body{overflow-x:hidden}` cắt cụt luôn, không có cách nào
// cuộn để xem phần còn lại (xác nhận bằng cách dựng lại đúng cấu trúc
// DOM/CSS này và đo trong Chromium ở viewport 390px: trước khi sửa
// document.body.scrollWidth=1128 dù window.innerWidth=390).
//
// Sửa 2 lớp: (1) ép track của chính `.calendar-module-shell` không bao giờ
// giãn theo nội dung con (grid-template-columns:minmax(0,1fr) thay vì "auto"
// ngầm định) — bảo vệ luôn những trang con không tự canh giữa (vd Việc của
// tôi); (2) mỗi trang tự canh giữa phải có width:100% rõ ràng để margin:auto
// không còn vô hiệu hoá việc giãn theo track.
describe("Lịch QLCL (CalendarModuleLayout) — trang con không còn tràn ngang trên mobile", () => {
  it("calendar-module-shell ép track không giãn theo nội dung con (minmax(0,1fr), không phải 'auto' ngầm định)", () => {
    const layout = read("src/app/(app)/calendar/layout.tsx");
    expect(layout).toContain(".calendar-module-shell{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}");
  });

  it("mỗi trang con tự canh giữa bằng max-width/margin:auto đều có width:100% rõ ràng", () => {
    expect(read("src/app/(app)/calendar/gantt/page.tsx")).toContain(".quality-gantt-page{width:100%;max-width:1600px;margin:0 auto;gap:14px!important}");
    expect(read("src/app/(app)/calendar/page.tsx")).toContain(".quality-calendar-page{width:100%;max-width:1500px;margin:0 auto;gap:14px!important}");
    expect(read("src/app/(app)/calendar/blueprint/page.tsx")).toContain(".calendar-blueprint-page{width:100%;max-width:1450px;margin:0 auto;gap:14px!important}");
    expect(read("src/app/(app)/calendar/recurring/page.tsx")).toContain('style={{ width: "100%", maxWidth: 1360, margin: "0 auto" }}');
  });
});
