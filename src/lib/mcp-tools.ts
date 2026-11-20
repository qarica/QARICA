import type { SupabaseClient } from "@supabase/supabase-js";

// Định nghĩa + thực thi các "tool" MCP — mỗi tool nhận 1 Supabase client đã
// đại diện ĐÚNG người dùng (xem userScopedClientFromMcpToken), nên mọi
// .from()/.rpc() ở đây tự động tôn trọng RLS giống hệt họ tự thao tác trên
// web, KHÔNG viết lại logic quyền hạn riêng cho MCP (CLAUDE.md nguyên tắc
// 2: 1 nghiệp vụ chỉ 1 nguồn sự thật).

export type McpToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export const MCP_TOOLS: McpToolDef[] = [
  {
    name: "list_personal_notes",
    description: "Liệt kê Note cá nhân (việc cần làm) của người dùng hiện tại trong QARICA.",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", enum: ["OPEN", "COMPLETED", "CANCELLED", "ALL"], description: "Lọc theo trạng thái, mặc định OPEN" } },
    },
  },
  {
    name: "create_personal_note",
    description: "Tạo 1 Note cá nhân (việc cần làm) mới cho người dùng hiện tại.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Tiêu đề việc cần làm (bắt buộc)" },
        note: { type: "string", description: "Ghi chú chi tiết (tùy chọn)" },
        due_at: { type: "string", description: "Hạn xử lý, định dạng ISO date/datetime (tùy chọn)" },
        priority: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"], description: "Mức ưu tiên, mặc định NORMAL" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_personal_note_status",
    description: "Đổi trạng thái 1 Note cá nhân (vd đánh dấu đã hoàn thành).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "id của note" }, status: { type: "string", enum: ["OPEN", "COMPLETED", "CANCELLED"] } },
      required: ["id", "status"],
    },
  },
  {
    name: "delete_personal_note",
    description: "Xoá 1 Note cá nhân.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "list_my_assigned_tasks",
    description: "Liệt kê công việc (vw_actions_dashboard) được giao TRỰC TIẾP cho người dùng hiện tại — chưa gồm việc giao theo nhóm/khoa phòng.",
    inputSchema: {
      type: "object",
      properties: { work_year: { type: "number", description: "Năm công tác, mặc định năm hiện tại theo QARICA" } },
    },
  },
];

const PERSONAL_REMINDER_SELECT = "id,title,note,due_at,priority,status,category,completed_at,created_at,updated_at";
const ACTION_SELECT = "action_id,record_id,record_code,title,work_year,workflow_status,priority,due_date,is_overdue,days_to_due";

export async function callMcpTool(supabase: SupabaseClient, userId: string, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "list_personal_notes": {
      const status = typeof args.status === "string" ? args.status : "OPEN";
      let query = supabase.from("personal_reminders").select(PERSONAL_REMINDER_SELECT).eq("owner_user_id", userId).order("due_at", { ascending: true, nullsFirst: false });
      if (status !== "ALL") query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    }
    case "create_personal_note": {
      const title = String(args.title || "").trim();
      if (!title) throw new Error("Thiếu title.");
      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("user_id", userId).maybeSingle();
      if (!profile?.organization_id) throw new Error("Tài khoản chưa gắn bệnh viện.");
      const dueAt = args.due_at ? new Date(String(args.due_at)) : null;
      if (dueAt && Number.isNaN(dueAt.getTime())) throw new Error("due_at không hợp lệ.");
      const priority = typeof args.priority === "string" && ["LOW", "NORMAL", "HIGH", "URGENT"].includes(args.priority) ? args.priority : "NORMAL";
      const { data, error } = await supabase
        .from("personal_reminders")
        .insert({
          organization_id: profile.organization_id,
          owner_user_id: userId,
          title,
          note: args.note ? String(args.note).trim() || null : null,
          due_at: dueAt ? dueAt.toISOString() : null,
          priority,
        })
        .select(PERSONAL_REMINDER_SELECT)
        .single();
      if (error) throw new Error(error.message);
      return data;
    }
    case "update_personal_note_status": {
      const id = String(args.id || "");
      const status = String(args.status || "");
      if (!id || !["OPEN", "COMPLETED", "CANCELLED"].includes(status)) throw new Error("Thiếu id hoặc status không hợp lệ.");
      const completedAt = status === "COMPLETED" ? new Date().toISOString() : null;
      const { data, error } = await supabase
        .from("personal_reminders")
        .update({ status, completed_at: completedAt, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("owner_user_id", userId)
        .select(PERSONAL_REMINDER_SELECT)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Không tìm thấy note này.");
      return data;
    }
    case "delete_personal_note": {
      const id = String(args.id || "");
      if (!id) throw new Error("Thiếu id.");
      const { error, count } = await supabase.from("personal_reminders").delete({ count: "exact" }).eq("id", id).eq("owner_user_id", userId);
      if (error) throw new Error(error.message);
      if (!count) throw new Error("Không tìm thấy note này.");
      return { ok: true };
    }
    case "list_my_assigned_tasks": {
      let query = supabase.from("vw_actions_dashboard").select(ACTION_SELECT).eq("assignee_user_id", userId).order("due_date", { ascending: true, nullsFirst: false });
      if (typeof args.work_year === "number") query = query.eq("work_year", args.work_year);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    }
    default:
      throw new Error(`Không rõ tool: ${name}`);
  }
}
