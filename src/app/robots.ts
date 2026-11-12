import type { MetadataRoute } from "next";

// Sistema interno: nenhum buscador deve indexar nada daqui (o site institucional é outro projeto).
// Reforçado por `robots: noindex` no layout e pelo cabeçalho X-Robots-Tag em next.config.ts.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
