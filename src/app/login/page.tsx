import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage(){
  return <main className="login-page">
    <section className="login-hero login-hero-orbits">
      <div className="login-orbit orbit-a" aria-hidden="true" /><div className="login-orbit orbit-b" aria-hidden="true" /><div className="login-orbit orbit-c" aria-hidden="true" /><div className="login-hero-inner">
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
      .login-hero-orbits{position:relative;overflow:hidden;isolation:isolate}
      .login-hero-inner{position:relative;z-index:2}
      .login-orbit{position:absolute;z-index:1;border:1px solid rgba(111,226,217,.18);border-radius:50%;pointer-events:none}
      .orbit-a{width:620px;height:620px;left:-230px;top:-260px}
      .orbit-b{width:820px;height:820px;left:-330px;top:-360px;border-color:rgba(111,226,217,.12)}
      .orbit-c{width:720px;height:720px;right:-470px;bottom:-440px;border-color:rgba(255,255,255,.08)}
      .login-brand-expansion{max-width:760px}
      .login-brand-expansion span{display:block}
      .login-brand-expansion em{font-style:normal;color:#38dbe8}
      @media(max-width:760px){
        .login-page{min-height:100dvh}
        .login-hero-orbits{overflow:hidden}
        .orbit-a{width:300px;height:300px;left:-155px;top:-135px}
        .orbit-b{width:390px;height:390px;left:-210px;top:-180px}
        .orbit-c{width:330px;height:330px;right:-230px;bottom:-220px}
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
