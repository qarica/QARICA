import { redirect } from "next/navigation";

// "Việc của tôi" chỉ còn một trang duy nhất là /tasks (một nguồn sự thật).
// Giữ route này để dấu trang/liên kết cũ không bị 404.
export default function CalendarMyWorkRedirect() {
  redirect("/tasks");
}
