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
        <div className="login-feature-row"><span><i>♢</i><b>Assure<br/>Quality</b></span><span><i>▥</i><b>Manage<br/>Risks</b></span><span><i>⚙</i><b>Drive<br/>Improvement</b></span></div>
      </div>
    </section>
    <section className="login-panel"><Suspense fallback={<div className="login-card"><div className="empty-state">Đang tải...</div></div>}><LoginForm/></Suspense></section>
    <style>{`
      .login-hero-orbits{position:relative;overflow:hidden;isolation:isolate;background:radial-gradient(circle at 88% 10%,rgba(20,157,196,.22),transparent 30%),linear-gradient(145deg,#071c39 0%,#082746 55%,#064d69 115%)}
      .login-hero-inner{position:relative;z-index:2;width:min(760px,82%)}
      .login-orbit{position:absolute;z-index:1;border-radius:50%;pointer-events:none}
      .orbit-a{width:520px;height:520px;right:-255px;top:-300px;left:auto;border:1px solid rgba(49,218,230,.34);box-shadow:0 0 0 70px rgba(29,166,201,.12),0 0 0 140px rgba(29,166,201,.08)}
      .orbit-b{width:520px;height:520px;left:-390px;bottom:-315px;top:auto;border:1px solid rgba(49,218,230,.26);box-shadow:0 0 0 70px rgba(29,166,201,.12)}
      .orbit-c{width:540px;height:540px;right:-365px;bottom:-350px;border:1px solid rgba(49,218,230,.42);box-shadow:0 0 0 65px rgba(29,166,201,.13),0 0 0 125px rgba(29,166,201,.08)}
      .login-brand-logo{width:min(560px,76%);height:auto;filter:none}
      .login-accent{width:64px;height:3px;border-radius:999px;background:#3ce2e9;margin:30px 0 20px}
      .login-brand-expansion{max-width:760px;margin:0;font-size:clamp(44px,4.55vw,68px);line-height:1.04;letter-spacing:-.035em}
      .login-brand-expansion span{display:block}
      .login-brand-expansion em{font-style:normal;color:#38e1e8}
      .login-feature-row{display:grid;grid-template-columns:repeat(3,max-content);gap:58px;margin-top:42px;align-items:center}
      .login-feature-row span{display:grid;grid-template-columns:54px max-content;align-items:center;gap:14px;color:#e3f0f6;font-size:14px}
      .login-feature-row i{width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:24px;color:#38e1e8;background:radial-gradient(circle at 50% 35%,rgba(35,213,226,.25),rgba(6,58,92,.82));border:1px solid rgba(61,218,229,.18);box-shadow:0 0 22px rgba(20,184,210,.16)}
      .login-feature-row b{font-weight:500;line-height:1.45}
      @media(max-width:1100px){
        .login-hero{display:none!important}
        .login-panel{min-height:100dvh;padding:18px!important}
        .login-card{width:min(430px,100%)}
      }
    `}</style>
  </main>;
}
