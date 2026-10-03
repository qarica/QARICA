import Link from "next/link";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { PersonalReminders } from "@/components/personal-reminders";
import { RECORD_TYPE_LABEL } from "@/components/record-traceability-panel";
import { StatusBadge } from "@/components/status-badge";
import { requirePermission, requireUserContext } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { isOperationallyHiddenStatus } from "@/lib/operational-record";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";

// Projection thuần đọc của "Việc của tôi" trong ngữ cảnh Lịch QLCL.
// Cùng nguồn dữ liệu thật với /tasks (Action được giao trực tiếp + Nhắc việc cá nhân);
// không tạo bảng/nguồn dữ liệu song song, chỉ là một góc nhìn khác trên cùng dữ liệu.
function priorityLabel(value?: string | null) { if (value === "CRITICAL") return "Rất khẩn"; if (value === "URGENT") return "Khẩn"; if (value === "HIGH") return "Cao"; if (value === "LOW") return "Thấp"; return "Bình thường"; }
function priorityTone(value?: string | null) { if (["CRITICAL", "URGENT"].includes(String(value))) return "danger"; if (value === "HIGH") return "warning"; if (value === "LOW") return "muted"; return "info"; }
function dateOnly(value: string) { return value.length > 10 ? value.slice(0, 10) : value; }
function hcmToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()); }

