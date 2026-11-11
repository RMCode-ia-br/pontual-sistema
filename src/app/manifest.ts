import type { MetadataRoute } from "next";

// PWA instalável (sem modo offline nesta etapa, ver docs/DECISOES.md).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pontual Gestão",
    short_name: "Pontual",
    description: "Sistema de gestão da Pontual Soluções em Esquadrias e Vidros.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#1d4ed8",
    icons: [
      { src: "/icons/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
