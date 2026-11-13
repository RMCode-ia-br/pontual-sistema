import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoDeRelatorio, TabelaDeRelatorio } from "@/components/relatorios/cabecalho-de-relatorio";
import { NumeroDoPainel } from "@/components/relatorios/numero-do-painel";
import { SeletorDePeriodo } from "@/components/relatorios/seletor-de-periodo";
import { exigirSessao } from "@/lib/auth/sessao";
import { formatarData, formatarMoeda, dataLocalDoInstante } from "@/lib/formatadores";
import { montarConsulta } from "@/lib/listas/parametros";
import { lerPeriodo, parametrosDoPeriodo, rotuloDoPeriodo } from "@/lib/periodo";
import { LIMITE_DE_LINHAS_DE_VENDAS, listarVendas, vendidoNoPeriodo } from "@/modules/indicadores/vendas";

export const metadata: Metadata = { title: "Vendas por período" };

export default async function PaginaDeVendas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSessao();
  const hoje = dataLocalDoInstante(new Date());
  const { periodo, tipo, aviso } = lerPeriodo(await searchParams, hoje);
  const [v, lista] = await Promise.all([vendidoNoPeriodo(periodo), listarVendas(periodo)]);
  const consulta = montarConsulta(parametrosDoPeriodo(periodo));

  return (
    <>
      <p className="mb-2 text-sm print:hidden">
        <Link href="/relatorios" className="text-muted-foreground hover:underline">
          ← Relatórios
        </Link>
      </p>
      <CabecalhoDeRelatorio
        titulo="Vendas por período"
        descricao="O que foi aprovado pelo cliente no período, proposta por proposta. É a lista que explica o número “Vendido” do painel e o “Valor médio por obra”."
        periodoRotulo={rotuloDoPeriodo(periodo)}
        hrefCsv={`/api/exportar/relatorios/vendas${consulta}`}
      >
        <SeletorDePeriodo periodo={periodo} tipo={tipo} hoje={hoje} />
      </CabecalhoDeRelatorio>

      {aviso ? (
        <p role="status" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {aviso}
        </p>
      ) : null}

      <section aria-label="Resumo das vendas" className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <NumeroDoPainel titulo="Vendido" valor={formatarMoeda(v.totalCentavos)} definicao="Soma do valor aprovado de cada proposta que o cliente aprovou no período, pela data da aprovação. Uma obra com duas partes aprovadas em meses diferentes tem cada parte no seu mês." detalhe={`${v.propostas} proposta(s) em ${v.projetos} projeto(s)`} grande />
        <NumeroDoPainel titulo="Vendido sem nota" valor={formatarMoeda(v.semNotaCentavos)} definicao="Parte do vendido em propostas sem nota fiscal." />
        <NumeroDoPainel titulo="Vendido com nota" valor={formatarMoeda(v.comNotaCentavos)} definicao="Parte do vendido em propostas com nota fiscal. Já inclui o acréscimo da nota, que aparece separado ao lado." detalhe={`Repasse de imposto, fora da margem: ${formatarMoeda(v.repasseDeImpostoCentavos)}`} />
        <NumeroDoPainel titulo="Valor médio por obra" valor={v.ticketMedioCentavos === null ? "—" : formatarMoeda(v.ticketMedioCentavos)} definicao="Vendido dividido pelo número de projetos que tiveram aprovação no período." detalhe={v.projetos === 0 ? "Sem projeto aprovado no período" : `${v.projetos} projeto(s)`} />
      </section>

      {lista.truncado ? (
        <p role="alert" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          A lista mostra só as {LIMITE_DE_LINHAS_DE_VENDAS} aprovações mais recentes do período. Escolha um período menor para ver as outras.
        </p>
      ) : null}

      {lista.linhas.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">Nenhuma proposta foi aprovada neste período</p>
          <p className="text-muted-foreground mt-1 text-sm">Quando o cliente aprovar uma proposta, ela aparece aqui e entra no “Vendido” do painel.</p>
        </div>
      ) : (
        <TabelaDeRelatorio legenda="Propostas aprovadas no período">
          <thead className="bg-muted/50 text-left text-xs">
            <tr>
              <th scope="col" className="px-3 py-2">Proposta</th>
              <th scope="col" className="px-3 py-2">Obra</th>
              <th scope="col" className="px-3 py-2">Cliente</th>
              <th scope="col" className="px-3 py-2">Aprovada em</th>
              <th scope="col" className="px-3 py-2">Nota</th>
              <th scope="col" className="px-3 py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lista.linhas.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2 font-medium">
                  <Link href={`/propostas/${l.id}`} className="hover:underline">
                    {l.numero}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <Link href={`/projetos/${l.projetoId}`} className="hover:underline">
                    {l.projetoCodigo} · {l.projetoTitulo}
                  </Link>
                </td>
                <td className="px-3 py-2">{l.cliente}</td>
                <td className="px-3 py-2 tabular-nums">{formatarData(l.aceitaEm)}</td>
                <td className="px-3 py-2">{l.comNotaFiscal ? "Com nota" : "Sem nota"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(l.valorCentavos)}</td>
              </tr>
            ))}
          </tbody>
        </TabelaDeRelatorio>
      )}
    </>
  );
}