export default async function CalendarMyWorkPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { user } = await requireUserContext();
  requirePermission(user, "tasks.view");
  const year = await getWorkYear();
  const supabase = await createClient();
  const { tab: rawTab, q: rawQ } = await searchParams;
  const tab = (["ALL", "ASSIGNED", "REMINDER", "DONE"].includes(String(rawTab).toUpperCase()) ? String(rawTab).toUpperCase() : "ALL") as "ALL" | "ASSIGNED" | "REMINDER" | "DONE";
  const searchQuery = String(rawQ || "").trim();
  const today = hcmToday();

  const [actionsRes, personalRemindersRes] = await Promise.all([
    supabase.from("vw_actions_dashboard").select("action_id,record_id,record_code,title,work_year,workflow_status,priority,due_date,is_overdue,days_to_due").eq("work_year", year).eq("assignee_user_id", user.id).order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("personal_reminders").select("id,title,note,due_at,priority,status").eq("owner_user_id", user.id).neq("status", "CANCELLED").order("due_at", { ascending: true, nullsFirst: false }),
  ]);
  const sourceRows = ((actionsRes.data ?? []) as any[]).filter((r) => r.workflow_status !== "CANCELLED");
  const recordIds = Array.from(new Set(sourceRows.map((r) => r.record_id).filter(Boolean)));
  const recordRes = recordIds.length ? await supabase.from("records").select("id,lifecycle_status,record_type").in("id", recordIds) : { data: [], error: null };
  const hidden = new Set(((recordRes.data ?? []) as any[]).filter((r) => isOperationallyHiddenStatus(r.lifecycle_status)).map((r) => r.id));
  const recordTypeMap = new Map(((recordRes.data ?? []) as any[]).map((r) => [r.id, r.record_type]));
  const rows = sourceRows.filter((r) => !hidden.has(r.record_id));
  const personalReminders = (personalRemindersRes.data ?? []) as any[];
  const firstError = actionsRes.error || personalRemindersRes.error || recordRes.error;

  type Row = { key: string; title: string; typeLabel: string; priority: string | null; dueDate: string | null; statusLabel: string; isOverdue: boolean; isDone: boolean; href: string };
  const assignedRows: Row[] = rows.map((r) => ({ key: `a-${r.action_id}`, title: r.title, typeLabel: RECORD_TYPE_LABEL[recordTypeMap.get(r.record_id) || ""] || "—", priority: r.priority, dueDate: r.due_date, statusLabel: r.is_overdue ? "OVERDUE" : r.workflow_status, isOverdue: !!r.is_overdue, isDone: r.workflow_status === "COMPLETED", href: `/tasks/${r.record_id}` }));
  const reminderRows: Row[] = personalReminders.map((p) => ({ key: `p-${p.id}`, title: p.title, typeLabel: "Note cá nhân", priority: p.priority, dueDate: p.due_at ? dateOnly(p.due_at) : null, statusLabel: p.status === "COMPLETED" ? "COMPLETED" : (p.due_at && dateOnly(p.due_at) < today ? "OVERDUE" : p.status), isOverdue: p.status === "OPEN" && !!p.due_at && dateOnly(p.due_at) < today, isDone: p.status === "COMPLETED", href: "/calendar/my-work" }));
  const allRows = [...assignedRows, ...reminderRows].sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const byTab = tab === "ASSIGNED" ? assignedRows : tab === "REMINDER" ? reminderRows : tab === "DONE" ? allRows.filter((r) => r.isDone) : allRows;
  const filtered = searchQuery ? byTab.filter((r) => r.title.toLowerCase().includes(searchQuery.toLowerCase())) : byTab;
  const tabHref = (t: string) => `?tab=${t}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`;

  return <div className="page-stack calendar-my-work-page">
    <style>{`
      .calendar-my-work-page .work-tabs{display:flex;gap:6px;flex-wrap:wrap;padding:12px 16px 0}.calendar-my-work-page .work-tab{display:inline-flex;align-items:center;min-height:32px;padding:0 12px;border-radius:999px;font-size:11px;font-weight:800;color:#52656d;border:1px solid #d7e1e5;background:#fff;text-decoration:none}.calendar-my-work-page .work-tab.active{background:#2563eb;border-color:#2563eb;color:#fff}
      .calendar-my-work-page .work-search-row{display:flex;gap:8px;align-items:center;padding:10px 16px}.calendar-my-work-page .work-search-row .search-box{flex:1;max-width:280px}
    `}</style>
    <PageHeader eyebrow={`LỊCH QLCL · ${year}`} title="Việc của tôi (trong Lịch QLCL)" description="Danh sách việc được giao và nhắc việc cá nhân có hạn đến hạn. Cùng dữ liệu với Việc của tôi; đây chỉ là một góc nhìn khác gắn với Lịch." icon="inbox" actions={<Link className="button secondary" href="/tasks">Mở Việc của tôi đầy đủ →</Link>} />
    {firstError ? <div className="alert error">Một phần dữ liệu chưa tải được: {firstError.message}</div> : null}

    <PersonalReminders initialRows={personalReminders} organizationId={user.organizationId!} userId={user.id} />

    <section className="panel">
      <nav className="work-tabs" aria-label="Lọc việc">
        <Link href={tabHref("ALL")} className={`work-tab ${tab === "ALL" ? "active" : ""}`}>Tất cả · {allRows.length}</Link>
        <Link href={tabHref("ASSIGNED")} className={`work-tab ${tab === "ASSIGNED" ? "active" : ""}`}>Công việc được giao · {assignedRows.length}</Link>
        <Link href={tabHref("REMINDER")} className={`work-tab ${tab === "REMINDER" ? "active" : ""}`}>Nhắc việc cá nhân · {reminderRows.length}</Link>
        <Link href={tabHref("DONE")} className={`work-tab ${tab === "DONE" ? "active" : ""}`}>Đã hoàn thành · {allRows.filter((r) => r.isDone).length}</Link>
      </nav>
      <form method="get" className="work-search-row">
        <input type="hidden" name="tab" value={tab} />
        <div className="search-box"><Icon name="search" size={16} /><input name="q" defaultValue={searchQuery} placeholder="Tìm công việc..." /></div>
        <button type="submit" className="button secondary small">Lọc</button>
      </form>
      <div className="table-wrap"><table><thead><tr><th>#</th><th>Nội dung</th><th>Loại</th><th>Ưu tiên</th><th>Hạn xử lý</th><th>Trạng thái</th></tr></thead><tbody>
        {filtered.map((r, idx) => <tr key={r.key}><td>{idx + 1}</td><td><Link className="table-link" href={r.href}>{r.title}</Link></td><td>{r.typeLabel}</td><td><span className={`status-badge ${priorityTone(r.priority)}`}>{priorityLabel(r.priority)}</span></td><td className={r.isOverdue ? "text-danger" : ""}>{r.dueDate ? formatDate(r.dueDate) : "—"}</td><td><StatusBadge status={r.statusLabel} /></td></tr>)}
        {!filtered.length ? <tr><td colSpan={6}><div className="empty-state">Không có việc phù hợp.</div></td></tr> : null}
      </tbody></table></div>
    </section>
  </div>;
}
