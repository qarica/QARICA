# QARICA — bàn giao vá bảo mật: upload ảnh 5S

## Tóm tắt tình hình 2 mục bảo mật đã báo cáo trước đó

Anh nhắn "Có e làm luôn đi" cho 2 mục Cao — Bảo mật trong báo cáo rà soát.
Khi bắt tay vào làm, em kiểm tra lại code hiện tại trên GitHub thì phát
hiện:

1. **IDOR trên `admin/departments/[id]` (PATCH)** — **đã được sửa sẵn**
   trên repo (PR "Scope department admin updates to caller organization
   #315"). Route đã lọc đúng `organization_id` ở cả bước tìm và bước cập
   nhật. **Không cần làm gì thêm.**

2. **Upload minh chứng tin `mime_type` client tự khai (stored XSS)** —
   route được nêu trong báo cáo gốc (`tasks/[id]/evidence`) **cũng đã
   được sửa sẵn** (PR "Harden evidence uploads against active-content XSS
   #316), dùng danh sách trắng đuôi file + mime type do SERVER quyết định.

   Tuy nhiên khi rà kỹ toàn bộ các chỗ có upload ảnh trong hệ thống, em
   phát hiện **2 route khác chưa được vá, cùng lỗ hổng y hệt**:
   - `api/monitoring/rounds/5s` (upload ảnh "trước khắc phục" khi làm
     bảng kiểm 5S)
   - `api/monitoring/rounds/[id]/recheck` (upload ảnh "sau khắc phục" khi
     xác nhận đã sửa xong)

   Cả 2 route này chỉ kiểm tra `file.type.startsWith("image/")` — do
   trình duyệt/thiết bị của người dùng tự khai báo, có thể giả mạo — rồi
   lưu thẳng giá trị đó làm `Content-Type` khi phục vụ file. Một file
   `.svg` giả dạng ảnh (khai `image/svg+xml`, vẫn qua được điều kiện
   `startsWith("image/")`) có thể chứa mã `<script>` và trình duyệt sẽ
   chạy mã đó khi ai mở file ra xem — đúng dạng lỗi "stored XSS" đã nêu
   trong báo cáo, chỉ là ở 2 route chưa được rà tới trước đó.

   → Em đã vá 2 route này trong gói bàn giao hôm nay.

## Nội dung bàn giao (1 commit, base = origin/main mới nhất `50b5b41`)

- `src/lib/evidence-file-policy.ts` — thêm hàm `safeImageMimeType()`:
  chỉ chấp nhận đúng 4 kiểu ảnh chụp thật (jpeg/png/webp/gif), từ chối
  mọi kiểu khác kể cả khi client khai là "image/...".
- `src/app/api/monitoring/rounds/5s/route.ts` — dùng hàm trên để kiểm
  tra ảnh "trước khắc phục" thay vì tin `file.type`.
- `src/app/api/monitoring/rounds/[id]/recheck/route.ts` — dùng hàm trên
  để kiểm tra ảnh "sau khắc phục" thay vì tin `file.type`.

## Đã verify (trong container này, đúng base `50b5b41` mới nhất, không bị lệch)

- `npx tsc --noEmit` → sạch, 0 lỗi.
- `npx eslint` (3 file đã sửa) → 0 lỗi.
- `npx vitest run` → 352/353 test pass. 1 test fail
  (`incident-rca-concurrency.test.ts`) — **đã xác nhận đây là lỗi có sẵn
  trên chính origin/main, không liên quan gói này** (đã báo ở lần bàn
  giao trước, nhắc lại để bên dev biết vẫn còn tồn tại).
- `npx next build` → build production thành công, không lỗi.
- Đã `git fetch origin main` ngay trước khi đóng gói: repo vẫn đứng ở
  `50b5b41`, không có commit mới nào chen vào — gói này không đè lên
  việc của ai.

## Cách apply (chọn 1 trong 3 cách)

**Cách 1 — bundle (khuyên dùng):**
```bash
git fetch qarica-security-fix.bundle security-fixes:incoming-security-fix
git checkout main
git merge incoming-security-fix
```

**Cách 2 — patch:**
```bash
git am 0001-Harden-5S-monitoring-photo-uploads-against-active-c.patch
```

**Cách 3 — không rành git, dùng giao diện web GitHub:** kéo thả 3 file
trong thư mục `src/` của gói này vào đúng đường dẫn tương ứng qua trang
"Upload files" của GitHub (giữ nguyên cấu trúc thư mục), commit vào
nhánh mới, mở Pull Request, Merge.

## Còn lại chưa làm (từ báo cáo rà soát 4 vai trò trước đó)

- **[Cao]** RPC đóng CAPA và chấp nhận Finding vẫn thiếu kiểm tra tổ chức
  mà các RPC khác cùng nhóm đã có.
- **[Cao]** Toàn bộ nhóm route quản lý Bộ tiêu chí (tạo/sửa/publish/ngưng)
  không ghi `audit_logs` — không truy vết được ai làm gì khi đoàn Sở Y tế
  hỏi.
- Ngoài ra còn ~10 mục Trung bình khác và một số mục Thấp (thẩm mỹ/UX
  nhỏ) — nằm trong file `QARICA-Bao-cao-ra-soat-va-de-xuat.pdf` đã gửi
  trước đó, mục D/F/H.

Anh xác nhận thì em làm tiếp 2 mục Cao còn lại ở trên.
