import Link from "next/link";

import { ComoECalculado } from "@/components/relatorios/como-e-calculado";
import { TabelaDeRelatorio } from "@/components/relatorios/cabecalho-de-relatorio";
import { GraficoDeBarras } from "@/components/relatorios/grafico-de-barras";
import { NumeroDoPainel } from "@/components/relatorios/numero-do-painel";
import { detalheDoTempoVisitaProposta } from "@/lib/dominio/indicadores";
import { formatarData, formatarMoeda } from "@/lib/formatadores";
import { montarConsulta } from "@/lib/listas/parametros";
import { rotuloDoPeriodo, type Periodo } from "@/lib/periodo";
import { tempoVisitaAteProposta } from "@/modules/indicadores/fechamento";
import { ganhasEPerdidasPorFaixa, LIMITE_DE_LINHAS_DE_DECISAO, temposDeDecisao } from "@/modules/indicadores/tempos-e-faixas";

const th = "px-3 py-2";
const dias = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("pt-BR")} dia(s)`);
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR")}%`);

/** "Proposta enviada → decisão" e "visita → proposta": poucos números, uma tabela com as propostas decididas. */
export async function VisaoTempos({ periodo }: { periodo: Periodo }) {
  const [visita, d] = await Promise.all([tempoVisitaAteProposta(periodo), temposDeDecisao(periodo)]);
  const decisoes = [
    ...d.aprovadas.linhas.map((l) => ({ ...l, resultado: "Aprovada" })),
    ...d.perdidas.linhas.map((l) => ({ ...l, resultado: "Perdida" })),
  ].sort((a, b) => b.decididaEm.getTime() - a.decididaEm.getTime());
  const detalhe = (amostra: number, fora: number, vazio: string) => (amostra === 0 && fora === 0 ? vazio : `${amostra} proposta(s)${fora > 0 ? ` · ${fora} fora da média (decisão anterior ao envio registrado)` : ""}`);
  return (
    <>
      <section aria-label="Resumo dos tempos" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <NumeroDoPainel
          titulo="Da visita à proposta"
          valor={visita.mediaDeDias === null ? "—" : dias(visita.mediaDeDias)}
          definicao="Média de dias entre a primeira visita realizada e o envio da primeira proposta, dos projetos cuja primeira proposta foi enviada no período. Se a visita foi registrada depois da proposta, o projeto fica fora da média e é contado à parte."
          detalhe={detalheDoTempoVisitaProposta(visita.amostra, visita.foraDaMedia)}
        />
        <NumeroDoPainel
          titulo="Da proposta à aprovação"
          valor={dias(d.aprovadas.mediaDias)}
          definicao="Média de dias entre o envio da proposta e a data da aprovação, das propostas aprovadas no período."
          detalhe={detalhe(d.aprovadas.amostra, d.aprovadas.foraDaMedia, "Nenhuma proposta aprovada no período")}
        />
        <NumeroDoPainel
          titulo="Da proposta à perda"
          valor={dias(d.perdidas.mediaDias)}
          definicao="Média de dias entre o PRIMEIRO envio de proposta do projeto e a data em que foi marcado como perdido, dos projetos perdidos no período. Projeto perdido sem nenhuma proposta enviada fica de fora."
          detalhe={`${detalhe(d.perdidas.amostra, d.perdidas.foraDaMedia, "Nenhum projeto perdido com proposta no período")}${d.perdidas.semPropostaEnviada > 0 ? ` · ${d.perdidas.semPropostaEnviada} perdido(s) sem proposta enviada, fora` : ""}`}
        />
      </section>
      <p className="text-muted-foreground mb-4 text-sm">Propostas enviadas e ainda sem resposta agora: <strong>{d.emAbertoAgora}</strong> (de qualquer data).</p>
      {d.aprovadas.totalDeLinhas > d.aprovadas.linhas.length || d.perdidas.totalDeLinhas > d.perdidas.linhas.length ? (
        <p role="note" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          A tabela mostra só as {LIMITE_DE_LINHAS_DE_DECISAO} decisões mais recentes de cada tipo ({d.aprovadas.totalDeLinhas} aprovadas e {d.perdidas.totalDeLinhas} perdidas no período). As médias acima valem para todas.
        </p>
      ) : null}
      {decisoes.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">Nenhuma proposta foi decidida neste período</p>
          <p className="text-muted-foreground mt-1 text-sm">Quando uma proposta for aprovada ou o projeto for perdido, ela aparece aqui.</p>
        </div>
      ) : (
        <TabelaDeRelatorio legenda="Propostas decididas no período e quantos dias levaram">
          <thead className="bg-muted/50 text-left text-xs">
            <tr>
              <th scope="col" className={th}>Resultado</th>
              <th scope="col" className={th}>Obra</th>
              <th scope="col" className={th}>Cliente</th>
              <th scope="col" className={th}>Enviada em</th>
              <th scope="col" className={th}>Decidida em</th>
              <th scope="col" className={`${th} text-right`}>Dias</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {decisoes.map((l) => (
              <tr key={`${l.resultado}-${l.projetoId}-${l.decididaEm.toISOString()}`}>
                <td className="px-3 py-2">{l.resultado}</td>
                <td className="px-3 py-2">
                  <Link href={`/projetos/${l.projetoId}`} className="hover:underline">
                    {l.codigo} · {l.titulo}
                  </Link>
                </td>
                <td className="px-3 py-2">{l.cliente}</td>
                <td className="px-3 py-2 tabular-nums">{formatarData(l.enviadaEm)}</td>
                <td className="px-3 py-2 tabular-nums">{formatarData(l.decididaEm)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {l.dias}
                  {l.naMedia ? "" : " (fora da média)"}
                </td>
              </tr>
            ))}
          </tbody>
        </TabelaDeRelatorio>
      )}
      <ComoECalculado className="mt-3" texto={`Grupo analisado: propostas decididas de ${rotuloDoPeriodo(periodo)}. Dias de calendário em horário de São Paulo. Dias negativos (decisão com data anterior ao envio registrado) ficam fora da média e aparecem marcados na tabela.`} />
    </>
  );
}

