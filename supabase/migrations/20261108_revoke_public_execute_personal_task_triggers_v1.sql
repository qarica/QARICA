-- Security hardening: record_personal_task_audit() và
-- record_personal_task_extension_request() là trigger function (dùng TG_TABLE_NAME/
-- OLD/NEW, chỉ có nghĩa khi Postgres gọi trong ngữ cảnh trigger), nhưng Postgres mặc
-- định cấp EXECUTE cho PUBLIC khi tạo function mới — khiến Supabase Security Advisor
-- cảnh báo "anon"/"authenticated" gọi được qua PostgREST (/rest/v1/rpc/...). Gọi trực
-- tiếp sẽ lỗi ngay (không có trigger context) nên không khai thác được để sửa dữ liệu,
-- nhưng vẫn nên thu hẹp bề mặt — không có lý do gì để lộ 2 hàm nội bộ này qua API.
revoke execute on function public.record_personal_task_audit() from public, anon, authenticated;
revoke execute on function public.record_personal_task_extension_request() from public, anon, authenticated;
