import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage(){
  return <main className="login-page">
    <section className="login-hero">
      <div className="login-hero-inner">
        <img className="login-brand-logo" src="/brand/qarica-logo-light.svg" alt="QARICA" />
        <div className="eyebrow">NỀN TẢNG QUẢN TRỊ CHẤT LƯỢNG</div>
        <h1>Chất lượng trong tầm kiểm soát.</h1>
        <p>Quản trị kế hoạch, chỉ số, giám sát, sự cố, CAPA, rủi ro, đánh giá, audit và cải tiến trên một nền tảng thống nhất.</p>
        <div className="login-feature-grid"><div><strong>01</strong><span>Việc của tôi & nhắc hạn</span></div><div><strong>02</strong><span>Dashboard trực quan</span></div><div><strong>03</strong><span>Truy vết đến hồ sơ gốc</span></div></div>
      </div>
    </section>
    <section className="login-panel"><Suspense fallback={<div className="login-card"><div className="empty-state">Đang tải...</div></div>}><LoginForm/></Suspense></section>
  </main>;
}
