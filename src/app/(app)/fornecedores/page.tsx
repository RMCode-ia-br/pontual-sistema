import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { PainelListaFornecedores } from "@/modules/fornecedores/components/painel-lista-fornecedores";

export const metadata: Metadata = { title: "Fornecedores" };

export default async function PaginaFornecedores({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const usuario = await exigirSessao();
  const brutos = await searchParams;
  return (
    <>
      <CabecalhoPagina
        titulo="Fornecedores"
        descricao="Quem vende perfis, vidros, ferragens e acessórios: contato, prazo de entrega e condições."
        acoes={
          <Link href="/fornecedores/novo" className={buttonVariants()}>
            <Plus aria-hidden /> Novo fornecedor
          </Link>
        }
      />
      <PainelListaFornecedores brutos={brutos} usuarioId={usuario.id} />
    </>
  );
}
