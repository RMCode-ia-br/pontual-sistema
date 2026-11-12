import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Button, buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { ROTULO_TIPO_PROBLEMA, type TipoDoProblema } from "@/lib/dominio/chamados";
import { ROTULO_TIPO_ETAPA } from "@/lib/dominio/etapas";
import { formatarMoeda } from "@/lib/formatadores";
import { montarConsulta } from "@/lib/listas/parametros";
import { BotaoImprimir } from "@/modules/relatorios/components/botao-imprimir";
import { GraficoDeBarras } from "@/modules/relatorios/components/grafico-de-barras";
import { carregarRelatorioDeObras, lerPeriodoDoRelatorioDeObras } from "@/modules/relatorios/obras";

export const metadata: Metadata = { title: "Obras e assistência" };

const br = (d: string) => d.split("-").reverse().join("/");
const numero = (n: number | null) => (n === null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
const pct = (n: number | null) => (n === null ? "—" : `${numero(n)}%`);

function Definicao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details className="text-muted-foreground text-xs">
      <summary className="cursor-pointer select-none">Como é calculado: {titulo}</summary>
      <p className="mt-1 max-w-prose">{children}</p>
    </details>
  );
}

export default async function PaginaRelatorioDeObras({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSessao();
  const periodo = lerPeriodoDoRelatorioDeObras(await searchParams);
  const r = await carregarRelatorioDeObras(periodo);
  const estiloData = "border-input bg-background h-9 rounded-lg border px-2.5 text-sm";
  const p = r.pontualidade;
  const a = r.assistencias;

  return (
    <>
      <p className="mb-2 text-sm print:hidden">
        <Link href="/relatorios" className="text-muted-foreground hover:underline">
          ← Relatórios
        </Link>
      </p>
      <CabecalhoPagina
        titulo="Obras e assistência"
        descricao={`Pontualidade, atrasos e assistências de ${br(periodo.de)} a ${br(periodo.ate)}. Cada número mostra como é calculado.`}
        acoes={
          <>
            <BotaoImprimir />
            <a href={`/api/exportar/relatorios/obras${montarConsulta({ de: periodo.de, ate: periodo.ate })}`} className={buttonVariants({ variant: "outline" })}>
              <Download aria-hidden /> Exportar CSV
            </a>
          </>
        }
      />

      <form method="get" action="/relatorios/obras" role="search" className="mb-6 flex flex-wrap items-end gap-2 print:hidden">
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">De</span>
          <input type="date" name="de" defaultValue={periodo.de} className={estiloData} />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">Até</span>
          <input type="date" name="ate" defaultValue={periodo.ate} className={estiloData} />
        </label>
        <Button type="submit" variant="secondary" className="h-9">
          Aplicar
        </Button>
      </form>

      {r.truncado ? (
        <p role="alert" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          O período tem registros demais: o relatório considerou só os mais recentes. Reduza o período.
        </p>
      ) : null}

      <div className="grid gap-8">
        <section aria-labelledby="r-pontualidade" className="grid gap-3">
          <h2 id="r-pontualidade" className="text-lg font-medium">
            Pontualidade das obras concluídas
          </h2>
          {p.concluidas === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma obra concluída com prazo definido nesse período{p.semPrazo > 0 ? ` (${p.semPrazo} sem prazo ficaram de fora)` : ""}. A pontualidade aparece aqui quando houver.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-xl border p-4">
                  <p className="text-muted-foreground text-sm">Pontualidade</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums">{pct(p.pontualidadePct)}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {p.pontuais} de {p.concluidas} no prazo, com as pausas justificadas.
                  </p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-muted-foreground text-sm">Sem considerar pausas</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums">{pct(p.pontualidadeSemPausasPct)}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {p.pontuaisSemPausas} de {p.concluidas} no prazo original.
                  </p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-muted-foreground text-sm">Desvio médio</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums">{numero(p.desvioMedioDias)} dias</p>
                  <p className="text-muted-foreground mt-1 text-xs">Negativo = antes do prazo. Sem pausas: {numero(p.desvioMedioSemPausasDias)} dias.</p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-muted-foreground text-sm">Obras concluídas</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums">{p.concluidas + p.semPrazo}</p>
                  <p className="text-muted-foreground mt-1 text-xs">{p.semPrazo > 0 ? `${p.semPrazo} sem prazo definido não entram na porcentagem.` : "Todas com prazo definido."}</p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <caption className="sr-only">Obras concluídas no período</caption>
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th scope="col" className="p-2">Obra</th>
                      <th scope="col" className="p-2">Concluída em</th>
                      <th scope="col" className="p-2">Prazo prometido</th>
                      <th scope="col" className="p-2 text-right">Desvio (dias)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.obrasConcluidas.map((o) => (
                      <tr key={o.id} className="border-t">
                        <td className="p-2">
                          <Link href={`/obras/${o.id}`} className="hover:underline">
                            {o.titulo}
                          </Link>
                          <span className="text-muted-foreground block text-xs">
                            {o.codigo} · {o.clienteNome}
                          </span>
                        </td>
                        <td className="p-2 tabular-nums">{o.concluidaEm ? br(o.concluidaEm) : "—"}</td>
                        <td className="p-2 tabular-nums">{o.prazoPrometido ? br(o.prazoPrometido) : "Sem prazo"}</td>
                        <td className="p-2 text-right tabular-nums">{o.desvioDias === null ? "—" : o.desvioDias > 0 ? `${o.desvioDias} de atraso` : o.desvioDias < 0 ? `${Math.abs(o.desvioDias)} de folga` : "No dia"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <Definicao titulo="pontualidade">
            Obras concluídas no período até o prazo prometido ÷ obras concluídas no período que tinham prazo. O prazo prometido já soma as pausas justificadas (a coluna “sem considerar pausas” usa o prazo contado do início, sem pausas). O desvio é em dias úteis ou corridos, conforme a obra. Concluir no próprio dia do prazo é pontual.
          </Definicao>
        </section>

        <section aria-labelledby="r-atrasos" className="grid gap-3">
          <h2 id="r-atrasos" className="text-lg font-medium">
            Atrasos por etapa
          </h2>
          {r.atrasosPorEtapa.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma etapa concluída no período e nenhuma etapa atrasada hoje.</p>
          ) : (
            <>
              <GraficoDeBarras dados={r.atrasosPorEtapa.map((l) => ({ nome: ROTULO_TIPO_ETAPA[l.tipo], valor: l.comAtraso }))} descricao="Etapas concluídas com atraso no período, por etapa" />
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <caption className="sr-only">Atrasos por etapa</caption>
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th scope="col" className="p-2">Etapa</th>
                      <th scope="col" className="p-2 text-right">Concluídas</th>
                      <th scope="col" className="p-2 text-right">Com atraso</th>
                      <th scope="col" className="p-2 text-right">Atraso médio (dias)</th>
                      <th scope="col" className="p-2 text-right">Atrasadas hoje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.atrasosPorEtapa.map((l) => (
                      <tr key={l.tipo} className="border-t">
                        <td className="p-2">{ROTULO_TIPO_ETAPA[l.tipo]}</td>
                        <td className="p-2 text-right tabular-nums">{l.concluidasNoPeriodo}</td>
                        <td className="p-2 text-right tabular-nums">{l.comPrazo === 0 ? "—" : `${l.comAtraso} de ${l.comPrazo}`}</td>
                        <td className="p-2 text-right tabular-nums">{numero(l.atrasoMedioDias)}</td>
                        <td className="p-2 text-right tabular-nums">
                          {l.abertasAtrasadas > 0 ? (
                            <Link href="/obras?semaforo=VERMELHO" className="text-destructive hover:underline">
                              {l.abertasAtrasadas}
                            </Link>
                          ) : (
                            0
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <Definicao titulo="atrasos por etapa">
            Etapa concluída no período (pela data real de fim) conta como atrasada se terminou depois da data prevista; só as que tinham data prevista entram na conta, e o atraso é em dias corridos, só das que atrasaram. “Atrasadas hoje” é a foto de agora (etapas abertas de obras em andamento depois da data prevista) e não depende do período.
          </Definicao>
        </section>

        <section aria-labelledby="r-motivos" className="grid gap-3">
          <h2 id="r-motivos" className="text-lg font-medium">
            Pausas e bloqueios por motivo
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid content-start gap-2">
              <h3 className="text-sm font-medium">Pausas iniciadas no período</h3>
              {r.pausasPorMotivo.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nenhuma pausa registrada no período.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Pausas por motivo</caption>
                    <thead className="bg-muted/50 text-left">
                      <tr>
                        <th scope="col" className="p-2">Motivo</th>
                        <th scope="col" className="p-2 text-right">Pausas</th>
                        <th scope="col" className="p-2 text-right">Justificadas</th>
                        <th scope="col" className="p-2 text-right">Dias</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.pausasPorMotivo.map((m) => (
                        <tr key={m.motivo} className="border-t">
                          <td className="p-2">{m.motivo}</td>
                          <td className="p-2 text-right tabular-nums">{m.quantidade}</td>
                          <td className="p-2 text-right tabular-nums">{m.justificadas}</td>
                          <td className="p-2 text-right tabular-nums">{m.dias}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="grid content-start gap-2">
              <h3 className="text-sm font-medium">Etapas bloqueadas agora</h3>
              {r.bloqueadasAgora.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nenhuma etapa bloqueada em obras em andamento.</p>
              ) : (
                <ul className="divide-y rounded-xl border text-sm">
                  {r.bloqueadasAgora.map((b) => (
                    <li key={b.motivo} className="flex justify-between gap-2 p-2">
                      <span>{b.motivo}</span>
                      <span className="tabular-nums">{b.quantidade}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <Definicao titulo="pausas e bloqueios">
            Pausas: as que começaram no período, agrupadas pelo motivo; os dias são corridos, contando o primeiro e o último (pausa em curso conta até hoje). Bloqueios: etapas bloqueadas agora em obras em andamento; o sistema não guarda o histórico de bloqueios já resolvidos, por isso não há recorte por período.
          </Definicao>
        </section>

        <section aria-labelledby="r-assistencia" className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="r-assistencia" className="text-lg font-medium">
              Assistências
            </h2>
            <Link href="/obras/assistencia" className="text-primary text-sm hover:underline print:hidden">
              Abrir a lista de chamados
            </Link>
          </div>
          {a.total === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum chamado aberto nesse período. Em aberto hoje, de qualquer data: {r.chamadosEmAbertoHoje}.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-xl border p-4">
                  <p className="text-muted-foreground text-sm">Chamados no período</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums">{a.total}</p>
                  <p className="text-muted-foreground mt-1 text-xs">Em aberto hoje, de qualquer data: {r.chamadosEmAbertoHoje}.</p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-muted-foreground text-sm">Em garantia × fora</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums">
                    {a.emGarantia} × {a.foraDaGarantia}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">Pela classificação atual de cada chamado.</p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-muted-foreground text-sm">Tempo para resolver</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums">{a.diasMedioParaResolver === null ? "—" : `${numero(a.diasMedioParaResolver)} dias`}</p>
                  <p className="text-muted-foreground mt-1 text-xs">{a.resolvidos} resolvido(s) de {a.total}.</p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-muted-foreground text-sm">Visitas cobradas</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums">{a.visitasCobradas}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {a.valorCobradoCentavos > 0 ? `${formatarMoeda(a.valorCobradoCentavos)} informados; ` : ""}
                    {a.cobrancasGeradas} já virou conta a receber.
                  </p>
                </div>
              </div>
              <ul className="divide-y rounded-xl border text-sm" aria-label="Chamados por tipo de problema">
                {a.porTipo.map((t) => (
                  <li key={t.tipo} className="flex justify-between gap-2 p-2">
                    <span>{ROTULO_TIPO_PROBLEMA[t.tipo as TipoDoProblema] ?? t.tipo}</span>
                    <span className="tabular-nums">{t.quantidade}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Definicao titulo="assistências">
            Chamados abertos no período. “Em garantia × fora” usa a classificação atual de cada chamado (a que o gestor confirmou). O tempo para resolver é a média, em dias corridos, da abertura até a resolução, só dos resolvidos. “Visitas cobradas” são os chamados com a cobrança marcada (exceto cancelados); o valor soma só o que já foi informado.
          </Definicao>
        </section>
      </div>
    </>
  );
}
