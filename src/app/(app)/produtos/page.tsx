import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { PainelListaProdutos } from "@/modules/produtos/components/painel-lista-produtos";

export const metadata: Metadata = { title: "Produtos" };

export default async function PaginaProdutos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const usuario = await exigirSessao();
  const brutos = await searchParams;
  return (
    <>
      <CabecalhoPagina
        titulo="Produtos e insumos"
        descricao="Perfis, vidros, ferragens e acessórios, com o custo de cada um e o histórico de preço."
        acoes={
          <Link href="/produtos/novo" className={buttonVariants()}>
            <Plus aria-hidden /> Novo produto
          </Link>
        }
      />
      <PainelListaProdutos brutos={brutos} usuarioId={usuario.id} />
    </>
  );
}
