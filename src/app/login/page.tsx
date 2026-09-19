import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage(){
  return <main className="login-page">
    <section className="login-hero">
      <div className="login-hero-inner">
        <img className="login-brand-logo" src="/brand/qarica-logo-light-v2.svg" alt="QARICA" />
        <div className="eyebrow">QUALITY MANAGEMENT PLATFORM</div>
        <h1 className="login-brand-expansion">
          <span>Quality Assurance,</span>
          <span>Risk, Improvement <em>&amp;</em></span>
          <span>Corrective Action</span>
        </h1>
      </div>
    </section>
    <section className="login-panel"><Suspense fallback={<div className="login-card"><div className="empty-state">Đang tải...</div></div>}><LoginForm/></Suspense></section>
    <style>{`
      .login-brand-expansion{max-width:760px}
      .login-brand-expansion span{display:block}
      .login-brand-expansion em{font-style:normal;color:#38dbe8}
      @media(max-width:760px){
        .login-page{min-height:100dvh}
        .login-hero{display:block;padding:22px 20px 18px;min-height:auto}
        .login-hero-inner{max-width:none}
        .login-brand-logo{max-width:190px}
        .login-hero .eyebrow{margin-top:16px;font-size:10px;letter-spacing:.16em}
        .login-brand-expansion{margin:10px 0 0;font-size:clamp(25px,8vw,38px);line-height:1.08}
        .login-panel{padding:18px 14px 28px}
      }
    `}</style>
  </main>;
}
