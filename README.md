# QARICA — bàn giao redesign Tổng quan (dashboard/biểu đồ) + Risk/CAPA

## Phát hiện quan trọng trước khi đọc phần còn lại

Khi rà lại để đóng gói, em phát hiện `qarica/QARICA` trên GitHub đã có
thêm **54 commit mới** so với lần bàn giao gần nhất (nhiều PR hardening —
transaction nguyên tử, RLS, sửa lỗi...). Trong số đó có **4 việc em định
sửa hôm nay hoá ra ĐÃ ĐƯỢC SỬA RỒI** trên repo thật (khớp gần như y hệt
cách em định làm):

- Dashboard truy vấn nguyên bảng không lọc năm/tổ chức → đã sửa (PR "Scope
  Dashboard domain queries #389").
- Tiến độ chấm điểm tiêu chí không loại trừ "Không áp dụng" → đã sửa (PR
  "Fix assessment N/A progress and duplicate scorer #327").
- Panel sự cố không hiển thị cờ "nghiêm trọng" xuyên suốt → đã sửa (PR
  "Keep serious incident risk visible #324").
- Biểu đồ xu hướng dùng giờ UTC thay vì giờ VN → đã sửa (PR "Use HCM
  timezone for registry monthly trend #336").

→ Em **không đưa 4 việc đó vào gói này** để tránh đè/xung đột với công sức
đã có sẵn. Có vẻ đội dev hoặc một phiên ChatGPT khác đã xử lý song song —
đúng như lưu ý ở cuối báo cáo rà soát trước đó.

**Việc còn lại trong gói này là 100% MỚI, đã kiểm tra kỹ không trùng với
54 commit trên** (so từng file, base giống hệt bản gốc trước khi sửa):

## Nội dung bàn giao (1 commit, base = origin/main mới nhất `921149f`)

1. **`tqm-charts.tsx`** — bộ máy biểu đồ dùng chung, 17 trang cùng dùng:
   - Đổi bảng màu sang bộ màu đã kiểm tra phân biệt được với người mù màu
     (bảng cũ: xanh lá/đỏ dùng báo trạng thái gần như không phân biệt
     được — đã đo bằng công cụ chuyên dụng cho việc này).
   - Biểu đồ xu hướng (đường) giờ tương tác: rê chuột/gõ phím thấy số
     liệu từng điểm, có nút "Xem bảng số liệu" để không phải đoán qua
     hình vẽ (đạt chuẩn accessibility cho biểu đồ).

2. **`risks/page.tsx`, `capa/page.tsx`** — 2 trang này **không hề có nút
   "Tạo mới"**, dù phần xử lý phía sau (database, API `/api/domain-records`)
   đã làm sẵn đầy đủ — chỉ thiếu gắn nút lên giao diện. Đã thêm nút, dùng
   đúng component `DomainCreateClient` giống các trang Incidents/FMEA đã
   dùng.

3. **`tqm-priority-board.tsx`, `tqm-intervention-loop.tsx`,
   `tqm-smart-command-center.tsx`** (3 khối trên trang Tổng quan) — trạng
   thái (nghiêm trọng/cần theo dõi/ổn định) trước đây chỉ thể hiện bằng
   màu chấm tròn, không có chữ đi kèm — người mù màu không phân biệt
   được. Đã thêm nhãn chữ rõ ràng bên cạnh mỗi màu.

4. **`.gitignore`** — repo hiện chưa có, nên sau khi `npm install`,
   `node_modules/`/`.next/` hiện là untracked. Thêm chuẩn Next.js.

## Đã verify (trong container này, trên đúng base `921149f` mới nhất)

- `npx tsc --noEmit` → sạch, 0 lỗi.
- `npx eslint` (các file đã sửa) → 0 lỗi.
- `npx vitest run` → **352/353 test pass**. 1 test fail
  (`incident-rca-concurrency.test.ts`) nhưng **đã xác nhận fail sẵn trên
  chính origin/main, không liên quan gì đến gói này** (em đã tự kiểm
  tra bằng cách bỏ hết thay đổi của em ra rồi chạy lại, vẫn fail y hệt).
  Nên báo cho bên dev biết — có thể một PR gần đây làm lệch test này.
- `npx next build` → build production thành công.

## Cách apply (chọn 1 trong 2 cách)

**Cách 1 — bundle (khuyên dùng):**
```bash
git fetch qarica-1-commit.bundle redesign-on-latest:incoming-redesign
git checkout main
git merge incoming-redesign
```

**Cách 2 — patch:**
```bash
git am 0001-Redesign-chart-engine-for-accessibility-interactivit.patch
```

**Cách 3 — không rành git, dùng giao diện web GitHub:** kéo thả các file
trong thư mục này vào đúng đường dẫn tương ứng qua trang "Upload files"
của GitHub (giữ nguyên cấu trúc thư mục `src/app/(app)/...`,
`src/components/...`), commit vào nhánh mới, mở Pull Request, Merge —
giống các lần bàn giao trước.

## Còn lại chưa làm (từ báo cáo rà soát 4 vai trò trước đó)

Báo cáo có ~118 phát hiện; 4 mục Cao đã có người xử lý (xem trên). Còn
lại đáng chú ý nhất, ưu tiên bảo mật:

- **[Cao — Bảo mật]** `api/admin/departments/[id]/route.ts` (PATCH)
  không kiểm tra `organization_id` — tài khoản admin bệnh viện A có thể
  sửa/vô hiệu hoá phòng ban bệnh viện B nếu biết UUID.
- **[Cao — Bảo mật]** Upload minh chứng chặn theo blacklist đuôi file,
  không chặn `.html`/`.svg`, tin `mime_type` do client tự khai → rủi ro
  stored XSS qua minh chứng.
- **[Cao]** RPC đóng CAPA và chấp nhận Finding vẫn thiếu kiểm tra tổ chức
  mà các RPC khác cùng nhóm đã có.
- **[Cao]** Toàn bộ nhóm route quản lý Bộ tiêu chí (tạo/sửa/publish/ngưng)
  không ghi `audit_logs` — không truy vết được ai làm gì khi đoàn Sở Y tế
  hỏi.
- Ngoài ra còn ~10 mục Trung bình khác và một số mục Thấp (thẩm mỹ/UX
  nhỏ) — nằm trong file `QARICA-Bao-cao-ra-soat-va-de-xuat.pdf` đã gửi
  trước đó, mục D/F/H.

**Đề xuất:** 2 mục bảo mật ở trên nên làm sớm nhất, tách riêng khỏi việc
UI vì rủi ro dữ liệu cao hơn — anh xác nhận thì em làm tiếp.
