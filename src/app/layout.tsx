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

const appFont = Nunito_Sans({ subsets:["latin","vietnamese"],weight:["400","500","600","700","800"],display:"swap",variable:"--font-app" });
const criticalCss=`
  html,body,body *{font-family:var(--font-app),"Nunito Sans","Segoe UI",Arial,sans-serif!important}
  .brand-logo-wrap{width:42px!important;height:42px!important;min-width:42px!important;max-width:42px!important;overflow:hidden!important;flex:0 0 42px!important}
  .brand-logo-img{width:42px!important;height:42px!important;max-width:42px!important;max-height:42px!important;object-fit:contain!important;display:block!important}
  .sidebar.collapsed .sidebar-collapse{position:absolute!important;top:20px!important;right:-13px!important;bottom:auto!important;width:28px!important;height:28px!important;margin:0!important;z-index:60!important}
  .login-logo{width:96px!important;height:96px!important;max-width:96px!important;object-fit:contain!important}\n  .login-brand-logo{width:min(390px,100%)!important;height:auto!important;display:block!important}\n  .mobile-brand img{width:108px!important;height:auto!important;display:block!important}\n  .workspace-app .brand-mark img{width:36px!important;height:36px!important;display:block!important}
  @media(max-width:860px){.sidebar.collapsed .sidebar-collapse{display:none!important}}
  @media print{@page{size:A4;margin:20mm 20mm 20mm 30mm!important}}
`;
export const metadata:Metadata={title:"QARICA",description:"Nền tảng Quản trị Chất lượng & Cải tiến",icons:{icon:"/icon.svg",apple:"/apple-icon.svg"}};
export const viewport:Viewport={width:"device-width",initialScale:1,themeColor:"#0b1f3a"};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="vi"><body className={`${appFont.className} ${appFont.variable}`}>{children}<style>{criticalCss}</style></body></html>}
