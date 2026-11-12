-- Fix thật khẩn: migration trước (20261112000000) tạo policy SELECT cho
-- quality_domains bằng `organization_id = private.current_organization_id()`.
-- Nhưng quality_domains là danh mục CỐ ĐỊNH DÙNG CHUNG toàn hệ thống (10
-- lĩnh vực chất lượng & an toàn chuẩn, giống nguyên tắc EMR_CATEGORIES đã
-- ghi trong CLAUDE.md) — xác nhận trên DB sống: cả 10 dòng đều có
-- organization_id = NULL. `NULL = x` luôn là NULL (falsy) trong SQL, nên
-- policy cũ không bao giờ khớp — mọi user qua client thường đều thấy 0
-- dòng. Đã verify bằng Playwright: widget "Tình trạng theo lĩnh vực" ở
-- Dashboard hiện "Chưa có hồ sơ được gắn lĩnh vực" dù dữ liệu sự cố thật đã
-- được gắn lĩnh vực — tính năng bị vỡ hoàn toàn cho mọi người dùng kể từ
-- migration trước. Sửa bằng cách cho phép xem cả danh mục dùng chung
-- (organization_id IS NULL) lẫn danh mục riêng của tổ chức (nếu sau này mở
-- rộng cho phép tổ chức tự thêm lĩnh vực riêng).

drop policy if exists qlcl_authenticated_select on public.quality_domains;

create policy qlcl_authenticated_select on public.quality_domains
  for select to authenticated
  using (
    organization_id is null
    or organization_id = private.current_organization_id()
  );
