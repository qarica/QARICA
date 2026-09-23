import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "QARICA — Nền tảng Quản trị Chất lượng & Cải tiến",
    short_name: "QARICA",
    description: "Nền tảng quản trị chất lượng & cải tiến: kế hoạch, chỉ số, giám sát, sự cố, rủi ro và CAPA.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#edf3fa",
    theme_color: "#1d3f73",
    lang: "vi",
    icons: [
      { src: "/icons/icon-192.png?v=4", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png?v=4", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png?v=4", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png?v=4", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
