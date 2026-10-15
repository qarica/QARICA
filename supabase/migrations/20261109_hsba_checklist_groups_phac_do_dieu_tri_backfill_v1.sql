-- Gán nhóm lớn (hsba_checklist_groups) cho 95 tiêu chí Phác đồ điều trị đang
-- có thật (Tăng huyết áp/Trĩ v1+v2/Thoái hóa khớp gối) — bảng hsba_checklist_groups
-- đã tồn tại từ trước (20261028_production_reconciliation_v1.sql) nhưng chưa
-- ai tạo nhóm nào. KHÔNG áp dụng cho HSBA — HSBA hiện chưa có item thật nào,
-- và quyết định đã chốt lại là HSBA tiếp tục chỉ Đạt/Không đạt (2 mức), không
-- đổi sang 4 mức như đề xuất trước đó.
--
-- 6 nhóm suy ra từ chính nội dung thật của 95 item (không hardcode theo tên
-- nhóm HSBA kiểu "I. Hành chính" — đó là cấu trúc dành riêng cho HSBA, không
-- áp nhầm sang Phác đồ điều trị): Lâm sàng/Sinh hiệu, Chẩn đoán, Cận lâm
-- sàng, Điều trị, Theo dõi điều trị, Xuất viện. Đã xác nhận khớp 100% —
-- 0 item còn lại không phân nhóm được sau khi áp.
with g as (
  insert into public.hsba_checklist_groups (organization_id, checklist_version_id, name, sort_order)
  select t.organization_id, v.id, grp.name, grp.sort_order
  from public.hsba_checklist_versions v
  join public.hsba_checklist_templates t on t.id = v.checklist_template_id
  cross join (values
    ('I. Lâm sàng',1),
    ('II. Chẩn đoán',2),
    ('III. Cận lâm sàng',3),
    ('IV. Điều trị',4),
    ('V. Theo dõi điều trị',5),
    ('VI. Xuất viện',6)
  ) as grp(name, sort_order)
  where t.audit_type = 'PHAC_DO_DIEU_TRI'
  returning id, checklist_version_id, name
)
update public.hsba_checklist_items i
set group_id = g.id
from g
where i.checklist_version_id = g.checklist_version_id
  and (
    (g.name = 'I. Lâm sàng' and (i.content like 'Sinh hiệu%' or i.content like 'Lâm sàng%' or i.content like 'Khai thác tiền sử%' or i.content like 'Tiền sử ghi nhận%' or i.content like 'Thăm khám đầy đủ%'))
    or (g.name = 'II. Chẩn đoán' and i.content like 'Chẩn đoán%')
    or (g.name = 'III. Cận lâm sàng' and i.content like 'Cận lâm sàng%')
    or (g.name = 'V. Theo dõi điều trị' and i.content like 'Theo dõi điều trị%')
    or (g.name = 'IV. Điều trị' and i.content like 'Điều trị%')
    or (g.name = 'VI. Xuất viện' and i.content like 'Xuất viện%')
  );
