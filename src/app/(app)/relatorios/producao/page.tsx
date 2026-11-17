import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoDeRelatorio, TabelaDeRelatorio } from "@/components/relatorios/cabecalho-de-relatorio";
import { ComoECalculado } from "@/components/relatorios/como-e-calculado";
import { GraficoDeBarras } from "@/components/relatorios/grafico-de-barras";
import { lerVisao, NavegacaoDeVisoes, type Visao } from "@/components/relatorios/navegacao-de-visoes";
import { NumeroDoPainel } from "@/components/relatorios/numero-do-painel";
import { SeletorDePeriodo } from "@/components/relatorios/seletor-de-periodo";
import { exigirSessao } from "@/lib/auth/sessao";
import { dataLocalDoInstante, formatarDataCalendario } from "@/lib/formatadores";
import { montarConsulta } from "@/lib/listas/parametros";
import { lerPeriodo, parametrosDoPeriodo, rotuloDoPeriodo, type Periodo } from "@/lib/periodo";
import { DIAS_A_FRENTE_DA_FABRICA, ocupacaoAtualDaFabrica } from "@/modules/indicadores/fabrica";
import { LIMITE_DE_OBRAS_EM_ANDAMENTO, obrasEmAndamento, producaoPorMes } from "@/modules/indicadores/operacional";

export const metadata: Metadata = { title: "Produção da fábrica" };

const VISOES = [
  { valor: "hoje", titulo: "Fábrica hoje" },
  { valor: "mes", titulo: "m² por mês" },
  { valor: "andamento", titulo: "Obras em andamento" },
] as const satisfies readonly Visao[];

const DESCRICAO: Record<string, string> = {
  hoje: "Quanto da capacidade da fábrica está ocupada hoje: as obras que estão em fabricação ou que vão começar nos próximos 30 dias.",
  mes: "Quantos m² saíram da fábrica em cada mês (fabricação concluída), contra a capacidade por mês.",
  andamento: "Todas as obras aprovadas ou em execução, com a etapa em que estão.",
};

