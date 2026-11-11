import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { cn } from "@/lib/utils";
import { restaurarClientes, restaurarEquipes, restaurarFornecedores, restaurarFuncionarios, restaurarProdutos } from "@/modules/lixeira/actions";
import { ListaDaLixeira } from "@/modules/lixeira/components/lista-da-lixeira";
import { contarLixeira, listarLixeira } from "@/modules/lixeira/queries";
import { lerTipoDaLixeira, ROTULO_LIXEIRA, TIPOS_DA_LIXEIRA } from "@/modules/lixeira/tipos";

export const metadata: Metadata = { title: "Lixeira" };

const RESTAURAR = { clientes: restaurarClientes, fornecedores: restaurarFornecedores, funcionarios: restaurarFuncionarios, produtos: restaurarProdutos, equipes: restaurarEquipes };

export default async function PaginaLixeira({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  await exigirSessao();
  const { tipo: bruto } = await searchParams;
  const tipo = lerTipoDaLixeira(bruto);
  const [itens, contagem] = await Promise.all([listarLixeira(tipo), contarLixeira()]);

  return (
    <>
      <CabecalhoPagina titulo="Lixeira" descricao="O que foi removido fica guardado aqui e pode voltar. Nada é apagado de verdade." />
      <nav aria-label="Tipo de cadastro" className="mb-6 flex gap-1 overflow-x-auto border-b">
        {TIPOS_DA_LIXEIRA.map((t) => (
          <Link
            key={t}
            href={`/lixeira?tipo=${t}`}
            aria-current={tipo === t ? "page" : undefined}
            className={cn("inline-flex min-h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm", tipo === t ? "border-primary text-primary font-medium" : "text-muted-foreground hover:text-foreground border-transparent")}
          >
            {ROTULO_LIXEIRA[t]}
            {contagem[t] > 0 ? <span className="bg-muted text-muted-foreground rounded-full px-1.5 text-xs tabular-nums">{contagem[t]}</span> : null}
          </Link>
        ))}
      </nav>
      <div className="max-w-3xl">
        <ListaDaLixeira itens={itens} rotulo={ROTULO_LIXEIRA[tipo]} restaurar={RESTAURAR[tipo]} />
      </div>
    </>
  );
}
