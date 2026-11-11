import type { NextConfig } from "next";

const ehProducao = process.env.NODE_ENV === "production";

/**
 * CSP pragmática: o Next injeta scripts inline, então `script-src` precisa de 'unsafe-inline'
 * (uma CSP com nonce exigiria renderização dinâmica de tudo via proxy; fica como melhoria futura).
 * Em desenvolvimento o React Refresh também precisa de 'unsafe-eval'.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${ehProducao ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  // Fotos e arquivos vêm do Storage do Supabase por URL assinada.
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  // Upload direto ao Storage (URL assinada) a partir do navegador.
  "connect-src 'self' https://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const cabecalhosDeSeguranca = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Câmera só para o próprio site (fotos de medição no celular); o resto fica bloqueado.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(ehProducao ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // A importação de planilhas envia as linhas já lidas (até ~2.000 linhas) numa Server Action; o padrão do
    // Next (1 MB) é pequeno para isso. O navegador também barra acima de 4 MB antes de enviar.
    serverActions: { bodySizeLimit: "5mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: cabecalhosDeSeguranca }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
