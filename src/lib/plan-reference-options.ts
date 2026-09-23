import { createAdminClient } from "@/lib/supabase/admin";

export type PlanReferenceOption = {
  id: string;
  label: string;
  description: string;
  sourceAuthority: string;
  documentNumber: string;
  issuedDate: string;
  documentUrl: string;
};

export async function loadPlanReferenceOptions(organizationId: string): Promise<PlanReferenceOption[]> {
  const admin = createAdminClient();
  const { data: records, error: recordError } = await admin
    .from("records")
    .select("id,title,organization_id,lifecycle_status")
    .eq("organization_id", organizationId)
    .eq("record_type", "DIRECTIVE")
    .eq("lifecycle_status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(500);
  if (recordError || !records?.length) return [];

  const recordIds = records.map((x: any) => x.id).filter(Boolean);
  const { data: directives, error } = await admin
    .from("external_directives")
    .select("id,record_id,source_authority,directive_type,document_number,issued_date,effective_date,document_url,summary,workflow_status")
    .in("record_id", recordIds)
    .order("issued_date", { ascending: false, nullsFirst: false });
  if (error || !directives?.length) return [];
  const recordMap = new Map((records ?? []).map((x: any) => [x.id, x]));

  return directives.flatMap((row: any) => {
    const record: any = recordMap.get(row.record_id);
    if (!record) return [];
    const number = String(row.document_number || "").trim();
    const authority = String(row.source_authority || "").trim();
    const issued = String(row.issued_date || "").slice(0, 10);
    const type = String(row.directive_type || "").trim();
    const title = String(record.title || "").trim();
    const label = [number, title].filter(Boolean).join(" · ") || title || number || "Văn bản";
    const description = [authority, type, issued ? `ban hành ${issued}` : "", row.summary].filter(Boolean).join(" · ");
    return [{
      id: row.id,
      label,
      description,
      sourceAuthority: authority,
      documentNumber: number,
      issuedDate: issued,
      documentUrl: String(row.document_url || "").trim(),
    }];
  });
}
