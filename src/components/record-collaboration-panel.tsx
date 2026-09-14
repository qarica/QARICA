import { RecordCollaborationClient } from "@/components/record-collaboration-client";
import { requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function RecordCollaborationPanel({ recordId }: { recordId: string }) {
  const { user } = await requireUserContext();
  const supabase = await createClient();
  const { data: record } = await supabase
    .from("records")
    .select("id,lifecycle_status")
    .eq("id", recordId)
    .maybeSingle();
  if (!record) return null;

  const [linksRes, commentsRes] = await Promise.all([
    supabase.from("evidence_links").select("evidence_id,linked_at").eq("record_id", recordId).order("linked_at", { ascending: false }),
    supabase.from("record_comments").select("id,author_user_id,comment_text,created_at").eq("record_id", recordId).order("created_at", { ascending: false }).limit(100),
  ]);

  const evidenceIds = Array.from(new Set((linksRes.data ?? []).map((row: any) => row.evidence_id).filter(Boolean))) as string[];
  const authorIds = Array.from(new Set((commentsRes.data ?? []).map((row: any) => row.author_user_id).filter(Boolean))) as string[];

  const [evidenceRes, authorsRes] = await Promise.all([
    evidenceIds.length
      ? supabase.from("evidence").select("id,title,original_file_name,file_size,validity_status,uploaded_at").in("id", evidenceIds).order("uploaded_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    authorIds.length
      ? supabase.from("profiles").select("user_id,full_name,email").in("user_id", authorIds)
      : Promise.resolve({ data: [], error: null }),
  ] as any);

  const authorMap = new Map((authorsRes.data ?? []).map((row: any) => [row.user_id, row.full_name || row.email || "Người dùng"]));
  const comments = (commentsRes.data ?? []).map((row: any) => ({
    id: row.id,
    comment_text: row.comment_text,
    created_at: row.created_at,
    author_name: authorMap.get(row.author_user_id) || "Người dùng",
  }));

  return <RecordCollaborationClient
    recordId={recordId}
    lifecycleStatus={record.lifecycle_status}
    canUpload={user.permissions.includes("evidence.upload")}
    evidence={(evidenceRes.data ?? []) as any[]}
    comments={comments as any[]}
  />;
}
