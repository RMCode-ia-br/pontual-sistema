import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { buttonVariants } from "@/components/ui/button";
import { permissoesDaLista } from "@/components/lista/acoes-permitidas";
import { exigirModulo } from "@/lib/auth/modulo";
import { can } from "@/lib/permissoes";
import { PainelListaFuncionarios } from "@/modules/funcionarios/components/painel-lista-funcionarios";
import { SubnavFuncionarios } from "@/modules/funcionarios/components/subnav-funcionarios";

export const metadata: Metadata = { title: "Funcionários" };

export default async function PaginaFuncionarios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await exigirModulo("CADASTROS");
  const brutos = await searchParams;
  return (
    <>
      <CabecalhoPagina
        titulo="Funcionários e equipes"
        descricao="Quem trabalha na Pontual: vendas, projeto, fábrica e instalação."
        acoes={
          can(usuario, "criar", "funcionario") ? (
            <Link href="/funcionarios/novo" className={buttonVariants()}>
              <Plus aria-hidden /> Novo funcionário
            </Link>
          ) : null
        }
      />
      <SubnavFuncionarios atual="funcionarios" />
      <PainelListaFuncionarios verCusto={can(usuario, "ver", "custo")}
        brutos={brutos}
        usuarioId={usuario.id}
        permitidas={permissoesDaLista(usuario, "funcionario")}
      />
    </>
  );
}
