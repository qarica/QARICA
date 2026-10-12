import { AiBrainClient } from "@/components/ai-brain-client";
import { PageHeader } from "@/components/page-header";
import { KnowledgeJournalClient } from "@/components/knowledge-journal-client";
import { ZaloLinkClient } from "@/components/zalo-link-client";
import { requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function PersonalWorkspacePage() {
  const { user } = await requireUserContext();
  const supabase = await createClient();
  const [{ data: profile }, { data: knowledgeNotes }] = await Promise.all([
    supabase.from("profiles").select("zalo_user_id").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("knowledge_notes")
      .select("id,note_type,visibility,title,content,journal_date,status,source_kind,created_at")
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <div className="page-stack personal-workspace-page">
      <PageHeader
        eyebrow="Cá nhân"
        title="Không gian riêng"
        description="Ghi chú, nhật ký, tài liệu tham khảo cá nhân và kết nối tài khoản. Công việc được quản lý tại Việc của tôi."
        icon="book-open"
      />
      <AiBrainClient />
      <KnowledgeJournalClient initialNotes={(knowledgeNotes ?? []) as any} hasOrganization={!!user.organizationId} />
      <ZaloLinkClient initialZaloUserId={profile?.zalo_user_id ?? null} />
    </div>
  );
}
