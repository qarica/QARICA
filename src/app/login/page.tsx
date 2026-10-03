import Image from "next/image";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage(){
  return <main className="login-page">
    <section className="login-hero">
      <div className="login-hero-decor" aria-hidden="true"></div>
      <div className="login-hero-inner">
        <div className="login-brand-row">
          <Image src="/brand/qarica-mark-v2.svg" alt="" width={56} height={56} priority aria-hidden="true" />
          <strong className="login-brand-word">QARICA</strong>
        </div>
        <p className="login-tagline">QUALITY · RISK · INCIDENT · COMPLIANCE</p>
      </div>
    </section>
    <section className="login-panel">
      <div className="login-hero-decor login-panel-decor" aria-hidden="true"></div>
      <div className="login-lang-select" aria-hidden="true">🌐 Tiếng Việt</div>
      <Suspense fallback={<div className="login-card"><div className="empty-state">Đang tải...</div></div>}><LoginForm/></Suspense>
    </section>
  </main>;
}
