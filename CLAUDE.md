# QARICA — hướng dẫn cho Claude Code

## Tổng quan
QARICA là hệ thống quản lý chất lượng bệnh viện (QLCL) đa tổ chức, đa năm, có module EMR
theo dõi tiến độ triển khai bệnh án điện tử. Next.js (App Router) + Supabase (Postgres +
Storage). Không phải phần mềm lâm sàng trực tiếp thao tác hồ sơ bệnh nhân — `emr_rollout_items`
là bảng theo dõi *dự án triển khai EMR* (hạng mục, tiến độ, Go-live gate), không phải dữ liệu
lâm sàng.

## Nguyên tắc kiến trúc bắt buộc

1. **Không hard-code theo một tổ chức/năm cụ thể.** QARICA phải generic + multi-year +
   multi-organization + configurable. Danh mục cố định (như 8 danh mục EMR trong
   `src/lib/emr-categories.ts`) là cấu trúc nghiệp vụ chung, không phải dữ liệu của một
   bệnh viện/năm. Những gì thay đổi theo tổ chức/năm phải là configuration/master data,
   không phải code.

2. **Một nghiệp vụ chỉ có một nguồn sự thật.** Trước khi coi một thao tác xóa/thay đổi là
   hoàn tất, phải truy hết các bảng/view phụ thuộc liên quan (dashboard, task, lịch,
   notification) — không được để một đối tượng "đã xóa" ở bảng chính nhưng vẫn còn tồn tại
   ở nơi khác. Bảng prototype cũ đã bị thu hồi quyền truy cập
   (`supabase/migrations/20260926_emr_legacy_quarantine_v1.sql`) chính là ví dụ áp dụng
   nguyên tắc này — không tạo thêm bảng EMR song song.

3. **Go-live gate là điều khiển an toàn, không phải cờ trang trí.** `is_go_live_gate`,
   `evidence_url`, `verified_at`, `verified_by` trong `emr_rollout_items` là một bộ nguyên
   tắc: gate chỉ PASS khi `status=DONE` + có `evidence_url` + đã `verified_at/verified_by`.
   KHÔNG được nới lỏng logic này (không tự động verify, không bỏ qua điều kiện DONE+evidence)
   trừ khi được yêu cầu tường minh. Test bảo vệ: `src/lib/emr-security.test.ts`.

4. **Ranh giới quyền `emr.view` / `emr.manage` phải nhất quán ở mọi route** trong
   `src/app/api/emr/**`. Đọc dùng `emr.view`, mọi thao tác ghi (tạo/sửa/xóa/upload file)
   dùng `emr.manage`. Khi thêm route mới, giữ đúng ranh giới này và cập nhật
   `emr-security.test.ts` nếu thêm route.

5. **Kiểm tra nhất quán UI ↔ API ↔ DB trước khi coi một tính năng là xong.** Một field
   xuất hiện trên form không có nghĩa là API xử lý nó (ví dụ đã từng có bug:
   checkbox "xác minh" hiện ra lúc tạo mới nhưng `POST` không xử lý, chỉ `PATCH` xử lý —
   đã sửa bằng cách giới hạn checkbox đó vào chế độ sửa). Khi review, luôn đối chiếu 3 lớp:
   field trong form state → field trong body gửi lên → field được xử lý ở API → field có
   trong SELECT trả về hay không.

## Gotcha kỹ thuật đã gặp (đọc trước khi đụng vào các khu vực này)

- **`emr-command-center.tsx` dùng `<style jsx>` (styled-jsx) nhưng CSS chỉ scope đúng cho
  các phần tử JSX viết trực tiếp trong component chứa `<style jsx>`.** CSS nhắm vào phần tử
  do các helper function con (`Kpi`, `Compliance`, `PanelHead`, `Legend`) render ra **không
  được áp dụng** — vì className scope của styled-jsx không tự động lan qua ranh giới gọi
  hàm/component khác. Nếu cần style chắc chắn áp dụng cho phần tử trong các hàm con, dùng
  inline `style={{...}}` thay vì trông chờ vào CSS scoped, hoặc chuyển hẳn sang class CSS
  global.
- **`eslint.config.mjs` dùng flat config**: object `{ ignores: [...] }` chỉ ignore toàn cục
  khi nó là object độc lập (không có `rules` cùng object). Nếu gộp `ignores` chung với
  `rules`, ignore đó chỉ áp dụng cho chính object rules đó, các config khác (như
  `next/core-web-vitals`) vẫn quét các đường dẫn đó bình thường — dẫn đến `.next/**` bị lint
  sau khi build một lần. Luôn để `{ ignores: [...] }` là phần tử độc lập, đứng đầu mảng config.
- **Không có `.data-table` CSS riêng** — bảng dùng CSS chung `table/th/td` trong
  `globals.css`. Mọi bảng phải bọc trong `<div className="table-wrap">` (không tự thêm nếu
  đã có `.panel` bọc ngoài — `.panel` có `overflow:hidden`, thiếu `.table-wrap` sẽ làm bảng
  bị cắt/bóp cột trên các danh mục có nhiều field).
- **Modal title phải bọc trong `.modal-head`**, không đặt `<h3>`/`<h2>` trực tiếp trong
  `.modal-card` — sẽ dính sát mép do `.modal-card` không có padding riêng.
- **Checkbox dùng class `.inline-check`** (hoặc `.radio-row`/`.check-card`), không để input
  checkbox trần trong `<label>` — CSS mặc định `input,select,textarea{width:100%;min-height:40px}`
  áp dụng luôn cho checkbox, làm nó to bất thường.

## Quy trình bắt buộc trước khi báo "xong"

1. Đọc file gốc / `git diff` trước khi sửa — CHỈ THÊM, KHÔNG GHI ĐÈ, kể cả khi tưởng đơn giản.
2. `npx tsc --noEmit` sạch.
3. `npm run lint` sạch (0 error).
4. `npx vitest run` — toàn bộ pass, đặc biệt `emr-security.test.ts` nếu đụng vào EMR.
5. `npm run build` thành công.
6. Gộp thành 1 commit (giới hạn số lần deploy trên Vercel).
7. Sau khi push, clone độc lập ở một thư mục khác và chạy lại bước 2–5 trên bản clone đó
   trước khi báo hoàn tất — không tin vào working directory cũ.

## Ngoài phạm vi của phiên code

Các vai trò khác (QLCL/RCA/CAPA lâm sàng, phân tích sự cố y khoa, nghiên cứu/thống kê,
soạn công văn/hành chính) không thuộc phạm vi một Claude Code session gắn với repo này.
Những việc đó nên thực hiện ở phiên trò chuyện khác (claude.ai), không mong đợi một coding
session nhớ được ngữ cảnh đó.
