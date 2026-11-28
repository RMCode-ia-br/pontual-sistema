import { Download, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LinkDeCsvDaTabela } from "@/components/relatorios/link-de-csv-da-tabela";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { FiltroSelect } from "@/components/lista/filtros-da-lista";
import { lerVisao, NavegacaoDeVisoes, type Visao } from "@/components/relatorios/navegacao-de-visoes";
import { Button, buttonVariants } from "@/components/ui/button";
import { exigirModulo } from "@/lib/auth/modulo";
import { valorParaCentavos } from "@/lib/dominio/numeros";
import { ROTULO_STATUS_PROJETO } from "@/lib/dominio/funil";
import { lerCortesDeFaixa } from "@/lib/dominio/relatorios-comerciais";
import { dataLocalDoInstante, formatarMoeda } from "@/lib/formatadores";
import { montarConsulta } from "@/lib/listas/parametros";
import { ROTULO_ORIGEM, ORIGENS } from "@/modules/clientes/schemas";
import { DEFINICAO_DOS_MOTIVOS_DE_PERDA } from "@/modules/indicadores/perdas";
import { PORTES, ROTULO_PORTE } from "@/modules/projetos/schemas";
import { BotaoImprimir } from "@/modules/relatorios/components/botao-imprimir";
import { GraficoDeBarras } from "@/modules/relatorios/components/grafico-de-barras";
import { carregarRelatorioDoFunil, lerFiltrosDoRelatorio } from "@/modules/relatorios/funil";
import { listarUsuariosAtivos } from "@/modules/tarefas/queries";

import { FiltroDeCortes, VisaoFaixas, VisaoTempos } from "./visoes";

export const metadata: Metadata = { title: "Funil e origem" };

const VISOES = [
  { valor: "funil", titulo: "Funil" },
  { valor: "perdas", titulo: "Motivos de perda" },
  { valor: "tempos", titulo: "Tempos de resposta" },
  { valor: "faixas", titulo: "Ganhas e perdidas por preço" },
] as const satisfies readonly Visao[];

const br = (d: string) => d.split("-").reverse().join("/");
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR")}%`);

function Definicao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details className="text-muted-foreground text-xs">
      <summary className="cursor-pointer select-none">Como é calculado: {titulo}</summary>
      <p className="mt-1 max-w-prose">{children}</p>
    </details>
  );
}

