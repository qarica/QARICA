import { PageHeader } from "@/components/page-header";
import { PersonalWorkspaceClient } from "@/components/personal-workspace-client";
import { KnowledgeJournalClient } from "@/components/knowledge-journal-client";
import { ZaloLinkClient } from "@/components/zalo-link-client";
import { requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function PersonalWorkspacePage({ searchParams }: { searchParams: Promise<{ item?: string; note?: string }> }) {
  const { user } = await requireUserContext();
  const { item, note } = await searchParams;
  const supabase = await createClient();
  const [profileResult, knowledgeResult, { data: workspaceRows, error: workspaceError }] = await Promise.all([
    supabase.from("profiles").select("user_id").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("knowledge_notes")
      .select("id,note_type,visibility,title,content,journal_date,status,source_kind,created_at")
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("personal_workspace_items")
      .select("id,item_type,title,content,category,due_at,status,completed_at,deleted_at")
      .eq("owner_user_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (profileResult.error) {
    console.error("[PersonalWorkspace] profile query failed:", profileResult.error.message);
    throw new Error("Không tải được thông tin tài khoản cá nhân.");
  }
  if (knowledgeResult.error) {
    console.error("[PersonalWorkspace] knowledge notes query failed:", knowledgeResult.error.message);
    throw new Error("Không tải được ghi chú và nhật ký cá nhân.");
  }
  const knowledgeNotes = knowledgeResult.data;

  return (
    <div className="page-stack personal-workspace-page personal-mobile-redesign">
      <PageHeader
        eyebrow="Cá nhân"
        title="Không gian riêng"
        description="Ghi chú, nhật ký, tài liệu tham khảo cá nhân và kết nối tài khoản. Công việc được quản lý tại Việc của tôi."
        icon="book-open"
      />
      {workspaceError ? (
        <p role="alert">Không tải được dữ liệu công việc/ghi chú cá nhân cũ. Vui lòng thử lại.</p>
      ) : (
        <div id="personal-workspace"><PersonalWorkspaceClient initialRows={(workspaceRows ?? []) as any} userId={user.id} highlightedItemId={item ?? null} /></div>
      )}
      <KnowledgeJournalClient initialNotes={(knowledgeNotes ?? []) as any} hasOrganization={!!user.organizationId} highlightedNoteId={note ?? null} />
      <details className="personal-account-settings">
        <summary>Cài đặt tài khoản và kênh thông báo</summary>
        <ZaloLinkClient initialZaloUserId={null} />
      </details>
    </div>
  );
}