/** Ganhas × perdidas por faixa de preço (últimos 12 meses até a referência), padrão por quartis, cortes editáveis. */
export async function VisaoFaixas({ referencia, cortes, cortesTexto }: { referencia: string; cortes: number[] | null; cortesTexto: string | null }) {
  const f = await ganhasEPerdidasPorFaixa(referencia, cortes);
  const r = f.resultado;
  const ganhas = f.casos.filter((c) => c.ganha).length;
  const perdidas = f.casos.length - ganhas;
  const taxa = f.casos.length === 0 ? null : Math.round((ganhas / f.casos.length) * 1000) / 10;
  return (
    <>
      <p role="note" className="mb-4 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-sm">
        <strong>A confirmar com o Marcelo:</strong> as faixas padrão são os quartis dos últimos 12 meses (ganhas e perdidas juntas). Os cortes aparecem abaixo e podem ser trocados no filtro.
      </p>
      <section aria-label="Resumo" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <NumeroDoPainel
          titulo="Propostas ganhas, de todas as decididas"
          valor={pct(taxa)}
          definicao="Ganhas ÷ (ganhas + perdidas com valor), nos últimos 12 meses. Ganha: proposta aprovada. Perdida: projeto perdido que tinha proposta enviada, pelo valor da última proposta enviada."
          detalhe={`${ganhas} ganha(s) e ${perdidas} perdida(s)`}
          grande
        />
      </section>
      {f.perdidasSemProposta + f.perdidasSemValor > 0 ? (
        <p role="status" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Ficaram de fora: {f.perdidasSemProposta} projeto(s) perdido(s) sem proposta enviada{f.perdidasSemValor > 0 ? ` e ${f.perdidasSemValor} sem valor no conteúdo congelado da proposta` : ""}.
        </p>
      ) : null}
      {f.casos.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">Nenhuma proposta ganha ou perdida nos últimos 12 meses</p>
          <p className="text-muted-foreground mt-1 text-sm">Quando houver, elas aparecem aqui, divididas por faixa de preço.</p>
        </div>
      ) : r.tipo === "unica" ? (
        <>
          <p role="status" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">Poucos dados para dividir em faixas (são {r.casos}; o mínimo é 12). Veja a tabela única, ou digite os cortes no filtro.</p>
          <TabelaDeRelatorio legenda="Ganhas e perdidas, todas as faixas juntas">
            <thead className="bg-muted/50 text-left text-xs">
              <tr>
                <th scope="col" className={th}>Faixa</th>
                <th scope="col" className={`${th} text-right`}>Ganhas</th>
                <th scope="col" className={`${th} text-right`}>Perdidas</th>
                <th scope="col" className={`${th} text-right`}>Ganhas, de todas</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3 py-2 font-medium">Todos os valores</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.ganhas}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.perdidas}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(r.taxaDeGanhoPercentual)}</td>
              </tr>
            </tbody>
          </TabelaDeRelatorio>
        </>
      ) : (
        <>
          <p className="text-muted-foreground mb-3 text-sm">
            Cortes usados ({r.origemDosCortes === "quartis" ? "quartis dos últimos 12 meses" : "digitados no filtro"}): {r.cortes.map((c) => formatarMoeda(c)).join(" · ")}
          </p>
          <div className="mb-6">
            <GraficoDeBarras
              dados={r.linhas.map((l) => ({ nome: l.faixa.rotulo, ganhas: l.ganhas, perdidas: l.perdidas }))}
              series={[{ chave: "ganhas", rotulo: "Ganhas" }, { chave: "perdidas", rotulo: "Perdidas" }]}
              orientacao="vertical"
              empilhado
              descricao="Propostas ganhas e perdidas por faixa de preço, nos últimos 12 meses"
            />
          </div>
          <TabelaDeRelatorio legenda="Ganhas e perdidas por faixa de preço">
            <thead className="bg-muted/50 text-left text-xs">
              <tr>
                <th scope="col" className={th}>Faixa</th>
                <th scope="col" className={`${th} text-right`}>Ganhas</th>
                <th scope="col" className={`${th} text-right`}>Perdidas</th>
                <th scope="col" className={`${th} text-right`}>Ganhas, de todas</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {r.linhas.map((l) => (
                <tr key={l.faixa.rotulo}>
                  <td className="px-3 py-2 font-medium">{l.faixa.rotulo}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.ganhas}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.perdidas}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(l.taxaDeGanhoPercentual)}</td>
                </tr>
              ))}
            </tbody>
          </TabelaDeRelatorio>
        </>
      )}
      <ComoECalculado
        className="mt-3"
        texto={`Grupo analisado: ${rotuloDoPeriodo(f.janela)} (os 12 meses até ${formatarData(`${referencia}T12:00:00Z`)}). Ganha = proposta aprovada nesses 12 meses, pelo valor aprovado. Perdida = projeto perdido nesses 12 meses que teve proposta enviada; o valor é o da ÚLTIMA proposta enviada, pelo maior total entre as opções (o sistema não guarda uma opção recomendada). Faixas = quartis dos casos (ganhas e perdidas juntas); com menos de 12 casos, tabela única. Cada caso cai numa só faixa.${cortesTexto ? " Cortes digitados no filtro." : ""}`}
      />
    </>
  );
}

/** Formulário dos cortes (reais separados por ponto e vírgula). Vazio volta ao padrão por quartis. */
export function FiltroDeCortes({ cortesTexto }: { cortesTexto: string | null }) {
  return (
    <form method="get" action="/relatorios/funil" role="search" className="mb-5 flex flex-wrap items-end gap-2 print:hidden">
      <input type="hidden" name="visao" value="faixas" />
      <label className="grid gap-1 text-xs">
        <span className="text-muted-foreground">Cortes das faixas, em reais (ex.: 30.000; 60.000; 120.000). Vazio = quartis.</span>
        <input name="cortes" defaultValue={cortesTexto ?? ""} placeholder="30.000; 60.000; 120.000" className="border-input bg-background h-9 w-72 max-w-full rounded-lg border px-2.5 text-sm" />
      </label>
      <button type="submit" className="bg-secondary text-secondary-foreground h-9 rounded-lg px-3 text-sm">
        Aplicar
      </button>
      <Link href={`/relatorios/funil${montarConsulta({ visao: "faixas" })}`} className="text-muted-foreground inline-flex h-9 items-center text-sm hover:underline">
        Voltar ao padrão
      </Link>
    </form>
  );
}
