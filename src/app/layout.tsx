import type { Metadata, Viewport } from "next";
import { Nunito_Sans } from "next/font/google";
import "./globals.css";
import "./transitions.css";
import "./qlvb-font.css";
import "./qlvb-theme.css";
import "./module-modern.css";
import "./domain-detail.css";
import "./domain-create.css";
import "./brand-overrides.css";
import "./monitoring-print-compact.css";
import "./workspace-shell.css";
import "./qarica-design-system.css";
import "./qarica-readability.css";
import "./qarica-copy.css";
import "./qarica-direct-navigation.css";
import "./qms-enterprise-redesign.css";

const appFont = Nunito_Sans({ subsets:["latin","vietnamese"],weight:["400","500","600","700","800"],display:"swap",variable:"--font-app" });
const criticalCss=`
  html,body,body *{font-family:var(--font-app),"Nunito Sans","Segoe UI",Arial,sans-serif!important}
  .brand-logo-wrap{width:42px!important;height:42px!important;min-width:42px!important;max-width:42px!important;overflow:hidden!important;flex:0 0 42px!important}
  .brand-logo-img{width:42px!important;height:42px!important;max-width:42px!important;max-height:42px!important;object-fit:contain!important;display:block!important}
  .workspace-app .brand-mark{width:44px!important;height:44px!important;min-width:44px!important;background:transparent!important;overflow:visible!important}
  .workspace-app .brand-mark img{content:url("/brand/qarica-mark-v2.svg")!important;width:44px!important;height:44px!important;display:block!important;object-fit:contain!important}
  .sidebar.collapsed{width:72px!important}
  .main-shell.sidebar-collapsed{margin-left:72px!important}
  .sidebar.collapsed .sidebar-brand{padding:14px 10px!important;justify-content:center!important;gap:0!important}
  .sidebar.collapsed .sidebar-brand-copy,.sidebar.collapsed .nav-label,.sidebar.collapsed .nav-link-label,.sidebar.collapsed .sidebar-footer{display:none!important}
  .sidebar.collapsed .sidebar-nav{padding:10px 8px 82px!important}
  .sidebar.collapsed .nav-section{margin-bottom:8px!important}
  .sidebar.collapsed .nav-link{position:relative!important;justify-content:center!important;gap:0!important;margin:2px 0!important;padding:10px 8px!important;min-height:42px!important}
  .sidebar.collapsed .nav-link svg{margin:0!important;flex:0 0 auto!important}
  .sidebar.collapsed .sidebar-collapse{position:absolute!important;top:20px!important;right:-13px!important;bottom:auto!important;width:28px!important;height:28px!important;margin:0!important;z-index:60!important;background:#fff!important;border:1px solid #cbd5e1!important;box-shadow:0 4px 12px rgba(15,23,42,.14)!important}
  .sidebar.collapsed .brand-mark{width:38px!important;height:38px!important;min-width:38px!important}
  .sidebar.collapsed .brand-mark img{width:38px!important;height:38px!important}
  .button.primary{background:#315f91!important;border-color:#315f91!important;color:#fff!important;box-shadow:0 5px 14px rgba(49,95,145,.18)!important}
  .button.primary:hover:not(:disabled){background:#244d79!important;border-color:#244d79!important;transform:translateY(-1px)}
  .page-actions .button.primary,.toolbar .button.primary{background:#315f91!important;border-color:#315f91!important}
  .button.secondary{border-color:#cbd8e6!important;color:#294c73!important;background:#f8fbff!important}
  .button.secondary:hover:not(:disabled){background:#edf4fb!important;border-color:#9eb7d0!important}
  .login-logo{width:96px!important;height:96px!important;max-width:96px!important;object-fit:contain!important}
  .login-brand-logo{content:url("/brand/qarica-logo-light-v2.svg")!important;width:min(390px,100%)!important;height:auto!important;display:block!important}
  .mobile-brand img{content:url("/brand/qarica-logo-v2.svg")!important;width:118px!important;height:auto!important;display:block!important}
  @media(max-width:860px){
    .sidebar.collapsed{width:266px!important}
    .main-shell.sidebar-collapsed{margin-left:0!important}
    .sidebar.collapsed .sidebar-collapse{display:none!important}
    .sidebar.collapsed .sidebar-brand-copy,.sidebar.collapsed .nav-label,.sidebar.collapsed .nav-link-label,.sidebar.collapsed .sidebar-footer{display:flex!important}
    .sidebar.collapsed .nav-label{display:block!important}
    .sidebar.collapsed .nav-link{justify-content:flex-start!important;gap:11px!important;padding:10px 12px!important}
  }
  @media print{@page{size:A4;margin:20mm 20mm 20mm 30mm!important}}
`;
export const metadata:Metadata={title:"QARICA",description:"Nền tảng Quản trị Chất lượng & Cải tiến",manifest:"/manifest.webmanifest",icons:{icon:[{url:"/brand/qarica-app-icon-v2.svg",type:"image/svg+xml"}],shortcut:"/brand/qarica-app-icon-v2.svg",apple:"/brand/qarica-app-icon-v2.svg"}};
export const viewport:Viewport={width:"device-width",initialScale:1,themeColor:"#102848"};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="vi"><body className={`${appFont.className} ${appFont.variable}`}>{children}<style>{criticalCss}</style></body></html>}
