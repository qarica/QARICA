-- Báo cáo thực tế: "Phân loại văn bản sửa thành: Vận hành, Quy trình kỹ
-- thuật, Phác đồ điều trị, Quy trình kỹ thuật chăm sóc, Hướng dẫn chẩn đoán
-- và điều trị" — thêm loại tài liệu thứ 5 CLINICAL_GUIDELINE ("Hướng dẫn
-- chẩn đoán và điều trị"), tách ra từ nhãn gộp cũ của CLINICAL_PROCEDURE
-- ("Chuyên môn khối BS — Quy trình kỹ thuật & Hướng dẫn điều trị" — giờ rút
-- gọn còn "Quy trình kỹ thuật"). Văn bản cũ đã gắn CLINICAL_PROCEDURE không
-- đổi document_type, chỉ đổi nhãn hiển thị (xem document-publication-types.ts).
alter table public.document_publications
  drop constraint document_publications_document_type_check;
alter table public.document_publications
  add constraint document_publications_document_type_check
  check (document_type = any (array['OPERATIONAL','CLINICAL_PROCEDURE','CLINICAL_PROTOCOL','NURSING','CLINICAL_GUIDELINE']));
