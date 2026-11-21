import type { NextConfig } from "next";

const scriptSrc =
  process.env.NODE_ENV === "production"
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

// Cabeceras de seguridad; la cámara se permite solo en la propia página (lector QR de la puerta).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Content-Security-Policy",
    value: `default-src 'self'; img-src 'self' data: blob:; frame-src 'self' blob:; style-src 'self' 'unsafe-inline'; ${scriptSrc}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  serverExternalPackages: ["pg", "@node-rs/argon2", "xlsx", "qrcode", "sharp", "tesseract.js", "@tesseract.js-data/spa"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Excel de MJRV (hasta 5 MB) y fotos de cédula (hasta 2 MB) llegan por acciones de servidor.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      { source: "/admin/finanzas/escanear", destination: "/admin/finanzas/pagar", permanent: false },
      { source: "/admin/finanzas/imprimir", destination: "/admin/finanzas/pagar", permanent: false },
      { source: "/admin/configuracion", destination: "/superadmin/configuracion", permanent: false },
      { source: "/admin/configuracion/envios", destination: "/superadmin/envios", permanent: false },
    ];
  },
};

export default nextConfig;
