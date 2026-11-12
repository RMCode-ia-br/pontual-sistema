import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { QuadroDeAging } from "@/modules/financeiro/components/quadro-de-aging";
import { agingDoPagar } from "@/modules/financeiro/queries-aging";
import { BotaoImprimir } from "@/modules/relatorios/components/botao-imprimir";

export const metadata: Metadata = { title: "A pagar por vencimento" };

export default async function RelatorioDoPagar() {
  await exigirSessao();
  const hoje = dataLocalDoInstante(new Date());
  const r = await agingDoPagar(hoje);

  return (
    <>
      <p className="mb-2 text-sm print:hidden">
        <Link href="/relatorios" className="text-muted-foreground hover:underline">
          ← Relatórios
        </Link>
      </p>
      <CabecalhoPagina
        titulo="A pagar por vencimento, fornecedor e categoria"
        descricao={`O que vence e o que está atrasado, em ${hoje.split("-").reverse().join("/")}.`}
        acoes={
          <>
            <BotaoImprimir />
            <a href="/api/exportar/financeiro/aging?tipo=pagar" className={buttonVariants({ variant: "outline" })}>
              <Download aria-hidden /> Exportar CSV
            </a>
          </>
        }
      />
      <div className="grid gap-6">
        <QuadroDeAging titulo="Por fornecedor ou favorecido" aging={r.porFornecedor} nomeDaColuna="Fornecedor" />
        <QuadroDeAging titulo="Por categoria" aging={r.porCategoria} nomeDaColuna="Categoria" />
        <details className="text-muted-foreground text-sm">
          <summary className="cursor-pointer">Como é calculado</summary>
          <p className="mt-1 max-w-prose">Entram as contas a pagar em aberto ou parcialmente pagas, pelo que ainda falta pagar. A faixa vem da diferença entre hoje e o vencimento, calculada na hora. Contas pagas e canceladas ficam de fora.</p>
        </details>
      </div>
    </>
  );
}
