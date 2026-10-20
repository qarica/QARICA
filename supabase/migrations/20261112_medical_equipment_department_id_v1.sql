-- Phản hồi thực tế: "Quản lý TTBYT chưa set đúng tên khoa phòng đã khai báo
-- cấu hình" — department_label (text tự do, xem 20261019_medical_equipment_
-- registry_v1.sql) để nhập liệu tự do từ lúc tạo module, nên UI vẫn cho gõ
-- tay thay vì chọn từ danh mục khoa/phòng đã cấu hình ở Admin, lặp lại đúng
-- kiểu lệch tên đã thấy ở dữ liệu nhập đợt đầu (CẤP CỨU/Khoa Cấp Cứu, XN/
-- Xét nghiệm/Xét Nghiệm/Khoa XN...). Thêm department_id tham chiếu thẳng
-- departments — nguồn cấu hình duy nhất — để UI chuyển sang dropdown, không
-- tạo thêm biến thể tên mới từ nay về sau.
--
-- Không ép buộc mọi dòng cũ phải khớp: theo đúng nguyên tắc đã ghi ở migration
-- gốc, một nhãn mơ hồ ("PM", "Đang HĐ", "VLTL", "NỘI SOI", "PHÒNG ĐIỆN
-- CƠ/NÃO/TIM", "NHẬN BỆNH", "VIP"/"PK VIP" — không khớp rõ ràng với bất kỳ
-- khoa/phòng nào trong danh mục đã cấu hình) bị ép map sai còn tệ hơn để
-- trống chờ người dùng xác nhận lại bằng tay qua dropdown mới. Chỉ backfill
-- department_id cho các nhãn khớp rõ ràng (đúng tên hoặc viết tắt phổ biến),
-- giữ nguyên department_label làm dữ liệu gốc hiển thị dự phòng cho các dòng
-- chưa map được.
alter table public.medical_equipment add column if not exists department_id uuid references public.departments(id);

create index if not exists medical_equipment_department_id_idx on public.medical_equipment(department_id);

update public.medical_equipment me
set department_id = d.id
from public.departments d
where me.organization_id = d.organization_id
  and me.department_id is null
  and (
    (me.department_label = 'CẤP CỨU' and d.name = 'Khoa Cấp Cứu')
    or (me.department_label = 'CĐHA' and d.name = 'Khoa Chẩn đoán hình ảnh')
    or (me.department_label in ('Đông Y') and d.name = 'Khoa Đông Y')
    or (me.department_label = 'ĐỘT QUỴ' and d.name = 'Khoa Đột quỵ')
    or (me.department_label = 'HỒI SỨC' and d.name = 'Khoa Hồi sức tích cực chống độc')
    or (me.department_label = 'KHÁM BỆNH' and d.name = 'Khoa Khám bệnh')
    or (me.department_label = 'LỌC THẬN' and d.name = 'Khoa Lọc máu')
    or (me.department_label = 'NGOẠI TK' and d.name = 'Khoa Ngoại thần kinh')
    or (me.department_label = 'NGOẠI TQ' and d.name = 'Khoa Ngoại tổng quát')
    or (me.department_label in ('Nhi', 'NHI') and d.name = 'Khoa Nhi')
    or (me.department_label = 'NỘI TQ' and d.name = 'Khoa Nội tổng hợp')
    or (me.department_label = 'PT-GMHS' and d.name = 'Khoa Phẫu thuật - Gây mê hồi sức')
    or (me.department_label = 'RHM' and d.name = 'Khoa Răng hàm mặt')
    or (me.department_label = 'SẢN' and d.name = 'Khoa Phụ sản')
    or (me.department_label = 'TMH' and d.name = 'Khoa Tai mũi họng')
    or (me.department_label = 'UB' and d.name = 'Khoa Ung bướu')
    or (me.department_label in ('Xét nghiệm', 'Xét Nghiệm', 'XN', 'Khoa XN', 'ĐƠN VỊ GIẢI PHẪU BỆNH - KHOA XN') and d.name = 'Khoa Xét nghiệm')
  );
