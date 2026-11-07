-- Báo cáo thực tế: "Bổ sung sơ đồ này nữa" — tham khảo 1 sơ đồ phân cấp
-- theo khối (Phòng chức năng / Khoa lâm sàng / Khoa cận lâm sàng-hỗ trợ),
-- mỗi khoa hiện số giường + nguồn gốc (biên bản 2013 / lập mới theo QĐ 2018
-- / chỉ có trong mặt bằng hoặc hồ sơ 2019). Không hard-code 1 bệnh viện —
-- thêm field cấu hình chung để TỪNG tổ chức tự nhập, giống floor_order/
-- floor_label/room_label/area_sqm đã làm ở migration trước.
alter table public.departments
  add column if not exists bed_count integer,
  add column if not exists org_origin text,
  add column if not exists org_summary text;

alter table public.departments
  add constraint departments_org_origin_check
  check (org_origin is null or org_origin in ('ESTABLISHED_2013', 'NEW_2018', 'PLAN_ONLY_2019'));