export default async function PaginaRelatorioFunil({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirModulo(["RELATORIOS", "COMERCIAL"]);
  const brutos = await searchParams;
  const hoje = dataLocalDoInstante(new Date());
  const filtros = lerFiltrosDoRelatorio(brutos, hoje);
  const visao = lerVisao(brutos.visao, VISOES);
  const cortesTexto = ((Array.isArray(brutos.cortes) ? brutos.cortes[0] : brutos.cortes) ?? "").trim() || null;
  const cortes = lerCortesDeFaixa(cortesTexto, valorParaCentavos);
  const comFiltrosDeProjeto = visao === "funil" || visao === "perdas";
  const usuarios = comFiltrosDeProjeto ? await listarUsuariosAtivos() : [];

  const parametros = { de: filtros.de, ate: filtros.ate, origem: filtros.origem, responsavel: filtros.responsavelId, porte: filtros.porte };
  const parametrosDaVisao = visao === "faixas" ? { cortes: cortesTexto ?? "" } : visao === "tempos" ? { de: filtros.de, ate: filtros.ate } : parametros;
  const estiloData = "border-input bg-background h-9 rounded-lg border px-2.5 text-sm";
  const descricao: Record<string, string> = {
    funil: `Grupo analisado: projetos CRIADOS de ${br(filtros.de)} a ${br(filtros.ate)}. Cada número leva à lista de projetos correspondente.`,
    perdas: `Grupo analisado: projetos PERDIDOS de ${br(filtros.de)} a ${br(filtros.ate)}, pela data da perda (de qualquer data de criação).`,
    tempos: `Grupo analisado: propostas decididas (aprovadas ou perdidas) de ${br(filtros.de)} a ${br(filtros.ate)}.`,
    faixas: `Grupo analisado: ganhas e perdidas dos últimos 12 meses até ${br(hoje)}.`,
  };

  return (
    <>
      <p className="mb-2 text-sm print:hidden">
        <Link href="/relatorios" className="text-muted-foreground hover:underline">
          ← Relatórios
        </Link>
      </p>
      <CabecalhoPagina
        titulo="Funil e origem dos clientes"
        descricao={descricao[visao]}
        acoes={
          <>
            <BotaoImprimir />
            <a href={`/api/exportar/relatorios/funil${montarConsulta({ ...parametrosDaVisao, visao })}`} className={buttonVariants({ variant: "outline" })}>
              <Download aria-hidden /> Exportar CSV
            </a>
          </>
        }
      />
      <NavegacaoDeVisoes visoes={VISOES} atual={visao} parametros={Object.fromEntries(Object.entries(parametrosDaVisao).filter(([, v]) => typeof v === "string" && v !== "")) as Record<string, string>} rotulo="Visões do relatório de funil" />

      {visao === "faixas" ? <FiltroDeCortes cortesTexto={cortesTexto} /> : (
        <form method="get" action="/relatorios/funil" role="search" className="mb-6 flex flex-wrap items-end gap-2 print:hidden">
          <input type="hidden" name="visao" value={visao} />
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">De</span>
            <input type="date" name="de" defaultValue={filtros.de} className={estiloData} />
          </label>
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Até</span>
            <input type="date" name="ate" defaultValue={filtros.ate} className={estiloData} />
          </label>
          {comFiltrosDeProjeto ? (
            <>
              <FiltroSelect nome="origem" rotulo="Origem" valor={filtros.origem} opcoes={ORIGENS.map((o) => ({ valor: o, rotulo: ROTULO_ORIGEM[o] }))} />
              <FiltroSelect nome="responsavel" rotulo="Responsável" valor={filtros.responsavelId} opcoes={usuarios.map((u) => ({ valor: u.id, rotulo: u.nome }))} />
              <FiltroSelect nome="porte" rotulo="Porte" valor={filtros.porte} opcoes={PORTES.map((p) => ({ valor: p, rotulo: ROTULO_PORTE[p] }))} />
            </>
          ) : null}
          <Button type="submit" variant="secondary" className="h-9">
            Aplicar
          </Button>
        </form>
      )}

      {visao === "tempos" ? <VisaoTempos periodo={{ de: filtros.de, ate: filtros.ate }} /> : null}
      {visao === "faixas" ? <VisaoFaixas referencia={hoje} cortes={cortes} cortesTexto={cortesTexto} /> : null}
      {comFiltrosDeProjeto ? <VisaoDoFunil visao={visao} filtros={filtros} /> : null}
    </>
  );
}

async function VisaoDoFunil({ visao, filtros }: { visao: string; filtros: ReturnType<typeof lerFiltrosDoRelatorio> }) {
  const r = await carregarRelatorioDoFunil(filtros);
  const filtrosDeLista = { origem: filtros.origem, responsavel: filtros.responsavelId, porte: filtros.porte, de: filtros.de, ate: filtros.ate };
  const ordemDasFases = r.porFase;

  if (visao === "perdas") {
    return (
      <section aria-labelledby="r-perdas" className="grid gap-3">
        <h2 id="r-perdas" className="text-lg font-medium">
          Por que se perdem
        </h2>
        {r.motivos.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum projeto perdido nesse período.</p>
        ) : (
          <>
            <GraficoDeBarras dados={r.motivos.map((m) => ({ nome: m.nome, valor: m.quantidade }))} descricao="Projetos perdidos por motivo" />
            <ul className="divide-y rounded-xl border text-sm">
              {r.motivos.map((m) => (
                <li key={m.nome} className="flex justify-between gap-2 p-2">
                  <span>{m.nome}</span>
                  <span className="tabular-nums">{m.quantidade}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <Definicao titulo="motivos de perda">
          Perdidos no período (pela data da perda): {DEFINICAO_DOS_MOTIVOS_DE_PERDA} Por isso este total pode ser diferente do número de projetos criados no período, e também da coluna “Perdidos” da tabela por origem do funil, que conta só os projetos criados no período que hoje estão perdidos.
        </Definicao>
      </section>
    );
  }

  if (r.total === 0) {
    return (
      <EstadoVazio
        icone={Info}
        titulo="Nenhum projeto criado nesse período"
        descricao="Amplie o período ou limpe os filtros. Os projetos aparecem aqui assim que forem criados no funil."
        acao={
          <Link href="/projetos/novo" className={buttonVariants()}>
            Novo projeto
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid gap-8">
      <section aria-labelledby="r-resumo" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <h2 id="r-resumo" className="sr-only">
          Resumo
        </h2>
        <Link href={`/projetos${montarConsulta(filtrosDeLista)}`} className="hover:bg-accent rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">Projetos criados no período</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{r.total}</p>
        </Link>
        <Link href={`/projetos${montarConsulta({ semRetorno: "1" })}`} className="hover:bg-accent rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">Propostas sem retorno</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{r.semRetorno}</p>
          <p className="text-muted-foreground mt-1 text-xs">Hoje, de qualquer data.</p>
        </Link>
        <div className="rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">Taxa de fechamento</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{pct(r.taxaDeFechamento)}</p>
          <p className="text-muted-foreground mt-1 text-xs">{r.taxaDeFechamento === null ? "Aparece quando houver projetos aprovados ou perdidos com proposta." : `Ticket médio estimado: ${r.ticketMedioCentavos !== null ? formatarMoeda(r.ticketMedioCentavos) : "—"}`}</p>
        </div>
        <div className="col-span-1 grid gap-1 sm:col-span-3">
          <Definicao titulo="taxa de fechamento">Dos projetos CRIADOS no período: aprovados ÷ (aprovados + perdidos que chegaram a ter proposta enviada). Fica em branco enquanto não há nenhuma decisão. É diferente da taxa do painel, que olha as decisões dos últimos 90 dias, de qualquer projeto.</Definicao>
        </div>
      </section>

      <section aria-labelledby="r-fases" className="grid gap-3">
        <h2 id="r-fases" className="text-lg font-medium">
          Onde estão os projetos agora
        </h2>
        <GraficoDeBarras dados={ordemDasFases.map((f) => ({ nome: ROTULO_STATUS_PROJETO[f.status], valor: f.quantidade }))} descricao="Quantidade de projetos por fase atual" />
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <caption className="sr-only">Projetos por fase atual</caption>
            <thead className="bg-muted/50 text-left">
              <tr>
                <th scope="col" className="p-2">Fase</th>
                <th scope="col" className="p-2 text-right">Projetos</th>
                <th scope="col" className="p-2 text-right">Valor estimado</th>
              </tr>
            </thead>
            <tbody>
              {ordemDasFases.map((f) => (
                <tr key={f.status} className="border-t">
                  <td className="p-2">
                    <Link href={`/projetos${montarConsulta({ ...filtrosDeLista, status: f.status })}`} className="hover:underline">
                      {ROTULO_STATUS_PROJETO[f.status]}
                    </Link>
                  </td>
                  <td className="p-2 text-right tabular-nums">{f.quantidade}</td>
                  <td className="p-2 text-right tabular-nums">{f.valorCentavos > 0 ? formatarMoeda(f.valorCentavos) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Definicao titulo="fase atual">Cada projeto CRIADO no período conta na fase em que está hoje. O valor é a soma dos valores estimados (campo opcional do projeto; vazio conta zero).</Definicao>
      </section>

      <section aria-labelledby="r-conversao" className="grid gap-3">
        <h2 id="r-conversao" className="text-lg font-medium">
          Quantos chegaram a cada fase
        </h2>
        <LinkDeCsvDaTabela href={`/api/exportar/relatorios/funil${montarConsulta({ ...filtrosDeLista, visao: "funil", tabela: "conversao" })}`} />
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <caption className="sr-only">Conversão entre as fases do funil</caption>
            <thead className="bg-muted/50 text-left">
              <tr>
                <th scope="col" className="p-2">Fase</th>
                <th scope="col" className="p-2 text-right">Chegaram</th>
                <th scope="col" className="p-2 text-right">Do total</th>
                <th scope="col" className="p-2 text-right">Da fase anterior</th>
              </tr>
            </thead>
            <tbody>
              {r.conversao.map((c) => (
                <tr key={c.etapa} className="border-t">
                  <td className="p-2">{ROTULO_STATUS_PROJETO[c.etapa]}</td>
                  <td className="p-2 text-right tabular-nums">{c.chegaram}</td>
                  <td className="p-2 text-right tabular-nums">{pct(c.percentualDoTotal)}</td>
                  <td className="p-2 text-right tabular-nums">{pct(c.percentualDaAnterior)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Definicao titulo="conversão">Grupo: projetos CRIADOS no período. “Chegou à fase” vale mesmo que o projeto tenha sido perdido depois (usa o histórico de fases). “Da fase anterior” fica em branco quando ninguém passou pela fase anterior.</Definicao>
      </section>

      <section aria-labelledby="r-origem" className="grid gap-3">
        <h2 id="r-origem" className="text-lg font-medium">
          De onde vêm os clientes
        </h2>
        <LinkDeCsvDaTabela href={`/api/exportar/relatorios/funil${montarConsulta({ ...filtrosDeLista, visao: "funil", tabela: "origem" })}`} />
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <caption className="sr-only">Funil por origem</caption>
            <thead className="bg-muted/50 text-left">
              <tr>
                <th scope="col" className="p-2">Origem</th>
                <th scope="col" className="p-2 text-right">Projetos</th>
                <th scope="col" className="p-2 text-right">Com visita</th>
                <th scope="col" className="p-2 text-right">Proposta enviada</th>
                <th scope="col" className="p-2 text-right">Aprovados</th>
                <th scope="col" className="p-2 text-right">Perdidos</th>
              </tr>
            </thead>
            <tbody>
              {r.porOrigem.map((o) => (
                <tr key={o.origem ?? "sem"} className="border-t">
                  <td className="p-2">
                    {o.origem ? (
                      <Link href={`/projetos${montarConsulta({ ...filtrosDeLista, origem: o.origem })}`} className="hover:underline">
                        {ROTULO_ORIGEM[o.origem as keyof typeof ROTULO_ORIGEM] ?? o.origem}
                      </Link>
                    ) : (
                      "Não informada"
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums">{o.leads}</td>
                  <td className="p-2 text-right tabular-nums">{o.comVisita}</td>
                  <td className="p-2 text-right tabular-nums">{o.comPropostaEnviada}</td>
                  <td className="p-2 text-right tabular-nums">{o.aprovados}</td>
                  <td className="p-2 text-right tabular-nums">{o.perdidos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Definicao titulo="funil por origem">Grupo: projetos CRIADOS no período, por origem do contato. O dinheiro vendido por origem está em Vendas, na visão “Origem dos clientes”.</Definicao>
      </section>
    </div>
  );
}
