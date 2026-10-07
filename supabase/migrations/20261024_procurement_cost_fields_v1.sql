-- Đề xuất mua sắm/sửa chữa thiếu hẳn số lượng/đơn giá/chi phí dự kiến — BGĐ/
-- TGĐ phải duyệt một đề xuất không có con số nào để đánh giá quy mô chi.
alter table public.procurement_requests
  add column if not exists quantity integer check (quantity is null or quantity > 0),
  add column if not exists unit_price numeric(14,2) check (unit_price is null or unit_price >= 0),
  add column if not exists estimated_cost numeric(14,2) check (estimated_cost is null or estimated_cost >= 0);
