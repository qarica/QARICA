QLCL-TTSG - AUTH SERVER FIX V1

Mục tiêu:
- Browser chỉ gọi /api/auth/login trên cùng domain Vercel.
- Vercel server gọi Supabase Auth.
- Loại bỏ phụ thuộc browser -> Supabase trực tiếp khi DNS/CORS phía máy người dùng chập chờn.
- Chuẩn hóa internal login domain thành @qlcl-ttsg.com.
- Có endpoint /api/health/auth để kiểm tra Vercel -> Supabase mà không lộ secret.

Upload/overwrite đúng 4 file theo cấu trúc thư mục trong ZIP.
Sau commit, chờ Vercel Production = Ready.

Kiểm tra:
1) Mở https://<domain>/api/health/auth
   Mong đợi: {"ok":true,...}
2) Sau đó đăng nhập bằng username admin.
