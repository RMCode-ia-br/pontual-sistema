import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { cn } from "@/lib/utils";
import { CATALOGOS, definicaoPorSlug } from "@/modules/catalogos/definicoes";
import { listarCatalogo } from "@/modules/catalogos/repositorio";
import { PainelCatalogo } from "@/modules/catalogos/components/painel-catalogo";

export const metadata: Metadata = { title: "Catálogos" };

export default async function PaginaCatalogos({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  await exigirSessao();
  const { c } = await searchParams;
  const def = definicaoPorSlug(c) ?? CATALOGOS[0];
  const itens = await listarCatalogo(def.slug);

  return (
    <>
      <CabecalhoPagina titulo="Catálogos" descricao="Listas usadas em propostas, obras e financeiro. Itens desativados somem das escolhas, mas o histórico é mantido." />

      <nav aria-label="Catálogos" className="mb-6 flex flex-wrap gap-2">
        {CATALOGOS.map((cat) => (
          <Link
            key={cat.slug}
            href={`/configuracoes/catalogos?c=${cat.slug}`}
            aria-current={cat.slug === def.slug ? "page" : undefined}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full border px-3 text-sm",
              cat.slug === def.slug ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent",
            )}
          >
            {cat.titulo}
          </Link>
        ))}
      </nav>

      <h2 className="mb-3 text-lg font-medium">{def.titulo}</h2>
      {/* key: ao trocar de catálogo o estado dos formulários é reiniciado */}
      <PainelCatalogo key={def.slug} def={def} itens={itens} />
    </>
  );
}
