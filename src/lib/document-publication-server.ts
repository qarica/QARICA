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
