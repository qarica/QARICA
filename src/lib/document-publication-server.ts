import type { SupabaseClient } from "@supabase/supabase-js";

const DAY_MS = 86400000;
// Chu kỳ xem xét lại văn bản sau khi phát hành — dùng chung cho mọi đường tạo
// bản ghi PUBLISHED (chuyển bước bình thường lẫn nhập trực tiếp văn bản đã có
// sẵn), tránh 2 nơi tự tính review_date rồi lệch nhau.
export const REVIEW_CYCLE_DAYS = 730;

export function addDaysISO(base: string, days: number): string {
  return new Date(new Date(`${base}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

// "Cần đào tạo" tự tạo 1 dòng Đào tạo quy trình liên kết lại văn bản gốc — tái
// dùng workflow Đào tạo quy trình sẵn có thay vì xây lại cơ chế theo dõi đào
// tạo riêng cho văn bản. Dùng chung cho cả 2 đường tới PUBLISHED (chuyển bước
// bình thường và nhập trực tiếp văn bản đã phát hành).
export async function createTrainingForDocument(
  admin: SupabaseClient,
  params: {
    organizationId: string;
    documentCode: string;
    title: string;
    draftingDepartmentName: string | null;
    effectiveDate: string;
    documentPublicationId: string;
    createdBy: string;
  },
) {
  return admin.from("procedure_trainings").insert({
    organization_id: params.organizationId,
    procedure_code: params.documentCode,
    procedure_name: params.title,
    drafting_unit: params.draftingDepartmentName,
    effective_date: params.effectiveDate,
    document_publication_id: params.documentPublicationId,
    created_by: params.createdBy,
  });
}

// "Khi phát hành phiên bản mới phải có lịch sử chứ" — version_label trên
// document_publications là 1 field bị GHI ĐÈ mỗi lần chốt (lần đầu phát hành
// hoặc phát hành lại văn bản đã PUBLISHED), phiên bản cũ biến mất khỏi UI.
// Gọi hàm này ngay sau khi version_label được set thành công, từ cả 3 nơi:
// POST direct_publish, PATCH ADVANCE→PUBLISHED, PATCH EDIT khi đã PUBLISHED —
// ghi thêm 1 dòng append-only vào document_publication_versions, không xoá/
// sửa dòng cũ, nên luôn tra lại được đủ các phiên bản đã từng phát hành.
export async function recordDocumentVersion(
  admin: SupabaseClient,
  params: {
    organizationId: string;
    documentPublicationId: string;
    versionLabel: string;
    documentCode: string | null;
    effectiveDate: string | null;
    fileName: string | null;
    createdBy: string;
  },
) {
  return admin.from("document_publication_versions").insert({
    organization_id: params.organizationId,
    document_publication_id: params.documentPublicationId,
    version_label: params.versionLabel,
    document_code: params.documentCode,
    effective_date: params.effectiveDate,
    file_name: params.fileName,
    created_by: params.createdBy,
  });
}

// Hướng "giữ file theo từng phiên bản": khi phát hành PHIÊN BẢN MỚI của 1 văn
// bản (yêu cầu UPDATE), file đang đính trên văn bản thuộc về phiên bản CŨ. Trước
// đây file đó bị xoá khi đính file mới (không tra lại được bản cũ). Hàm này gọi
// TRƯỚC khi áp version_label mới: bảo đảm bản cũ có 1 dòng trong
// document_publication_versions (văn bản nhập từ trước có thể chưa có dòng nào)
// và chuyển file hiện hành vào dòng đó. Việc gỡ file khỏi văn bản hiện tại do
// nơi gọi làm cùng lúc cập nhật version mới.
export async function archiveCurrentVersionFile(
  admin: SupabaseClient,
  params: { organizationId: string; documentId: string; createdBy: string },
): Promise<{ ok: true; archivedFile: boolean } | { ok: false; error: string }> {
  const { organizationId, documentId, createdBy } = params;
  const { data: target, error: targetError } = await admin
    .from("document_publications")
    .select("version_label,document_code,effective_date,file_path,file_name")
    .eq("id", documentId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (targetError) return { ok: false, error: targetError.message };
  if (!target) return { ok: false, error: "Không tìm thấy văn bản đích." };

  const { data: existing, error: existingError } = await admin
    .from("document_publication_versions")
    .select("id,file_path")
    .eq("document_publication_id", documentId)
    .eq("organization_id", organizationId)
    .eq("version_label", target.version_label)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) return { ok: false, error: existingError.message };

  if (!existing) {
    const { error: insertError } = await admin.from("document_publication_versions").insert({
      organization_id: organizationId,
      document_publication_id: documentId,
      version_label: target.version_label,
      document_code: target.document_code,
      effective_date: target.effective_date,
      file_name: target.file_name,
      file_path: target.file_path,
      created_by: createdBy,
    });
    if (insertError) return { ok: false, error: insertError.message };
    return { ok: true, archivedFile: !!target.file_path };
  }

  // Dòng của bản cũ đã có: chỉ gắn file nếu nó chưa giữ file nào (không ghi đè
  // file đã lưu trước đó).
  if (target.file_path && !existing.file_path) {
    const { error: updateError } = await admin
      .from("document_publication_versions")
      .update({ file_path: target.file_path, file_name: target.file_name })
      .eq("id", existing.id);
    if (updateError) return { ok: false, error: updateError.message };
    return { ok: true, archivedFile: true };
  }
  return { ok: true, archivedFile: false };
}
