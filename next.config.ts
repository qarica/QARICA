import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  // Chuẩn OAuth đòi hỏi metadata nằm đúng ở gốc domain
  // (/.well-known/oauth-authorization-server) để Claude tự khám phá khi
  // "Add Connector" — route thật đặt ở /api/mcp/metadata (tránh thư mục
  // bắt đầu bằng dấu chấm trong src/app, dễ bị công cụ/editor xử lý sai).
  async rewrites() {
    return [{ source: "/.well-known/oauth-authorization-server", destination: "/api/mcp/metadata" }];
  },
};

export default nextConfig;
