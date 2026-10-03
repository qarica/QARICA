import { PageHeader } from "@/components/page-header";
import { PersonalWorkspaceClient } from "@/components/personal-workspace-client";
import { requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function PersonalWorkspacePage() {
  const { user } = await requireUserContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("personal_workspace_items")
    .select("id,item_type,title,content,category,due_at,status,completed_at,created_at")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="page-stack personal-workspace-page">
      <PageHeader
        eyebrow="Cá nhân"
        title="Không gian riêng"
        description="Việc cần làm và ghi chú của riêng bạn — không gắn với bất kỳ tổ chức/bệnh viện nào, luôn theo bạn dù chuyển nơi làm việc."
        icon="book-open"
      />
      <PersonalWorkspaceClient initialRows={(data ?? []) as any} userId={user.id} />
    </div>
  );
}
