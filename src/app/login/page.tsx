import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage(){
  return <main className="login-page">
    <section className="login-hero login-hero-orbits">
      <div className="login-orbit orbit-a" aria-hidden="true" /><div className="login-orbit orbit-b" aria-hidden="true" /><div className="login-orbit orbit-c" aria-hidden="true" /><div className="login-hero-inner">
        <img className="login-brand-logo" src="/brand/qarica-logo-light-v2.svg" alt="QARICA" />
        <div className="login-accent" aria-hidden="true" />
        <h1 className="login-brand-expansion">
          <span>Quality Assurance,</span>
          <span>Risk, Improvement <em>&amp;</em></span>
          <span>Corrective Action</span>
        </h1>
        <div className="login-feature-row"><span>✓ <b>Assure Quality</b></span><span>▥ <b>Manage Risks</b></span><span>⚙ <b>Drive Improvement</b></span></div>
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
      .login-brand-logo{width:min(540px,72%);height:auto}
      .login-accent{width:64px;height:3px;border-radius:999px;background:#38dbe8;margin:30px 0 20px}
      .login-brand-expansion{max-width:760px;margin:0;font-size:clamp(44px,4.6vw,70px);line-height:1.04;letter-spacing:-.035em}
      .login-feature-row{display:flex;gap:42px;margin-top:42px;flex-wrap:wrap}
      .login-feature-row span{display:flex;align-items:center;gap:10px;color:#d8eef6;font-size:14px}
      .login-feature-row span:first-letter{color:#38dbe8}
      .login-feature-row b{font-weight:600}
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
        .login-accent{margin:16px 0 12px;width:46px}
        .login-feature-row{display:none}
        .login-hero .eyebrow{margin-top:16px;font-size:10px;letter-spacing:.16em}
        .login-brand-expansion{margin:10px 0 0;font-size:clamp(25px,8vw,38px);line-height:1.08}
        .login-panel{padding:18px 14px 28px}
      }
    `}</style>
  </main>;
}
