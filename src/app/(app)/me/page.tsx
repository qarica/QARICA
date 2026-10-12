import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { KnowledgeJournalClient } from "@/components/knowledge-journal-client";
import { ZaloLinkClient } from "@/components/zalo-link-client";
import { requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function PersonalWorkspacePage() {
  const { user } = await requireUserContext();
  const supabase = await createClient();
  const [{ data, error: workspaceError }, { data: profile }, { data: knowledgeNotes }] = await Promise.all([
    supabase
      .from("personal_workspace_items")
      .select("id,item_type,title,content,category,due_at,status,completed_at,created_at,deleted_at")
      .eq("owner_user_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500),
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
        description="Tổng quan cá nhân, ghi chú kiến thức và kết nối tài khoản. Quản lý công việc tập trung tại Việc của tôi."
        icon="book-open"
      />
      {workspaceError ? (
        <div role="alert" className="alert error">
          Không thể tải công việc và ghi chú cá nhân. Dữ liệu chưa bị xóa; vui lòng thử tải lại trang hoặc liên hệ quản trị viên.
        </div>
      ) : (
        <section className="panel" style={{padding:16}}><h2>Công việc cá nhân</h2><p>Bạn có {(data ?? []).filter((r:any)=>r.item_type==="TASK"&&r.status==="OPEN").length} việc riêng đang mở trong không gian cá nhân cũ. Dữ liệu này vẫn được giữ nguyên để đối chiếu khi hợp nhất; không tạo việc mới tại đây.</p><Link className="button primary small" href="/tasks?tab=OPEN#all-work">Đến Việc của tôi</Link></section>
      )}
      <KnowledgeJournalClient initialNotes={(knowledgeNotes ?? []) as any} hasOrganization={!!user.organizationId} />
      <ZaloLinkClient initialZaloUserId={profile?.zalo_user_id ?? null} />
    </div>
  );
}
