-- ============================================================================
-- EMR ROLLOUT DASHBOARD — schema mở rộng cho QARICA
-- ----------------------------------------------------------------------------
-- Theo dõi triển khai bệnh án điện tử (EMR) chi tiết theo: biểu mẫu x khoa/phòng,
-- quy trình - tài liệu, thiết bị CNTT, thiết bị y tế (PACS/DICOM), chữ ký số,
-- đào tạo - bàn giao, và lỗi/góp ý phát sinh trong quá trình triển khai.
--
-- Mọi bảng đặt tiền tố "emr_" để không đụng bảng hiện có của QARICA.
-- Không có bảng nào lưu số CCCD hay dữ liệu người bệnh — module này chỉ theo
-- dõi TIẾN ĐỘ TRIỂN KHAI PHẦN MỀM, không phải dữ liệu lâm sàng.
-- Chạy: supabase db push   (hoặc dán vào SQL editor trên Supabase Dashboard)
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Danh mục khoa/phòng/đơn vị (dùng chung cho toàn bộ module)
-- ----------------------------------------------------------------------------
create table if not exists emr_departments (
  id           uuid primary key default gen_random_uuid(),
  code         text unique,                  -- mã ngắn, vd: NOI, NGOAI, SAN...
  name         text not null,                -- Khoa Nội, Khoa Ngoại...
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. Danh mục biểu mẫu (khớp cấu trúc "Danh sách biểu mẫu" trong file dự án)
-- ----------------------------------------------------------------------------
create table if not exists emr_forms (
  id                     uuid primary key default gen_random_uuid(),
  code                   text,                 -- Mã số / Mã BYT (vd: 10/BV1, BA-11...)
  name                   text not null,        -- Tên biểu mẫu
  form_group             text,                 -- Nhóm: Bìa hồ sơ / Chăm sóc / Nhận định...
  category               text,                 -- Phân loại: Đặc thù / Chung
  owner_role             text,                 -- Người thực hiện: BS / ĐD / KTV...
  sign_order             text,                 -- Thứ tự ký (mô tả tự do)
  requires_e_signature   boolean not null default false,   -- chữ ký điện tử (ký tươi/tablet)
  requires_digital_sign  boolean not null default false,   -- chữ ký số (CKS)
  requires_stamp         boolean not null default false,   -- yêu cầu đóng mộc
  scan_requirement       text,                 -- Scan mới / Scan bổ sung / không cần
  guide_doc_url          text,                 -- link TLHDSD (tài liệu hướng dẫn sử dụng)
  digitization_status    text not null default 'Chưa triển khai'
                           check (digitization_status in (
                             'Chưa triển khai','Đang thực hiện','Hoàn thành'
                           )),                 -- Trạng thái số hóa PM (phía IT)
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists emr_forms_group_idx on emr_forms (form_group);

-- ----------------------------------------------------------------------------
-- 3. Tiến độ triển khai theo từng khoa cho từng biểu mẫu (ma trận biểu mẫu x khoa)
-- ----------------------------------------------------------------------------
create table if not exists emr_form_department_status (
  id             uuid primary key default gen_random_uuid(),
  form_id        uuid not null references emr_forms(id) on delete cascade,
  department_id  uuid not null references emr_departments(id) on delete cascade,
  status         text not null default 'Chưa triển khai'
                   check (status in (
                     'Chưa triển khai','Đang triển khai','Đã triển khai','Đã thực hiện EMR'
                   )),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users(id),
  unique (form_id, department_id)
);
create index if not exists emr_fds_form_idx on emr_form_department_status (form_id);
create index if not exists emr_fds_dept_idx on emr_form_department_status (department_id);

-- ----------------------------------------------------------------------------
-- 4. Lỗi / góp ý theo từng biểu mẫu (gộp cột "Nhóm lỗi" + "Note sửa" + sheet Bug)
-- ----------------------------------------------------------------------------
create table if not exists emr_form_issues (
  id            uuid primary key default gen_random_uuid(),
  form_id       uuid not null references emr_forms(id) on delete cascade,
  category      text,                -- Nội dung/Biểu mẫu, Dữ liệu/Mapping, Hiển thị/Report...
  description   text not null,
  status        text not null default 'Mới'
                  check (status in ('Mới','Đang xử lý','Chờ xác nhận','Đã sửa')),
  reported_by   uuid references auth.users(id),
  reported_at   timestamptz not null default now(),
  resolved_at   timestamptz
);
create index if not exists emr_issues_form_idx on emr_form_issues (form_id);

-- ----------------------------------------------------------------------------
-- 5. Quy trình - tài liệu quy định (Ds Quy trình)
-- ----------------------------------------------------------------------------
create table if not exists emr_processes (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,          -- Tên tài liệu/quy trình yêu cầu
  department    text,                   -- Khoa/phòng dự kiến chủ trì
  status        text not null default 'Dự thảo'
                  check (status in ('Dự thảo','Đang lấy ý kiến','Đã ban hành','Tạm hoãn')),
  deadline      date,
  notes         text,
  updated_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 6. Thiết bị CNTT theo vị trí (Ds CNTT)
-- ----------------------------------------------------------------------------
create table if not exists emr_it_equipment (
  id             uuid primary key default gen_random_uuid(),
  device_name    text not null,         -- Signpad, Tablet, Scan, Wifi, PC/laptop, LIS/PACS...
  location       text not null,         -- Vị trí: Tiếp nhận, Khoa Cấp cứu, CĐHA...
  qty_available  int not null default 0,
  qty_needed     int not null default 0,   -- số lượng cần bổ sung
  notes          text,
  updated_at     timestamptz not null default now()
);
create index if not exists emr_it_equipment_location_idx on emr_it_equipment (location);

-- ----------------------------------------------------------------------------
-- 7. Thiết bị y tế có kết nối dữ liệu (Ds TBYT — CĐHA, xét nghiệm...)
-- ----------------------------------------------------------------------------
create table if not exists emr_medical_equipment (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  model               text,
  manufacturer        text,
  origin_country      text,
  year                int,
  quantity            int not null default 1,
  department          text,
  floor               text,
  room                text,
  image_format        text,          -- DCM, PNG...
  integration_method  text,          -- "Thực hiện Dicom" / "Không Dicom / xuất file local"...
  status              text not null default 'Chưa thực hiện'
                        check (status in ('Chưa thực hiện','Đang thực hiện','Đã thực hiện')),
  notes               text,
  updated_at          timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 8. Chữ ký số (Ds CKS) — CHỦ Ý: không lưu số CCCD/CMND trong bảng này.
-- ----------------------------------------------------------------------------
create table if not exists emr_digital_signatures (
  id                 uuid primary key default gen_random_uuid(),
  staff_name         text not null,
  department         text,
  title              text,              -- Chức danh: Bác sĩ, Điều dưỡng...
  provider           text,              -- Đơn vị cung cấp: VNPT, Viettel-CA...
  issued_at          date,
  expires_at         date,
  hardcopy_required  boolean not null default false,
  notes              text,
  updated_at         timestamptz not null default now()
);
create index if not exists emr_cks_expiry_idx on emr_digital_signatures (expires_at);

-- ----------------------------------------------------------------------------
-- 9. Đào tạo - bàn giao theo biểu mẫu/khoa (KH Đào tạo)
-- ----------------------------------------------------------------------------
create table if not exists emr_training_signoff (
  id           uuid primary key default gen_random_uuid(),
  form_id      uuid references emr_forms(id) on delete set null,
  department   text not null,
  item_name    text,
  status       text not null default 'Chưa test'
                 check (status in ('Chưa test','Test','Sửa lại','Hoàn thành','Không phải test')),
  notes        text,
  updated_at   timestamptz not null default now()
);

-- ============================================================================
-- VIEWS — tổng hợp KPI (khớp logic sheet "KPI EMR": Tổng số biểu mẫu /
-- Đã triển khai / Đã thực hiện EMR / Chờ triển khai)
-- ============================================================================

create or replace view emr_form_rollout_summary as
select
  f.id                                     as form_id,
  f.name                                   as form_name,
  f.form_group,
  count(fds.department_id)                                                              as total_departments,
  count(fds.department_id) filter (where fds.status in
      ('Đang triển khai','Đã triển khai','Đã thực hiện EMR'))                            as departments_started,
  count(fds.department_id) filter (where fds.status = 'Đã thực hiện EMR')                as departments_completed,
  case
    when count(fds.department_id) = 0 then 'Chưa gán khoa'
    when count(fds.department_id) filter (where fds.status = 'Đã thực hiện EMR')
         = count(fds.department_id) then 'Đã hoàn thành'
    when count(fds.department_id) filter (where fds.status in
         ('Đang triển khai','Đã triển khai','Đã thực hiện EMR')) > 0 then 'Đang triển khai'
    else 'Chờ triển khai'
  end                                       as overall_status
from emr_forms f
left join emr_form_department_status fds on fds.form_id = f.id
group by f.id, f.name, f.form_group;

create or replace view emr_kpi_summary as
select
  count(*)                                                     as total_forms,
  count(*) filter (where overall_status in
      ('Đang triển khai','Đã hoàn thành'))                      as forms_started,
  count(*) filter (where overall_status = 'Đã hoàn thành')      as forms_completed,
  count(*) filter (where overall_status = 'Chờ triển khai')     as forms_pending,
  round(
    100.0 * count(*) filter (where overall_status in ('Đang triển khai','Đã hoàn thành'))
    / nullif(count(*), 0), 1)                                   as pct_started,
  round(
    100.0 * count(*) filter (where overall_status = 'Đã hoàn thành')
    / nullif(count(*), 0), 1)                                   as pct_completed
from emr_form_rollout_summary;

create or replace view emr_open_issues_summary as
select
  f.id as form_id,
  f.name as form_name,
  count(i.id) filter (where i.status <> 'Đã sửa')  as open_issues,
  count(i.id)                                       as total_issues
from emr_forms f
left join emr_form_issues i on i.form_id = f.id
group by f.id, f.name;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
-- Mặc định: người dùng đã đăng nhập (authenticated) được đọc và ghi toàn bộ
-- module này. Nếu QARICA đã có bảng phân quyền riêng (vd: profiles.role),
-- hãy thay điều kiện "true" bên dưới bằng điều kiện kiểm tra role tương ứng,
-- ví dụ: exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('qlcl_manager','admin'))
-- ============================================================================

alter table emr_departments             enable row level security;
alter table emr_forms                   enable row level security;
alter table emr_form_department_status  enable row level security;
alter table emr_form_issues             enable row level security;
alter table emr_processes               enable row level security;
alter table emr_it_equipment            enable row level security;
alter table emr_medical_equipment       enable row level security;
alter table emr_digital_signatures      enable row level security;
alter table emr_training_signoff        enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'emr_departments','emr_forms','emr_form_department_status','emr_form_issues',
    'emr_processes','emr_it_equipment','emr_medical_equipment',
    'emr_digital_signatures','emr_training_signoff'
  ]
  loop
    execute format(
      'drop policy if exists %I on %I;
       create policy %I on %I for select using (auth.role() = ''authenticated'');',
      t || '_select', t, t || '_select', t
    );
    execute format(
      'drop policy if exists %I on %I;
       create policy %I on %I for all using (auth.role() = ''authenticated'')
       with check (auth.role() = ''authenticated'');',
      t || '_write', t, t || '_write', t
    );
  end loop;
end $$;

-- ============================================================================
-- DỮ LIỆU MẪU — chỉ để xem giao diện, KHÔNG phải dữ liệu thật.
-- Xóa các dòng mẫu này (hoặc TRUNCATE các bảng) trước khi nhập dữ liệu thật
-- qua trang /emr/nhap-lieu hoặc trực tiếp trên Supabase.
-- ============================================================================

insert into emr_departments (code, name, sort_order) values
  ('KKB',  'Khoa Khám bệnh',           1),
  ('HSCC', 'Khoa Hồi sức',             2),
  ('CC',   'Khoa Cấp cứu',             3),
  ('NOI',  'Khoa Nội',                 4),
  ('NGOAI','Khoa Ngoại',               5),
  ('SAN',  'Khoa Sản',                 6),
  ('NHI',  'Khoa Nhi',                 7),
  ('PTGMHS','Khoa Phẫu thuật - GMHS',  8),
  ('VIP',  'Khoa VIP',                 9),
  ('TNT',  'Đơn vị Thận nhân tạo',    10),
  ('NSTH', 'Đơn vị Nội soi tiêu hóa', 11),
  ('VLTL', 'Đơn vị VLTL - PHCN',      12),
  ('RHM',  'Đơn vị Răng Hàm Mặt',     13)
on conflict (code) do nothing;

with sample_forms as (
  insert into emr_forms (code, name, form_group, category, owner_role, digitization_status,
                          requires_e_signature, requires_digital_sign, requires_stamp)
  values
    (null, 'Bệnh án Nội khoa',              'Bệnh án', 'Đặc thù', 'Bác sĩ', 'Chưa triển khai', true,  true,  false),
    (null, 'Bệnh án Ngoại khoa',            'Bệnh án', 'Đặc thù', 'Bác sĩ', 'Hoàn thành',      true,  true,  false),
    (null, 'Bệnh án Nhi khoa',              'Bệnh án', 'Đặc thù', 'Bác sĩ', 'Hoàn thành',      true,  true,  false),
    (null, 'Bệnh án ngoại trú (chung)',     'Bệnh án', 'Chung',   'Bác sĩ', 'Đang thực hiện',  true,  false, false),
    (null, 'Phiếu khám bệnh ngoại trú',     'Khám bệnh','Chung',  'Bác sĩ', 'Đang thực hiện',  true,  false, false),
    (null, 'Giấy cam kết chấp thuận PT, TT và GMHS', 'Tiếp nhận', 'Chung', 'Điều dưỡng', 'Hoàn thành', true, false, false),
    (null, 'Phiếu theo dõi truyền dịch',    'Điều dưỡng','Chung', 'Điều dưỡng', 'Đang thực hiện', true, false, false),
    (null, 'Phiếu chỉ định cận lâm sàng',   'Cận lâm sàng','Chung','Bác sĩ', 'Đang thực hiện', true, false, false)
  returning id, name
)
insert into emr_form_department_status (form_id, department_id, status)
select sf.id, d.id,
  (array['Chưa triển khai','Đang triển khai','Đã triển khai','Đã thực hiện EMR'])
    [1 + ((abs(hashtext(sf.name || d.code))) % 4)]
from sample_forms sf
cross join emr_departments d
where d.code in ('KKB','NOI','NGOAI','SAN','NHI','CC')
on conflict (form_id, department_id) do nothing;

insert into emr_processes (name, department, status, deadline) values
  ('Chương trình đào tạo, hướng dẫn sử dụng EMR', 'CNTT', 'Đang lấy ý kiến', null),
  ('Quy định triển khai mẫu bệnh án, mẫu giấy, phiếu y theo Thông tư 32/2023/TT-BYT', 'KHTH', 'Đã ban hành', null),
  ('Quy định cấu trúc và biểu mẫu chuẩn EMR', 'KHTH', 'Đã ban hành', null),
  ('Quy chế lập, cập nhật, quản lý, lưu trữ, sử dụng và an toàn thông tin HSBA điện tử', 'KHTH', 'Đã ban hành', null),
  ('Quy trình kiểm tra – duyệt HSBA trước khi ký lưu EMR', 'KHTH', 'Đã ban hành', null),
  ('Quy trình sửa đổi – bổ sung – hủy dữ liệu trên EMR', 'KHTH', 'Đã ban hành', null);

insert into emr_it_equipment (device_name, location, qty_available, qty_needed) values
  ('Tablet ký số bệnh nhân', 'Toàn viện', 5, 5),
  ('Máy scan', 'Toàn viện', 1, 9),
  ('PC / laptop', 'Toàn viện', 81, 1),
  ('Signpad bệnh nhân', 'Toàn viện', 0, 0);

insert into emr_medical_equipment (name, model, department, image_format, integration_method, status) values
  ('Máy X-quang tổng hợp', 'TITAN 2000', 'CĐHA', 'DCM', 'Thực hiện Dicom', 'Đã thực hiện'),
  ('Máy CT', 'REVOLUTION', 'CĐHA', 'DCM', 'Thực hiện Dicom', 'Đã thực hiện'),
  ('Máy siêu âm tổng quát', 'SSA-590A', 'CĐHA', 'PNG', 'Không Dicom / xuất file local', 'Đã thực hiện');

insert into emr_training_signoff (department, item_name, status) values
  ('Khoa Ngoại', 'Bệnh án ngoại khoa', 'Hoàn thành'),
  ('Khoa GMHS', 'Bảng kiểm an toàn phẫu thuật', 'Test'),
  ('Phòng Điều dưỡng', 'Phiếu theo dõi truyền dịch', 'Sửa lại');
