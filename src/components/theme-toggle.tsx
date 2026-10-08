"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";

const STORAGE_KEY = "qlcl-theme";

// Đọc giá trị do inline script trong layout.tsx đã set lên <html data-theme>
// TRƯỚC khi React hydrate (tránh FOUC: nhấp nháy sáng rồi mới tối) — component
// này chỉ đồng bộ lại state hiển thị của nút, không phải nguồn quyết định ban đầu.
function currentTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }

  return (
    <button
      type="button"
      className="icon-button header-icon theme-toggle"
      onClick={toggle}
      title={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
      aria-label={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
    </button>
  );
}
