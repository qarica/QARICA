"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ login, password }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload?.ok) {
        setError(
          payload?.error ||
            "Tài khoản hoặc mật khẩu không đúng, hoặc tài khoản chưa được kích hoạt.",
        );
        setLoading(false);
        return;
      }

      router.replace(search.get("next") || "/dashboard");
      router.refresh();
    } catch {
      setError("Không thể kết nối máy chủ đăng nhập. Vui lòng thử lại.");
      setLoading(false);
    }
  }

  return (
    <form className="login-card" onSubmit={submit}>
      <div className="mobile-brand"><img src="/brand/qarica-logo.svg" alt="QARICA" /></div>

      <div>
        <div className="eyebrow">ĐĂNG NHẬP QARICA</div>
        <h2>Chào mừng trở lại</h2>
        <p className="muted">
          Sử dụng tài khoản và mật khẩu do quản trị viên cấp. Không bắt buộc email.
        </p>
      </div>

      <label>
        <span>Tài khoản</span>
        <input
          type="text"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="Ví dụ: ten.nguoidung hoặc qarica01"
          autoComplete="username"
          required
        />
      </label>

      <label>
        <span>Mật khẩu</span>
        <div className="password-wrap">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            className="icon-button ghost"
            onClick={() => setShowPassword((v) => !v)}
            aria-label="Hiện/ẩn mật khẩu"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </label>

      {error ? <div className="alert error">{error}</div> : null}

      <button className="button primary wide" type="submit" disabled={loading}>
        {loading ? (
          <>
            <LoaderCircle className="spin" size={18} /> Đang đăng nhập...
          </>
        ) : (
          "Đăng nhập"
        )}
      </button>

      <p className="tiny muted center">
        Dữ liệu truy cập được kiểm soát theo vai trò, quyền và phạm vi được phân công.<br />
        © 2026 Trần Trường Vinh · QARICA. All rights reserved.
      </p>
    </form>
  );
}
