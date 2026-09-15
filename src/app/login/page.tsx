import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage(){
  return <main className="login-page">
    <section className="login-hero">
      <div className="login-hero-inner">
        <img className="login-brand-logo" src="/brand/qlcl-logo-light.svg" alt="QLCL TQM" />
        <div className="eyebrow">QUALITY MANAGEMENT HUB</div>
        <h1>Quản lý chất lượng thông minh</h1>
        <p>Hệ thống quản lý chất lượng bệnh viện: kế hoạch, chỉ số, giám sát, sự cố, CAPA, rủi ro, tự đánh giá và cải tiến trên một nền tảng thống nhất.</p>
        <div className="login-feature-grid"><div><strong>01</strong><span>Việc của tôi & nhắc hạn</span></div><div><strong>02</strong><span>Dashboard trực quan</span></div><div><strong>03</strong><span>Truy vết đến hồ sơ gốc</span></div></div>
      </div>
    </section>
    <section className="login-panel"><Suspense fallback={<div className="login-card"><div className="empty-state">Đang tải...</div></div>}><LoginForm/></Suspense></section>
  </main>;
}
