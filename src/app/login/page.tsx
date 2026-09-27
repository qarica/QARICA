import Image from "next/image";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

const ACRONYM = [
  { letter: "QA", label: "Quality Assurance", vi: "Đảm bảo chất lượng" },
  { letter: "R", label: "Risk", vi: "Quản lý rủi ro" },
  { letter: "I", label: "Incident", vi: "Sự cố y khoa" },
  { letter: "C", label: "Compliance", vi: "Tuân thủ" },
];

export default function LoginPage(){
  return <main className="login-page">
    <section className="login-hero">
      <div className="login-hero-decor" aria-hidden="true"></div>
      <div className="login-hero-inner">
        <Image className="login-brand-logo" src="/brand/qarica-logo-light.svg" alt="QARICA" width={240} height={72} priority />
        <div className="eyebrow">NỀN TẢNG QUẢN TRỊ CHẤT LƯỢNG</div>
        <h1>Chất lượng trong tầm kiểm soát</h1>
        <p className="login-slogan-en">Quality under control</p>
        <p className="login-acronym">QARICA — Quality Assurance, Risk, Incident &amp; Compliance Application</p>
        <p className="login-acronym-vi">Hệ thống quản lý Đảm bảo chất lượng – Rủi ro – Sự cố – Tuân thủ</p>
        <div className="login-feature-grid">
          {ACRONYM.map((item) => (
            <div key={item.label}>
              <strong>{item.letter} · {item.label}</strong>
              <span>{item.vi}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
    <section className="login-panel"><Suspense fallback={<div className="login-card"><div className="empty-state">Đang tải...</div></div>}><LoginForm/></Suspense></section>
  </main>;
}
