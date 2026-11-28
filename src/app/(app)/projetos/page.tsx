import { KanbanSquare, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { buttonVariants } from "@/components/ui/button";
import { permissoesDaLista } from "@/components/lista/acoes-permitidas";
import { exigirModulo } from "@/lib/auth/modulo";
import { can } from "@/lib/permissoes";
import { PainelListaProjetos } from "@/modules/projetos/components/painel-lista-projetos";

export const metadata: Metadata = { title: "Projetos" };

export default async function PaginaProjetos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await exigirModulo("COMERCIAL", { exige: ["valores"] });
  const brutos = await searchParams;
  return (
    <>
      <CabecalhoPagina
        titulo="Projetos"
        descricao="Todos os pedidos de orçamento e obras, em lista. Para ver por fase, use o funil."
        acoes={
          <>
            <Link
              href="/funil"
              className={buttonVariants({ variant: "outline" })}
            >
              <KanbanSquare aria-hidden /> Ver funil
            </Link>
            {can(usuario, "criar", "projeto") ? (
              <Link href="/projetos/novo" className={buttonVariants()}>
                <Plus aria-hidden /> Novo projeto
              </Link>
            ) : null}
          </>
        }
      />
      <PainelListaProjetos
        brutos={brutos}
        usuarioId={usuario.id}
        permitidas={permissoesDaLista(usuario, "projeto")}
      />
    </>
  );
}
