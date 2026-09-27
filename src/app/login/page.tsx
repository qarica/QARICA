import Image from "next/image";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage(){
  return <main className="login-page">
    <section className="login-hero">
      <div className="login-hero-decor" aria-hidden="true"></div>
      <div className="login-hero-inner">
        <Image className="login-brand-logo" src="/brand/qarica-logo-light.svg" alt="QARICA" width={240} height={72} priority />
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
