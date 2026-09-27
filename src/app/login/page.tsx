import Image from "next/image";
import { Suspense } from "react";
import { ShieldCheck, TriangleAlert, FileWarning, FileCheck2, Users, BarChart3, Leaf } from "lucide-react";
import { LoginForm } from "@/components/login-form";

const ACRONYM = [
  { letter: "QA", label: "Quality Assurance", vi: "Đảm bảo chất lượng", icon: ShieldCheck, tone: "blue" },
  { letter: "R", label: "Risk", vi: "Quản lý rủi ro", icon: TriangleAlert, tone: "green" },
  { letter: "I", label: "Incident", vi: "Sự cố y khoa", icon: FileWarning, tone: "amber" },
  { letter: "C", label: "Compliance", vi: "Tuân thủ", icon: FileCheck2, tone: "purple" },
];

const BOTTOM_ROW = [
  { icon: Users, label: "An toàn người bệnh" },
  { icon: BarChart3, label: "Hiệu quả vận hành" },
  { icon: Leaf, label: "Phát triển bền vững" },
];

export default function LoginPage(){
  return <main className="login-page">
    <section className="login-hero">
      <div className="login-hero-decor" aria-hidden="true"></div>
      <p className="login-hero-quote">&ldquo;Vì an toàn người bệnh<br/>và chất lượng chăm sóc tốt hơn&rdquo;</p>
      <div className="login-hero-inner">
        <Image className="login-brand-logo" src="/brand/qarica-logo-light.svg" alt="QARICA" width={240} height={72} priority />
        <p className="login-tagline">QUALITY · RISK · INCIDENT · COMPLIANCE</p>
        <div className="eyebrow">NỀN TẢNG QUẢN TRỊ CHẤT LƯỢNG</div>
        <h1>Chất lượng trong tầm kiểm soát</h1>
        <p className="login-slogan-en">Quality under control</p>
        <p className="login-acronym-vi">QARICA – Hệ thống quản lý Đảm bảo chất lượng, Rủi ro – Sự cố – Tuân thủ, hỗ trợ tổ chức y tế vận hành an toàn, hiệu quả và bền vững.</p>
        <div className="login-feature-grid">
          {ACRONYM.map((item) => (
            <div key={item.label} className={`login-feature-card ${item.tone}`}>
              <span className="login-feature-icon"><item.icon size={18} /></span>
              <strong>{item.letter}<br/>{item.label}</strong>
              <span className="login-feature-vi">{item.vi}</span>
            </div>
          ))}
        </div>
        <div className="login-bottom-row">
          {BOTTOM_ROW.map((item) => (
            <span key={item.label}><item.icon size={14} /> {item.label}</span>
          ))}
        </div>
      </div>
    </section>
    <section className="login-panel">
      <div className="login-lang-select" aria-hidden="true">🌐 Tiếng Việt</div>
      <Suspense fallback={<div className="login-card"><div className="empty-state">Đang tải...</div></div>}><LoginForm/></Suspense>
    </section>
  </main>;
}
