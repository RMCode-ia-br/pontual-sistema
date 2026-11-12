import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { dataLocalDoInstante, formatarMoeda } from "@/lib/formatadores";
import { QuadroDeAging } from "@/modules/financeiro/components/quadro-de-aging";
import { agingDoReceber } from "@/modules/financeiro/queries-aging";
import { BotaoImprimir } from "@/modules/relatorios/components/botao-imprimir";

export const metadata: Metadata = { title: "A receber por idade" };

export default async function RelatorioDoReceber() {
  await exigirSessao();
  const hoje = dataLocalDoInstante(new Date());
  const r = await agingDoReceber(hoje);

  return (
    <>
      <p className="mb-2 text-sm print:hidden">
        <Link href="/relatorios" className="text-muted-foreground hover:underline">
          ← Relatórios
        </Link>
      </p>
      <CabecalhoPagina
        titulo="A receber por idade e inadimplência"
        descricao={`Quanto falta receber e há quanto tempo está atrasado, por cliente, em ${hoje.split("-").reverse().join("/")}.`}
        acoes={
          <>
            <BotaoImprimir />
            <a href="/api/exportar/financeiro/aging?tipo=receber" className={buttonVariants({ variant: "outline" })}>
              <Download aria-hidden /> Exportar CSV
            </a>
          </>
        }
      />
      <div className="grid gap-6">
        <QuadroDeAging titulo="Por cliente" aging={r.porCliente} nomeDaColuna="Cliente" />
        {r.semVencimentoCentavos > 0 ? <p className="text-muted-foreground text-sm">{formatarMoeda(r.semVencimentoCentavos)} em aberto sem data de vencimento ficam fora das faixas.</p> : null}
        <details className="text-muted-foreground text-sm">
          <summary className="cursor-pointer">Como é calculado</summary>
          <p className="mt-1 max-w-prose">
            Entram as contas a receber em aberto ou parcialmente recebidas, pelo que ainda falta receber (saldo). A idade é a diferença entre hoje e o vencimento, sempre calculada na hora (atraso nunca é gravado). Parcelas que ainda aguardam uma etapa (sem vencimento) não entram. Inadimplência
            = total atrasado.
          </p>
        </details>
      </div>
    </>
  );
}
