# EMR Rollout Dashboard — module cho QARICA

Menu theo dõi triển khai EMR chi tiết hơn bản Artifact web trước đó: bám theo
đúng cấu trúc dữ liệu thật trong file dự án EMR (Timeline, danh sách biểu mẫu
theo khoa, quy trình - tài liệu, thiết bị CNTT, thiết bị y tế/PACS-DICOM,
chữ ký số, đào tạo - bàn giao, lỗi/góp ý) — nhưng chạy trên đúng hạ tầng
Next.js + Supabase của QARICA, dùng chung đăng nhập, và lưu dữ liệu lâu dài
thay vì chỉ demo.

## Vì sao không có dữ liệu thật trong module này

File dự án Excel gốc có dữ liệu nội bộ (họ tên nhân sự, mã HR, ghi chú vận
hành...). Đưa thẳng những dữ liệu đó vào mã nguồn rồi đẩy lên GitHub là rủi ro,
đặc biệt nếu repo là public. Vì vậy module này:

- Chỉ có **schema** (cấu trúc bảng) + một ít **dữ liệu mẫu tổng quát** (tên khoa,
  loại biểu mẫu phổ biến theo Thông tư 32/2023/TT-BYT) để bạn xem giao diện.
- Có sẵn **trang Nhập liệu** (`/emr/nhap-lieu`) và **script chuyển đổi**
  (`scripts/export_excel_to_csv.py`) để bạn tự nhập dữ liệu thật từ máy mình
  thẳng vào Supabase — không dữ liệu nào đi qua Claude hay nằm trong Git.
- Bảng chữ ký số **không có cột lưu số CCCD/CMND** — nếu thật sự cần, tự thêm
  cột đó trong Supabase với RLS chặt hơn (không nằm trong phạm vi migration này).

## Về đường dẫn import

Toàn bộ file trong module dùng **đường dẫn tương đối** (`../../lib/emr/...`)
thay vì alias `@/...` — để không phụ thuộc vào việc `tsconfig.json` của
QARICA có khai báo alias `@/*` hay không, và không quan trọng module được đặt
ở gốc repo hay trong `src/`. Chỉ cần 3 thư mục `app/emr`, `components/emr`,
`lib/emr` nằm **cạnh nhau** (cùng cấp) là các import sẽ đúng.

## Cài đặt

1. **Copy thư mục vào repo QARICA**, giữ nguyên cấu trúc:
   ```
   app/emr/**            -> app/emr/**
   components/emr/**     -> components/emr/**
   lib/emr/**            -> lib/emr/**
   scripts/**            -> scripts/**
   supabase/migrations/** -> supabase/migrations/**  (hoặc đúng thư mục migration bạn đang dùng)
   ```

2. **Cài dependency** (nếu repo chưa có sẵn):
   ```bash
   npm install @supabase/supabase-js
   ```

3. **Chạy migration** trên Supabase — dán nội dung
   `supabase/migrations/20260925_emr_dashboard.sql` vào SQL Editor trên
   Supabase Dashboard, hoặc `supabase db push` nếu bạn dùng Supabase CLI.

4. **Kiểm tra biến môi trường** đã có `NEXT_PUBLIC_SUPABASE_URL` và
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` trong `.env.local` (thường QARICA đã có sẵn
   hai biến này).

5. **Đổi client Supabase nếu cần** — xem chú thích đầu file
   `lib/emr/supabase.ts`. Nếu QARICA đã dùng `@supabase/ssr` (session lưu ở
   cookie), hãy thay hai hàm `emrSupabase()` / `emrSupabaseBrowser()` bằng
   client hiện có của bạn để trang Nhập liệu và ma trận biểu mẫu ghi được dữ
   liệu dưới đúng phiên đăng nhập.

6. **Thêm mục menu** — xem `MENU_INTEGRATION.md`.

7. **Nhập dữ liệu thật:**
   ```bash
   pip install openpyxl
   python scripts/export_excel_to_csv.py "/duong/dan/file_du_an_EMR_that.xlsx"
   ```
   Rồi vào `/emr/nhap-lieu`, chọn từng loại dữ liệu tương ứng, tải lên file
   CSV vừa xuất trong thư mục `exports/` (thư mục này đã có trong
   `.gitignore`, không bao giờ bị commit).

## Các trang trong module

| Route | Nội dung |
|---|---|
| `/emr` | Tổng quan — KPI tổng số biểu mẫu / đã triển khai / đã thực hiện EMR / chờ triển khai, theo từng nhóm biểu mẫu; danh sách biểu mẫu còn góp ý/lỗi mở |
| `/emr/bieu-mau` | Ma trận **biểu mẫu × khoa/phòng** — bấm vào ô để đổi trạng thái (4 nấc: Chưa triển khai → Đang triển khai → Đã triển khai → Đã thực hiện EMR) |
| `/emr/quy-trinh` | Danh sách quy trình - tài liệu quy định (trạng thái ban hành, hạn chót) |
| `/emr/thiet-bi-cntt` | Thiết bị CNTT theo vị trí (hiện có / cần bổ sung) |
| `/emr/thiet-bi-yte` | Thiết bị y tế có kết nối PACS/DICOM và trạng thái tích hợp |
| `/emr/chu-ky-so` | Theo dõi chữ ký số theo nhân sự, cảnh báo sắp hết hạn trong 30 ngày |
| `/emr/dao-tao` | Đào tạo - bàn giao theo khoa/biểu mẫu |
| `/emr/loi` | Lỗi/góp ý ghi nhận theo từng biểu mẫu |
| `/emr/nhap-lieu` | Nhập dữ liệu thật từ CSV thẳng vào Supabase |

## KPI được tính thế nào

Hai view SQL `emr_form_rollout_summary` và `emr_kpi_summary` tính lại đúng
logic của sheet "KPI EMR" trong file dự án: một biểu mẫu được tính **"Đã hoàn
thành"** khi TẤT CẢ khoa/phòng áp dụng nó đều ở trạng thái "Đã thực hiện EMR";
**"Đang triển khai"** khi có ít nhất một khoa đã bắt đầu; còn lại là
**"Chờ triển khai"**. Không cần tính tay trong code phía client — mọi trang
chỉ `select * from emr_kpi_summary` / `emr_form_rollout_summary`.

## Việc còn lại tùy bạn quyết định

- **Quyền chỉnh sửa**: RLS mặc định cho phép mọi tài khoản đã đăng nhập
  (`authenticated`) đọc/ghi toàn bộ module. Nếu QARICA có bảng phân quyền
  riêng (role-based như QLCL Manager / Admin), sửa các policy trong file
  migration (phần cuối, đoạn `do $$ ... $$`) để kiểm tra role đó thay vì chỉ
  kiểm tra `auth.role() = 'authenticated'`.
- **Giao diện**: các component dùng Tailwind (giả định repo đã cấu hình sẵn,
  như phần lớn stack Next.js + Supabase + Vercel). Màu nhấn dùng trực tiếp
  `#7B2D3B` (đỏ mận) khớp theme QARICA hiện tại — đổi ở `KpiCard.tsx` và
  `EmrTabs.tsx` nếu theme đổi màu sau này.
- **Cột chữ ký số**: cố tình không có `cccd`/`cmnd`. Nếu đơn vị cung cấp CKS
  yêu cầu lưu số này nội bộ, cân nhắc lưu ở một bảng riêng có RLS chỉ Admin
  đọc được, tách khỏi bảng theo dõi tiến độ chung.
