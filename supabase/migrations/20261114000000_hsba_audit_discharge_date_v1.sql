-- Audit HSBA (Hồ sơ bệnh án): thêm ngày ra viện để báo cáo tháng tính theo
-- đúng tháng hồ sơ ra viện, không phải tháng thực hiện audit (hồ sơ thường
-- được audit sau khi bệnh nhân đã ra viện, có thể rơi sang tháng sau).
-- Chỉ lưu ngày (date) — không phải dữ liệu lâm sàng — giữ đúng nguyên tắc
-- record_reference/discharge_date chỉ là mốc tham chiếu để tra cứu lại HIS,
-- không trở thành nguồn dữ liệu bệnh nhân thứ hai (xem comment đầu
-- 20261012_hsba_audit_module_v1.sql).
alter table public.hsba_audits add column if not exists discharge_date date;
