import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage(){
  return <main className="login-page">
    <section className="login-hero">
      <div className="login-hero-inner">
        <img className="login-brand-logo" src="/brand/qarica-logo-light.svg" alt="QARICA" />
        <div className="eyebrow">NỀN TẢNG QUẢN TRỊ CHẤT LƯỢNG</div>
        <h1>Chất lượng trong tầm kiểm soát</h1>
        <p className="login-slogan-en">Quality under control</p>
      </div>
    </section>
    <section className="login-panel"><Suspense fallback={<div className="login-card"><div className="empty-state">Đang tải...</div></div>}><LoginForm/></Suspense></section>
  </main>;
}
