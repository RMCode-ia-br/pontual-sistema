import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoDeRelatorio, TabelaDeRelatorio } from "@/components/relatorios/cabecalho-de-relatorio";
import { NumeroDoPainel } from "@/components/relatorios/numero-do-painel";
import { SeletorDePeriodo } from "@/components/relatorios/seletor-de-periodo";
import { exigirSessao } from "@/lib/auth/sessao";
import { dataLocalDoInstante, formatarData, formatarMoeda } from "@/lib/formatadores";
import { montarConsulta } from "@/lib/listas/parametros";
import { lerPeriodo, parametrosDoPeriodo, rotuloDoPeriodo } from "@/lib/periodo";
import { DIAS_DA_JANELA_DE_FECHAMENTO, fechamentoNaJanela, janelaDeFechamento, LIMITE_DE_DECISOES, listarDecisoes, tempoVisitaAteProposta } from "@/modules/indicadores/fechamento";

export const metadata: Metadata = { title: "Fechamento e tempo de resposta" };

export default async function PaginaDeFechamento({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSessao();
  const hoje = dataLocalDoInstante(new Date());
  const { periodo, tipo, aviso } = lerPeriodo(await searchParams, hoje);
  const janela = janelaDeFechamento(periodo, hoje);
  const [f, decisoes, tempo] = await Promise.all([fechamentoNaJanela(janela), listarDecisoes(janela), tempoVisitaAteProposta(periodo)]);
  const consulta = montarConsulta(parametrosDoPeriodo(periodo));

  return (
    <>
      <p className="mb-2 text-sm print:hidden">
        <Link href="/relatorios" className="text-muted-foreground hover:underline">
          ← Relatórios
        </Link>
      </p>
      <CabecalhoDeRelatorio
        titulo="Fechamento e tempo de resposta"
        descricao="Quantos projetos o cliente aprovou ou perdeu, e quanto tempo se leva da visita até a primeira proposta enviada."
        periodoRotulo={rotuloDoPeriodo(periodo)}
        hrefCsv={`/api/exportar/relatorios/fechamento${consulta}`}
      >
        <SeletorDePeriodo periodo={periodo} tipo={tipo} hoje={hoje} />
      </CabecalhoDeRelatorio>

      {aviso ? (
        <p role="status" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {aviso}
        </p>
      ) : null}

      <section aria-label="Resumo" className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <NumeroDoPainel
          titulo="Taxa de fechamento"
          valor={f.taxaPercentual === null ? "—" : `${f.taxaPercentual.toLocaleString("pt-BR")}%`}
          definicao={`Projetos aprovados dividido por (aprovados + perdidos que já tinham proposta enviada), pela data da decisão, nos ${DIAS_DA_JANELA_DE_FECHAMENTO} dias que terminam no fim do período escolhido (${formatarData(`${janela.de}T12:00:00Z`)} a ${formatarData(`${janela.ate}T12:00:00Z`)}). Projeto perdido antes de receber proposta não entra.`}
          detalhe={f.aprovados + f.perdidos === 0 ? "Sem nenhuma decisão nessa janela" : `${f.aprovados} aprovado(s) e ${f.perdidos} perdido(s)`}
          grande
        />
        <NumeroDoPainel
          titulo="Do atendimento à proposta"
          valor={tempo.mediaDeDias === null ? "—" : `${tempo.mediaDeDias.toLocaleString("pt-BR")} dia(s)`}
          definicao="Média de dias entre a primeira visita realizada e o envio da primeira proposta, dos projetos cuja primeira proposta foi enviada no período. Proposta enviada antes da visita registrada conta zero dia."
          detalhe={tempo.amostra === 0 ? "Sem proposta enviada com visita registrada no período" : `${tempo.amostra} projeto(s)`}
        />
      </section>

      <h2 className="mb-2 text-lg font-medium">Projetos decididos nos {DIAS_DA_JANELA_DE_FECHAMENTO} dias até {formatarData(`${janela.ate}T12:00:00Z`)}</h2>
      {decisoes.truncado ? (
        <p role="alert" className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          A lista mostra só as {LIMITE_DE_DECISOES} decisões mais recentes.
        </p>
      ) : null}
      {decisoes.linhas.length === 0 ? (
        <p className="text-muted-foreground mb-8 rounded-xl border border-dashed p-6 text-center text-sm">Nenhum projeto foi aprovado nem perdido (com proposta enviada) nessa janela.</p>
      ) : (
        <TabelaDeRelatorio legenda="Projetos aprovados e perdidos na janela" className="mb-8">
          <thead className="bg-muted/50 text-left text-xs">
            <tr>
              <th scope="col" className="px-3 py-2">Resultado</th>
              <th scope="col" className="px-3 py-2">Obra</th>
              <th scope="col" className="px-3 py-2">Cliente</th>
              <th scope="col" className="px-3 py-2">Data</th>
              <th scope="col" className="px-3 py-2 text-right">Valor fechado</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {decisoes.linhas.map((d) => (
              <tr key={`${d.resultado}-${d.id}`}>
                <td className="px-3 py-2 font-medium">{d.resultado === "APROVADO" ? "Aprovado" : "Perdido"}</td>
                <td className="px-3 py-2">
                  <Link href={`/projetos/${d.id}`} className="hover:underline">
                    {d.codigo} · {d.titulo}
                  </Link>
                </td>
                <td className="px-3 py-2">{d.cliente}</td>
                <td className="px-3 py-2 tabular-nums">{formatarData(d.decididoEm)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{d.valorCentavos === null ? "—" : formatarMoeda(d.valorCentavos)}</td>
              </tr>
            ))}
          </tbody>
        </TabelaDeRelatorio>
      )}

      <h2 className="mb-2 text-lg font-medium">Da visita à primeira proposta ({rotuloDoPeriodo(periodo)})</h2>
      {tempo.linhas.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">Nenhuma primeira proposta foi enviada neste período para um projeto com visita registrada.</p>
      ) : (
        <TabelaDeRelatorio legenda="Dias entre a visita e a primeira proposta enviada">
          <thead className="bg-muted/50 text-left text-xs">
            <tr>
              <th scope="col" className="px-3 py-2">Obra</th>
              <th scope="col" className="px-3 py-2">Cliente</th>
              <th scope="col" className="px-3 py-2">Visita</th>
              <th scope="col" className="px-3 py-2">Proposta enviada</th>
              <th scope="col" className="px-3 py-2 text-right">Dias</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tempo.linhas.map((l) => (
              <tr key={l.projetoId}>
                <td className="px-3 py-2">
                  <Link href={`/projetos/${l.projetoId}`} className="hover:underline">
                    {l.codigo} · {l.titulo}
                  </Link>
                </td>
                <td className="px-3 py-2">{l.cliente}</td>
                <td className="px-3 py-2 tabular-nums">{formatarData(l.visitaEm)}</td>
                <td className="px-3 py-2 tabular-nums">{formatarData(l.propostaEnviadaEm)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.dias}</td>
              </tr>
            ))}
          </tbody>
        </TabelaDeRelatorio>
      )}
    </>
  );
}
