// Splash hiển thị trong lúc route/layout gốc đang tải (Next.js Suspense fallback tự
// động bọc children của app/layout.tsx). Đây KHÔNG phải màn hình splash gốc của hệ
// điều hành khi mở PWA đã cài đặt — màn hình đó do Android/Chrome tự dựng từ
// icon + tên + background_color trong manifest (xem src/app/manifest.ts), không thể
// nhúng wordmark/tagline/wave vào đó bằng web tech thuần. Component này phủ trải
// nghiệm splash đầy đủ cho các lượt tải trong trình duyệt/PWA sau khi JS đã chạy.
export default function RootLoading() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 22,
        background: "#ffffff",
        position: "relative",
        overflow: "hidden",
        padding: "24px",
      }}
    >
      <svg width="88" height="88" viewBox="0 0 128 128" role="img" aria-label="QARICA">
        <defs>
          <linearGradient id="qarica-splash-grad" x1="18" y1="14" x2="112" y2="112" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#0b1e46" />
            <stop offset="0.38" stopColor="#1450c9" />
            <stop offset="0.7" stopColor="#22d3ee" />
            <stop offset="1" stopColor="#2dd4bf" />
          </linearGradient>
        </defs>
        <path d="M84 29.36 A40 40 0 1 1 44 29.36" fill="none" stroke="url(#qarica-splash-grad)" strokeWidth="16" strokeLinecap="round" />
        <path d="M75.31 75.31 L106.43 106.43" fill="none" stroke="url(#qarica-splash-grad)" strokeWidth="16" strokeLinecap="round" />
      </svg>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <strong style={{ fontSize: 26, fontWeight: 800, letterSpacing: "0.02em", color: "#0b1e46" }}>QARICA</strong>
        <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.22em", color: "#5b6b82", textTransform: "uppercase" }}>
          Quality · Safety · Improvement
        </span>
      </div>
      <svg
        aria-hidden="true"
        viewBox="0 0 400 120"
        preserveAspectRatio="none"
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: "18vh", minHeight: 90, maxHeight: 160, opacity: 0.5 }}
      >
        <path d="M0 70 C 80 30, 160 100, 240 55 S 360 20, 400 50 L400 120 L0 120 Z" fill="#e6f7f8" />
        <path d="M0 90 C 90 55, 170 115, 260 78 S 370 45, 400 75 L400 120 L0 120 Z" fill="#eaf2ff" />
      </svg>
    </div>
  );
}
