-- =========================================================================
-- Bổ sung "Nguồn lực cần" và người ký xác nhận đánh giá hiệu lực cho CAPA.
--
-- Đối chiếu 8 mục bắt buộc của London Protocol 2024, mục 9.3
-- (yếu tố góp phần / mức ảnh hưởng / người chịu trách nhiệm / thời hạn /
--  nguồn lực cần / cách theo dõi-đo lường / bằng chứng có ký xác nhận /
--  ngày đánh giá lại), CAPA hiện đã có 6/8 mục qua các bảng capas và
-- capa_effectiveness_reviews. Hai mục còn thiếu: nguồn lực cần, và
-- danh tính người ký xác nhận trên chính lần đánh giá hiệu lực.
-- =========================================================================

alter table public.capas
  add column if not exists required_resources text;

comment on column public.capas.required_resources is
  'Nguồn lực cần (nhân lực, kinh phí, thiết bị...) để thực hiện CAPA — mục 5/8 London Protocol 2024, mục 9.3.';

alter table public.capa_effectiveness_reviews
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

comment on column public.capa_effectiveness_reviews.reviewed_by is
  'Người ký xác nhận kết luận đánh giá hiệu lực — mục 7/8 London Protocol 2024, mục 9.3 (bằng chứng hoàn thành có xác nhận).';
