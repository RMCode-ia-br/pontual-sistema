import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoDeRelatorio, TabelaDeRelatorio } from "@/components/relatorios/cabecalho-de-relatorio";
import { GraficoDeBarras } from "@/components/relatorios/grafico-de-barras";
import { exigirSessao } from "@/lib/auth/sessao";
import { dataLocalDoInstante, formatarMoeda } from "@/lib/formatadores";
import { montarConsulta } from "@/lib/listas/parametros";
import { rotuloDoPeriodo } from "@/lib/periodo";
import { faturamentoMensal } from "@/modules/indicadores/faturamento-mensal";

export const metadata: Metadata = { title: "Faturamento mensal" };

const NOMES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloDoMes = (mes: string) => `${NOMES_CURTOS[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;
const emReais = (centavos: number) => centavos / 100;

export default async function PaginaDoFaturamentoMensal() {
  await exigirSessao();
  const hoje = dataLocalDoInstante(new Date());
  const { periodo, meses } = await faturamentoMensal(hoje, 12);
  const soma = (f: (m: (typeof meses)[number]) => number) => meses.reduce((s, m) => s + f(m), 0);
  const totais = {
    vendidoCom: soma((m) => m.vendidoComNotaCentavos),
    vendidoSem: soma((m) => m.vendidoSemNotaCentavos),
    repasse: soma((m) => m.repasseDeImpostoCentavos),
    recebidoCom: soma((m) => m.recebidoComNotaCentavos),
    recebidoSem: soma((m) => m.recebidoSemNotaCentavos),
  };
  const tudoZero = Object.values(totais).every((v) => v === 0);

  return (
    <>
      <p className="mb-2 text-sm print:hidden">
        <Link href="/relatorios" className="text-muted-foreground hover:underline">
          ← Relatórios
        </Link>
      </p>
      <CabecalhoDeRelatorio
        titulo="Faturamento mensal (12 meses)"
        descricao="Quanto se vendeu e quanto se recebeu em cada mês, com nota e sem nota separados. Acompanhamento gerencial: não calcula imposto."
        periodoRotulo={`${rotuloDoPeriodo({ de: periodo.de, ate: periodo.ate })}`}
        hrefCsv="/api/exportar/relatorios/faturamento"
      />

      <details className="text-muted-foreground mb-6 rounded-lg border p-3 text-sm">
        <summary className="text-foreground cursor-pointer font-medium">Como é calculado</summary>
        <p className="mt-2">
          <strong>Vendido</strong>: valor aprovado de cada proposta, no mês em que o cliente aprovou. <strong>Recebido</strong>: pagamentos de contas a receber, no mês do pagamento, sem estornos. “Com nota” e “sem nota” seguem a marca da proposta (vendido) e a marca do próprio pagamento (recebido). O acréscimo da nota aparece à parte como “repasse de imposto, fora da margem”.
        </p>
      </details>

      {tudoZero ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">Ainda não há vendas nem recebimentos nos últimos 12 meses</p>
          <p className="text-muted-foreground mt-1 text-sm">Assim que uma proposta for aprovada e um pagamento registrado, os meses aparecem aqui.</p>
        </div>
      ) : (
        <>
          <div className="mb-8 grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="g-vendido">
              <h2 id="g-vendido" className="mb-2 text-sm font-medium">
                Vendido por mês
              </h2>
              <GraficoDeBarras
                orientacao="vertical"
                empilhado
                descricao="Vendido em cada um dos últimos 12 meses, separado em sem nota e com nota."
                series={[
                  { chave: "semNota", rotulo: "Sem nota" },
                  { chave: "comNota", rotulo: "Com nota" },
                ]}
                dados={meses.map((m) => ({ nome: rotuloDoMes(m.mes), semNota: emReais(m.vendidoSemNotaCentavos), comNota: emReais(m.vendidoComNotaCentavos) }))}
                formato="reais"
              />
            </section>
            <section aria-labelledby="g-recebido">
              <h2 id="g-recebido" className="mb-2 text-sm font-medium">
                Recebido por mês
              </h2>
              <GraficoDeBarras
                orientacao="vertical"
                empilhado
                descricao="Recebido em cada um dos últimos 12 meses, separado em sem nota e com nota."
                series={[
                  { chave: "semNota", rotulo: "Sem nota" },
                  { chave: "comNota", rotulo: "Com nota" },
                ]}
                dados={meses.map((m) => ({ nome: rotuloDoMes(m.mes), semNota: emReais(m.recebidoSemNotaCentavos), comNota: emReais(m.recebidoComNotaCentavos) }))}
                formato="reais"
              />
            </section>
          </div>

          <TabelaDeRelatorio legenda="Faturamento mês a mês, com nota e sem nota">
            <thead className="bg-muted/50 text-left text-xs">
              <tr>
                <th scope="col" className="px-3 py-2">Mês</th>
                <th scope="col" className="px-3 py-2 text-right">Vendido sem nota</th>
                <th scope="col" className="px-3 py-2 text-right">Vendido com nota</th>
                <th scope="col" className="px-3 py-2 text-right">Repasse de imposto (fora da margem)</th>
                <th scope="col" className="px-3 py-2 text-right">Recebido sem nota</th>
                <th scope="col" className="px-3 py-2 text-right">Recebido com nota</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {meses.map((m) => (
                <tr key={m.mes}>
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    <Link href={`/relatorios/vendas${montarConsulta({ mes: m.mes })}`} className="hover:underline">
                      {rotuloDoMes(m.mes)}
                    </Link>
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(m.vendidoSemNotaCentavos)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(m.vendidoComNotaCentavos)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(m.repasseDeImpostoCentavos)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(m.recebidoSemNotaCentavos)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Link href={`/financeiro/recebimentos${montarConsulta({ mes: m.mes, nota: "com" })}`} className="hover:underline">
                      {formatarMoeda(m.recebidoComNotaCentavos)}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/30 font-medium">
              <tr>
                <th scope="row" className="px-3 py-2 text-left">Total dos 12 meses</th>
                <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(totais.vendidoSem)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(totais.vendidoCom)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(totais.repasse)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(totais.recebidoSem)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(totais.recebidoCom)}</td>
              </tr>
            </tfoot>
          </TabelaDeRelatorio>
        </>
      )}
    </>
  );
}
