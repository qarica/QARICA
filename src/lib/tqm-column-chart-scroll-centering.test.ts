import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Báo cáo thực tế (kèm ảnh chụp màn hình): "Lỗi thanh trượt bên trái" — khi
// biểu đồ cột (TqmColumnBars/TqmGroupedBars) rộng hơn khung chứa, phần cột
// bên trái bị kẹt, không cuộn tới được dù còn dữ liệu.
//
// Nguyên nhân: container dùng `display:flex;justify-content:center` để
// canh giữa biểu đồ khi hẹp hơn panel (yêu cầu trước đó). Đây là 1 lỗi CSS
// kinh điển — khi nội dung flex rộng hơn container và bị tràn, trình duyệt
// tính overflow ĐỐI XỨNG 2 bên quanh tâm, nhưng vùng cuộn (scrollWidth) chỉ
// tính phần tràn bên PHẢI; phần tràn bên trái không có cách nào cuộn tới vì
// scrollLeft không thể âm — người dùng thấy thanh trượt ngắn, kéo hết cỡ
// sang trái vẫn còn cột bị cắt mất.
//
// Sửa: bỏ flex + justify-content:center, dùng `margin:0 auto` ngay trên
// <svg> — khi svg hẹp hơn container thì margin auto canh giữa bình thường
// (giữ đúng yêu cầu cũ); khi svg RỘNG hơn container thì trình duyệt tự kẹp
// margin auto về 0 (neo trái, y hệt không canh giữa), cuộn ngang bình
// thường từ đầu tới cuối — không còn phần nào bị kẹt ngoài tầm cuộn.
describe("TqmColumnBars/TqmGroupedBars: canh giữa khi hẹp nhưng không kẹt nội dung khi tràn (scroll ngang)", () => {
  const css = readFileSync("src/components/tqm-charts.tsx", "utf8");

  it("KHÔNG còn dùng display:flex;justify-content:center trên container cuộn ngang (gây kẹt nội dung bên trái khi tràn)", () => {
    expect(css).not.toContain(".tqm-grouped-bars-scroll{overflow-x:auto;display:flex;justify-content:center}");
    expect(css).not.toContain(".tqm-col-bars-scroll{overflow-x:auto;display:flex;justify-content:center}");
  });

  it("dùng margin:0 auto trên svg — canh giữa khi vừa khung, tự neo trái + cuộn được hết khi tràn", () => {
    expect(css).toContain(".tqm-grouped-bars-scroll{overflow-x:auto}.tqm-grouped-bars-scroll svg{display:block;margin:0 auto}");
    expect(css).toContain(".tqm-col-bars-scroll{overflow-x:auto}.tqm-col-bars-scroll svg{display:block;margin:0 auto}");
  });
});