const m2 = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`;
const th = "px-3 py-2";
const mesBr = (mes: string) => `${mes.slice(5)}/${mes.slice(0, 4)}`;

export default async function PaginaDaProducao({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSessao();
  const brutos = await searchParams;
  const hoje = dataLocalDoInstante(new Date());
  const visao = lerVisao(brutos.visao, VISOES);
  const { periodo, tipo, aviso } = lerPeriodo(brutos, hoje);
  const doPeriodo = parametrosDoPeriodo(periodo);
  const consulta = montarConsulta(visao === "mes" ? { ...doPeriodo, visao } : { visao });

  return (
    <>
      <p className="mb-2 text-sm print:hidden">
        <Link href="/relatorios" className="text-muted-foreground hover:underline">
          ← Relatórios
        </Link>
      </p>
      <CabecalhoDeRelatorio
        titulo="Produção da fábrica"
        descricao={DESCRICAO[visao]}
        periodoRotulo={visao === "mes" ? rotuloDoPeriodo(periodo) : `situação em ${formatarDataCalendario(hoje)}`}
        hrefCsv={visao === "hoje" ? undefined : `/api/exportar/relatorios/producao${consulta}`}
      >
        {visao === "mes" ? <SeletorDePeriodo periodo={periodo} tipo={tipo} hoje={hoje} /> : null}
      </CabecalhoDeRelatorio>
      <NavegacaoDeVisoes visoes={VISOES} atual={visao} parametros={visao === "mes" ? doPeriodo : {}} rotulo="Visões do relatório de produção" />
      {aviso && visao === "mes" ? (
        <p role="status" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {aviso}
        </p>
      ) : null}
      {visao === "hoje" ? <VisaoHoje hoje={hoje} /> : null}
      {visao === "mes" ? <VisaoPorMes periodo={periodo} /> : null}
      {visao === "andamento" ? <VisaoAndamento /> : null}
    </>
  );
}

async function VisaoHoje({ hoje }: { hoje: string }) {
  const f = await ocupacaoAtualDaFabrica(hoje);
  return (
    <>
      <section aria-label="Resumo da produção" className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <NumeroDoPainel
          titulo="Ocupação da fábrica"
          valor={f.ocupacaoPercentual === null ? "—" : `${f.ocupacaoPercentual.toLocaleString("pt-BR")}%`}
          definicao={`m² das obras cuja fabricação está em andamento ou começa nos próximos ${DIAS_A_FRENTE_DA_FABRICA} dias (inclui a que já deveria ter começado), dividido pela capacidade de produção por mês de Configurações. Os m² vêm da opção aprovada na proposta.`}
          detalhe={f.capacidadeM2 === null ? "Informe a capacidade em Configurações" : `${m2(f.m2EmProducao)} de ${m2(f.capacidadeM2)} por mês`}
          grande
        />
      </section>

      {f.obras.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">Nenhuma obra está em fabricação nem começa nos próximos {DIAS_A_FRENTE_DA_FABRICA} dias</p>
          <p className="text-muted-foreground mt-1 text-sm">Quando uma obra chegar na etapa de fabricação, ela aparece aqui com os m² que ocupa.</p>
        </div>
      ) : (
        <TabelaDeRelatorio legenda="Obras na fábrica">
          <thead className="bg-muted/50 text-left text-xs">
            <tr>
              <th scope="col" className={th}>Obra</th>
              <th scope="col" className={th}>Cliente</th>
              <th scope="col" className={th}>Situação</th>
              <th scope="col" className={th}>Começo previsto</th>
              <th scope="col" className={`${th} text-right`}>Área</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {f.obras.map((o) => (
              <tr key={o.projetoId}>
                <td className="px-3 py-2">
                  <Link href={`/obras/${o.projetoId}?aba=etapas`} className="hover:underline">
                    {o.codigo} · {o.titulo}
                  </Link>
                </td>
                <td className="px-3 py-2">{o.cliente}</td>
                <td className="px-3 py-2">{o.situacao === "EM_ANDAMENTO" ? "Em fabricação" : "A começar"}</td>
                <td className="px-3 py-2 tabular-nums">{o.inicioPrevisto ? formatarDataCalendario(o.inicioPrevisto) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m2(o.m2)}</td>
              </tr>
            ))}
          </tbody>
        </TabelaDeRelatorio>
      )}
    </>
  );
}

async function VisaoPorMes({ periodo }: { periodo: Periodo }) {
  const r = await producaoPorMes(periodo);
  const total = r.meses.reduce((s, m) => s + m.m2, 0);
  const obras = r.meses.reduce((s, m) => s + m.obras, 0);
  return (
    <>
      <section aria-label="Resumo" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <NumeroDoPainel
          titulo="Produzido no período"
          valor={m2(total)}
          definicao="Soma dos m² das obras cuja etapa de fabricação foi concluída no período (pela data real de fim). Os m² vêm da opção aprovada na proposta."
          detalhe={`${obras} obra(s)${r.capacidadeM2 === null ? " · informe a capacidade em Configurações para ver o percentual" : ` · capacidade ${m2(r.capacidadeM2)} por mês`}`}
          grande
        />
      </section>
      {r.obrasSemArea > 0 ? (
        <p role="status" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {r.obrasSemArea} obra(s) concluídas não têm a área na proposta aprovada e não somaram m².
        </p>
      ) : null}
      {r.meses.length > 0 ? (
        <>
          <div className="mb-6">
            <GraficoDeBarras dados={r.meses.map((m) => ({ nome: mesBr(m.mes), m2: m.m2 }))} series={[{ chave: "m2", rotulo: "m² produzidos" }]} orientacao="vertical" formato="numero" descricao="m² produzidos por mês no período" />
          </div>
          <TabelaDeRelatorio legenda="m² produzidos por mês e ocupação da capacidade">
            <thead className="bg-muted/50 text-left text-xs">
              <tr>
                <th scope="col" className={th}>Mês</th>
                <th scope="col" className={`${th} text-right`}>Obras concluídas</th>
                <th scope="col" className={`${th} text-right`}>Área</th>
                <th scope="col" className={`${th} text-right`}>Da capacidade</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {r.meses.map((m) => (
                <tr key={m.mes}>
                  <td className="px-3 py-2 font-medium">{mesBr(m.mes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.obras}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m2(m.m2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.ocupacaoPercentual === null ? "—" : `${m.ocupacaoPercentual.toLocaleString("pt-BR")}%`}</td>
                </tr>
              ))}
            </tbody>
          </TabelaDeRelatorio>
        </>
      ) : null}
      <ComoECalculado className="mt-3" texto="Cada obra conta no mês em que a etapa de fabricação foi concluída (data real de fim). A área é a da opção aprovada da proposta. Mês sem obra concluída mostra 0 m². O percentual é a área ÷ a capacidade por mês de Configurações; sem capacidade informada fica “—”. Difere do retrato “Fábrica hoje”, que mostra o que está sendo fabricado agora." />
    </>
  );
}

async function VisaoAndamento() {
  const { linhas, truncado } = await obrasEmAndamento();
  return (
    <>
      <section aria-label="Resumo" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <NumeroDoPainel titulo="Obras em andamento" valor={String(linhas.length)} definicao="Projetos aprovados ou em execução que ainda não foram concluídos." detalhe={`${linhas.filter((l) => l.etapaBloqueada).length} com a etapa atual bloqueada`} grande />
      </section>
      {truncado ? (
        <p role="alert" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          A lista mostra só as primeiras {LIMITE_DE_OBRAS_EM_ANDAMENTO} obras. Use a lista de obras para o restante.
        </p>
      ) : null}
      {linhas.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">Nenhuma obra em andamento</p>
          <p className="text-muted-foreground mt-1 text-sm">Quando uma proposta for aprovada, a obra aparece aqui.</p>
        </div>
      ) : (
        <TabelaDeRelatorio legenda="Obras em andamento e etapa atual">
          <thead className="bg-muted/50 text-left text-xs">
            <tr>
              <th scope="col" className={th}>Obra</th>
              <th scope="col" className={th}>Cliente</th>
              <th scope="col" className={th}>Situação</th>
              <th scope="col" className={th}>Etapa atual</th>
              <th scope="col" className={th}>Fim previsto da etapa</th>
              <th scope="col" className={`${th} text-right`}>Etapas prontas</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {linhas.map((o) => (
              <tr key={o.projetoId}>
                <td className="px-3 py-2">
                  <Link href={`/obras/${o.projetoId}`} className="hover:underline">
                    {o.codigo} · {o.titulo}
                  </Link>
                </td>
                <td className="px-3 py-2">{o.cliente}</td>
                <td className="px-3 py-2">{o.status === "EM_EXECUCAO" ? "Em execução" : "Aprovada"}</td>
                <td className="px-3 py-2">{o.etapaAtual ? `${o.etapaAtual}${o.etapaBloqueada ? " (bloqueada)" : ""}` : "—"}</td>
                <td className="px-3 py-2 tabular-nums">{o.fimPrevistoDaEtapa ? formatarDataCalendario(o.fimPrevistoDaEtapa.toISOString().slice(0, 10)) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {o.etapasConcluidas}/{o.etapasTotal}
                </td>
              </tr>
            ))}
          </tbody>
        </TabelaDeRelatorio>
      )}
      <ComoECalculado className="mt-3" texto="Entram os projetos com situação “Aprovado” ou “Em execução”. A etapa atual é a primeira em andamento; se nenhuma estiver, a primeira bloqueada; senão a primeira pendente. Etapas dispensadas não contam no total." />
    </>
  );
}
