import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exigirSessao } from "@/lib/auth/sessao";
import { dataLocalDoInstante, formatarDataCalendario, formatarMoeda } from "@/lib/formatadores";
import { AcoesDaConta, ExtratoDaContaLista } from "@/modules/financeiro/components/extrato-da-conta";
import { AvisoDeSaldoNaoInformado, ValorEmReais } from "@/modules/financeiro/components/painel-de-contas";
import { lerPeriodoDoExtrato } from "@/modules/financeiro/periodo";
import { extratoDaConta, obterContaFinanceira, opcoesDeLancamento } from "@/modules/financeiro/queries";
import { ROTULO_TIPO_DE_CONTA } from "@/modules/financeiro/schemas";

export const metadata: Metadata = { title: "Conta" };

export default async function PaginaDaConta({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSessao();
  const { id } = await params;
  const hoje = dataLocalDoInstante(new Date());
  const conta = await obterContaFinanceira(id, hoje);
  if (!conta) notFound();

  const { de, ate } = lerPeriodoDoExtrato(await searchParams, hoje);
  const [extrato, opcoes] = await Promise.all([extratoDaConta(conta, de, ate), opcoesDeLancamento()]);
  const consultaCsv = new URLSearchParams({ de, ate }).toString();

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/financeiro/contas" className="text-muted-foreground hover:underline">
          ← Contas e lançamentos
        </Link>
      </p>
      <CabecalhoPagina
        titulo={conta.nome}
        descricao={`${ROTULO_TIPO_DE_CONTA[conta.tipo]}${conta.ativo ? "" : " · inativa"}${conta.observacao ? ` · ${conta.observacao}` : ""}`}
        acoes={<AcoesDaConta conta={conta} opcoes={opcoes} hoje={hoje} />}
      />

      <div className="grid gap-6">
        {!conta.saldoInicialInformado ? <AvisoDeSaldoNaoInformado nomes={[conta.nome]} /> : null}

        <section aria-labelledby="titulo-saldos" className="grid gap-3">
          <h2 id="titulo-saldos" className="sr-only">
            Saldos
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border p-4">
              <p className="text-muted-foreground text-sm">Saldo hoje</p>
              <p className="text-2xl font-semibold">
                <ValorEmReais centavos={conta.saldoAtualCentavos} />
              </p>
              {conta.saldoInicialInformado && conta.dataSaldoInicial ? (
                <p className="text-muted-foreground text-xs">
                  Saldo inicial de {formatarMoeda(conta.saldoInicialCentavos)} em {formatarDataCalendario(conta.dataSaldoInicial)}
                </p>
              ) : (
                <Badge variant="outline" className="mt-1 border-amber-500/60">
                  Saldo não informado
                </Badge>
              )}
            </div>
            <div className="rounded-xl border p-4">
              <p className="text-muted-foreground text-sm">Saldo no início do período</p>
              <p className="text-xl font-semibold">
                <ValorEmReais centavos={extrato.saldoAnteriorCentavos} />
              </p>
            </div>
            <div className="rounded-xl border p-4">
              <p className="text-muted-foreground text-sm">Entradas no período</p>
              <p className="text-xl font-semibold text-emerald-700 dark:text-emerald-400">+ {formatarMoeda(extrato.entradasCentavos)}</p>
            </div>
            <div className="rounded-xl border p-4">
              <p className="text-muted-foreground text-sm">Saídas no período</p>
              <p className="text-xl font-semibold text-red-700 dark:text-red-400">− {formatarMoeda(extrato.saidasCentavos)}</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="titulo-extrato" className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="titulo-extrato" className="font-medium">
              Extrato
            </h2>
            <div className="flex flex-wrap items-end gap-2">
              <form method="get" className="flex flex-wrap items-end gap-2">
                <label className="grid gap-1 text-xs">
                  De
                  <Input type="date" name="de" defaultValue={de} max={hoje} className="w-40" />
                </label>
                <label className="grid gap-1 text-xs">
                  Até
                  <Input type="date" name="ate" defaultValue={ate} max={hoje} className="w-40" />
                </label>
                <button type="submit" className={buttonVariants({ variant: "outline" })}>
                  Filtrar
                </button>
              </form>
              <a href={`/api/exportar/financeiro/extrato/${conta.id}?${consultaCsv}`} className={buttonVariants({ variant: "outline" })}>
                <Download aria-hidden /> Exportar CSV
              </a>
            </div>
          </div>
          <p className="text-muted-foreground text-xs">
            Saldo no fim do período: <strong>{formatarMoeda(extrato.saldoFinalCentavos)}</strong>. Lançamento estornado aparece riscado e não conta no saldo. “Conciliar” é a conferência manual com o extrato do banco.
          </p>
          <ExtratoDaContaLista extrato={extrato} />
        </section>
      </div>
    </>
  );
}
