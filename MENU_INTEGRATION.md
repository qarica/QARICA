# Thêm menu "EMR Dashboard" vào QARICA

Module này chỉ thêm các route mới dưới `/emr/*` — nó không tự xuất hiện trong
sidebar của QARICA. Vào file cấu hình menu hiện có của bạn (thường là dạng
`config/nav.ts`, `components/layout/sidebar.tsx`, hoặc tương tự) và thêm một
mục trỏ tới `/emr`, ví dụ:

```ts
// ví dụ — chỉnh lại theo đúng shape mà menu hiện tại của bạn đang dùng
{
  label: "EMR Dashboard",
  href: "/emr",
  icon: ClipboardList, // hoặc icon tương đương bạn đang dùng (lucide-react...)
}
```

Nếu sidebar của bạn lọc menu theo vai trò (role-based), đặt mục này ở mức
tương đương với các mục quản lý khác (vd: chỉ hiện với QLCL Manager / Admin)
theo đúng cách bạn đang làm cho QLVB hay Bảng kiểm HSBA.

Không cần đổi layout gốc của QARICA — `app/emr/layout.tsx` trong module này tự
vẽ thanh tab con (Tổng quan / Biểu mẫu / Quy trình / ...), nằm bên trong layout
chung của bạn như bất kỳ trang nào khác trong `app/`.
