import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { PainelListaFuncionarios } from "@/modules/funcionarios/components/painel-lista-funcionarios";
import { SubnavFuncionarios } from "@/modules/funcionarios/components/subnav-funcionarios";

export const metadata: Metadata = { title: "Funcionários" };

export default async function PaginaFuncionarios({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const usuario = await exigirSessao();
  const brutos = await searchParams;
  return (
    <>
      <CabecalhoPagina
        titulo="Funcionários e equipes"
        descricao="Quem trabalha na Pontual: vendas, projeto, fábrica e instalação."
        acoes={
          <Link href="/funcionarios/novo" className={buttonVariants()}>
            <Plus aria-hidden /> Novo funcionário
          </Link>
        }
      />
      <SubnavFuncionarios atual="funcionarios" />
      <PainelListaFuncionarios brutos={brutos} usuarioId={usuario.id} />
    </>
  );
}
