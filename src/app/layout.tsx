import type { Metadata, Viewport } from "next";
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
import "./tqm-charts.css";
import "./mobile-responsive-fixes.css";

const criticalCss=`
  html,body,body *{font-family:var(--font-app),"Nunito Sans","Segoe UI",Arial,sans-serif!important}
  .brand-logo-wrap{width:42px!important;height:42px!important;min-width:42px!important;max-width:42px!important;overflow:hidden!important;flex:0 0 42px!important}
  .brand-logo-img{width:42px!important;height:42px!important;max-width:42px!important;max-height:42px!important;object-fit:contain!important;display:block!important}
  .sidebar.collapsed .sidebar-collapse{position:absolute!important;top:20px!important;right:-13px!important;bottom:auto!important;width:28px!important;height:28px!important;margin:0!important;z-index:60!important}
  .login-logo{width:96px!important;height:96px!important;max-width:96px!important;object-fit:contain!important}\n  .login-brand-logo{width:min(390px,100%)!important;height:auto!important;display:block!important}\n  .mobile-brand img{width:108px!important;height:auto!important;display:block!important}\n  .workspace-app .brand-mark img{width:34px!important;height:34px!important;display:block!important}
  @media(max-width:860px){html,body{margin:0!important;padding:0!important}.sidebar.collapsed .sidebar-collapse{display:none!important}.workspace-app{margin:0!important;padding-top:0!important}.workspace-app .topbar{top:0!important}}
  @media print{@page{size:A4;margin:20mm 20mm 20mm 30mm!important}}
`;
export const metadata:Metadata={title:"QARICA",description:"Nền tảng Quản trị Chất lượng & Cải tiến",icons:{icon:"/icon.svg",apple:"/apple-icon.svg"}};
export const viewport:Viewport={width:"device-width",initialScale:1,viewportFit:"cover",themeColor:"#071f3b"};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="vi"><body>{children}<style>{criticalCss}</style></body></html>}
