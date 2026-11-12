import type { MetadataRoute } from "next";

import { COR_PADRAO_DO_SISTEMA, derivarTemaDaMarca } from "@/lib/tema/derivar";
import { obterCorDaMarca } from "@/modules/configuracoes/queries";

// Lê a cor da marca no banco: nunca estático.
export const dynamic = "force-dynamic";

// PWA instalável (sem modo offline nesta etapa, ver docs/DECISOES.md).
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const corDoTema = derivarTemaDaMarca(await obterCorDaMarca())?.claro["--primary"] ?? COR_PADRAO_DO_SISTEMA;
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
    theme_color: corDoTema,
    icons: [
      // "any": logo circular com transparência fora do círculo. "maskable": fundo opaco e logo nos 80% centrais.
      { src: "/icons/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icone-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
