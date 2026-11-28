import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { buttonVariants } from "@/components/ui/button";
import { permissoesDaLista } from "@/components/lista/acoes-permitidas";
import { exigirModulo } from "@/lib/auth/modulo";
import { can } from "@/lib/permissoes";
import { PainelListaFornecedores } from "@/modules/fornecedores/components/painel-lista-fornecedores";

export const metadata: Metadata = { title: "Fornecedores" };

export default async function PaginaFornecedores({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await exigirModulo("CADASTROS");
  const brutos = await searchParams;
  return (
    <>
      <CabecalhoPagina
        titulo="Fornecedores"
        descricao="Quem vende perfis, vidros, ferragens e acessórios: contato, prazo de entrega e condições."
        acoes={
          can(usuario, "criar", "fornecedor") ? (
            <Link href="/fornecedores/novo" className={buttonVariants()}>
              <Plus aria-hidden /> Novo fornecedor
            </Link>
          ) : null
        }
      />
      <PainelListaFornecedores
        brutos={brutos}
        usuarioId={usuario.id}
        permitidas={permissoesDaLista(usuario, "fornecedor")}
      />
    </>
  );
}
