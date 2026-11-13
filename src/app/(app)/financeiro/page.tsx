import { Download, Landmark, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { somarDias } from "@/lib/dominio/calendario";
import { fluxoRealizado, janelasDeDias, periodosMensais, projetarFluxo } from "@/lib/dominio/fluxo-caixa";
import { somarMeses } from "@/lib/dominio/parcelamento";
import { dataLocalDoInstante, formatarMoeda } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { BotaoImprimir } from "@/modules/relatorios/components/botao-imprimir";
import { GraficoDoFluxo } from "@/modules/financeiro/components/grafico-do-fluxo";
import { AvisoDeSaldoNaoInformado, ValorEmReais } from "@/modules/financeiro/components/painel-de-contas";
import { carregarDadosDoFluxo } from "@/modules/financeiro/queries-fluxo";
import { lerParametrosFinanceiros } from "@/modules/financeiro/queries-receber";

export const metadata: Metadata = { title: "Visão geral e fluxo de caixa" };

const MESES_ADIANTE = 6;
const MESES_ATRAS = 3;

function Cartao({ titulo, valor, sub, href, alerta }: { titulo: string; valor: React.ReactNode; sub?: React.ReactNode; href?: string; alerta?: boolean }) {
  const conteudo = (
    <>
      <p className="text-muted-foreground text-sm">{titulo}</p>
      <p className={cn("text-2xl font-semibold tabular-nums", alerta && "text-destructive")}>{valor}</p>
      {sub ? <div className="text-muted-foreground mt-1 grid gap-0.5 text-xs">{sub}</div> : null}
    </>
  );
  return href ? (
    <Link href={href} className="hover:border-primary/50 focus-visible:ring-ring/50 rounded-xl border p-4 outline-none focus-visible:ring-3">
      {conteudo}
    </Link>
  ) : (
    <div className="rounded-xl border p-4">{conteudo}</div>
  );
}

export default async function PaginaDoFluxo({ searchParams }: { searchParams: Promise<{ visao?: string }> }) {
  await exigirSessao();
  const { visao: visaoBruta } = await searchParams;
  const visao = visaoBruta === "dias" ? "dias" : "meses";
  const hoje = dataLocalDoInstante(new Date());
  const config = await lerParametrosFinanceiros();

  const primeiroDoMes = `${hoje.slice(0, 7)}-01`;
  const desde = somarMeses(primeiroDoMes, -MESES_ATRAS);
  const periodosMeses = periodosMensais(hoje, MESES_ADIANTE);
  // O horizonte cobre as duas visões (90 dias e o último mês): recorrências ainda não geradas entram até ali.
  const fimDosMeses = periodosMeses[periodosMeses.length - 1].fim;
  const ate = fimDosMeses > somarDias(hoje, 90) ? fimDosMeses : somarDias(hoje, 90);
  const dados = await carregarDadosDoFluxo(hoje, { desde, ate, diasEmBreve: config.diasAlertaVencimento });

  const periodos = visao === "dias" ? janelasDeDias(hoje, [30, 60, 90]) : periodosMeses;
  const projetado = projetarFluxo({ hoje, saldoAtualCentavos: dados.saldoAtualCentavos, periodos, aReceber: dados.aReceber, aPagar: dados.aPagar });
  const em30 = projetarFluxo({ hoje, saldoAtualCentavos: dados.saldoAtualCentavos, periodos: janelasDeDias(hoje, [30, 60, 90]), aReceber: dados.aReceber, aPagar: dados.aPagar });

  // Realizado dos meses anteriores e do atual (até hoje), para comparar com o projetado.
  const mesesPassados = periodosMensais(desde, MESES_ATRAS + 1).map((p, i) => (i === MESES_ATRAS ? { ...p, fim: hoje } : p));
  const realizado = fluxoRealizado(dados.realizados, mesesPassados);
  const projetadoMeses = visao === "meses" ? projetado : projetarFluxo({ hoje, saldoAtualCentavos: dados.saldoAtualCentavos, periodos: periodosMeses, aReceber: dados.aReceber, aPagar: dados.aPagar });
  const mesAtualRealizado = realizado[MESES_ATRAS];

  const pontos = projetado.linhas.map((l) => ({ rotulo: l.rotulo, entradasCentavos: l.entradasCentavos, saidasCentavos: l.saidasCentavos, saldoCentavos: l.saldoProjetadoCentavos }));

  if (dados.contas.length === 0) {
    return (
      <>
        <CabecalhoPagina titulo="Visão geral e fluxo de caixa" descricao="Saldo, o que entra e o que sai, realizado e projetado." />
        <EstadoVazio
          icone={Landmark}
          titulo="Cadastre as contas onde o dinheiro entra e sai"
          descricao="O fluxo de caixa parte do saldo das contas. O saldo inicial é opcional: o sistema não inventa saldo e avisa enquanto ele faltar."
          acao={
            <Link href="/financeiro/contas" className={buttonVariants()}>
              Cadastrar a primeira conta
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Visão geral e fluxo de caixa"
        descricao="Saldo das contas, o que há a receber e a pagar, e o fluxo realizado × projetado."
        acoes={
          <>
            <BotaoImprimir />
            <a href={`/api/exportar/financeiro/fluxo?visao=${visao}`} className={cn(buttonVariants({ variant: "outline" }), "print:hidden")}>
              <Download aria-hidden /> Exportar CSV
            </a>
            <Link href="/financeiro/dre" className={cn(buttonVariants({ variant: "outline" }), "print:hidden")}>
              DRE gerencial
            </Link>
            <Link href="/relatorios" className={buttonVariants({ variant: "outline" })}>
              Relatórios
            </Link>
          </>
        }
      />

      <div className="grid gap-6">
        <AvisoDeSaldoNaoInformado nomes={dados.contasSemSaldo} />
        {dados.contasSemSaldo.length > 0 ? (
          <p className="text-muted-foreground -mt-4 text-sm">
            O saldo projetado parte do saldo atual: com saldo não informado ele mostra só o movimento registrado, então o fluxo abaixo mostra a <strong>variação</strong> do caixa, não o dinheiro disponível.
          </p>
        ) : null}

        <section aria-labelledby="titulo-cartoes" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <h2 id="titulo-cartoes" className="sr-only">
            Resumo
          </h2>
          <Cartao titulo="Saldo hoje (contas ativas)" valor={<ValorEmReais centavos={dados.saldoAtualCentavos} />} href="/financeiro/contas" sub={<span>{dados.contas.length} conta{dados.contas.length === 1 ? "" : "s"}</span>} />
          <Cartao
            titulo="A receber"
            valor={formatarMoeda(dados.resumoReceber.vencidoCentavos + dados.resumoReceber.hojeCentavos + dados.resumoReceber.proximosCentavos)}
            href="/financeiro/receber"
            alerta={dados.resumoReceber.vencidoCentavos > 0}
            sub={
              <>
                <span>Vencido: {formatarMoeda(dados.resumoReceber.vencidoCentavos)}</span>
                <span>Hoje: {formatarMoeda(dados.resumoReceber.hojeCentavos)}</span>
                <span>Próximos {config.diasAlertaVencimento} dias: {formatarMoeda(dados.resumoReceber.proximosCentavos)}</span>
              </>
            }
          />
          <Cartao
            titulo="A pagar"
            valor={formatarMoeda(dados.resumoPagar.vencidoCentavos + dados.resumoPagar.hojeCentavos + dados.resumoPagar.proximosCentavos)}
            href="/financeiro/pagar"
            alerta={dados.resumoPagar.vencidoCentavos > 0}
            sub={
              <>
                <span>Vencido: {formatarMoeda(dados.resumoPagar.vencidoCentavos)}</span>
                <span>Hoje: {formatarMoeda(dados.resumoPagar.hojeCentavos)}</span>
                <span>Próximos {config.diasAlertaVencimento} dias: {formatarMoeda(dados.resumoPagar.proximosCentavos)}</span>
              </>
            }
          />
          <Cartao
            titulo="Saldo projetado"
            valor={<ValorEmReais centavos={em30.linhas[0].saldoProjetadoCentavos} />}
            sub={
              <>
                <span>em 30 dias (60: {formatarMoeda(em30.linhas[1].saldoProjetadoCentavos)})</span>
                <span>em 90 dias: {formatarMoeda(em30.linhas[2].saldoProjetadoCentavos)}</span>
              </>
            }
          />
        </section>

        <section aria-labelledby="titulo-fluxo" className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="titulo-fluxo" className="font-medium">
              Fluxo projetado
            </h2>
            <nav aria-label="Visão do fluxo" className="flex gap-2">
              {[
                { id: "meses", rotulo: "Por mês" },
                { id: "dias", rotulo: "30, 60 e 90 dias" },
              ].map((v) => (
                <Link
                  key={v.id}
                  href={v.id === "meses" ? "/financeiro" : "/financeiro?visao=dias"}
                  aria-current={visao === v.id ? "page" : undefined}
                  className={cn("inline-flex min-h-9 items-center rounded-lg border px-3 text-sm", visao === v.id ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent")}
                >
                  {v.rotulo}
                </Link>
              ))}
            </nav>
          </div>
          <GraficoDoFluxo pontos={pontos} descricao={`Entradas, saídas e saldo projetado ${visao === "dias" ? "em 30, 60 e 90 dias" : "nos próximos meses"}.`} />

          <ul className="grid gap-2 md:hidden">
            {projetado.linhas.map((l) => (
              <li key={l.inicio} className="grid gap-1 rounded-xl border p-3 text-sm">
                <p className="font-medium">{l.rotulo}</p>
                <p className="text-muted-foreground">
                  Entradas: {formatarMoeda(l.entradasCentavos)}
                  {l.entradasPrevistasPorEtapaCentavos > 0 ? ` (${formatarMoeda(l.entradasPrevistasPorEtapaCentavos)} pela previsão da etapa)` : ""}
                  {l.entradasVencidasCentavos > 0 ? ` (${formatarMoeda(l.entradasVencidasCentavos)} já vencidos, esperados para hoje)` : ""}
                </p>
                <p className="text-muted-foreground">Saídas: {formatarMoeda(l.saidasCentavos)}</p>
                <p>
                  Saldo projetado: <strong><ValorEmReais centavos={l.saldoProjetadoCentavos} /></strong>
                </p>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <caption className="sr-only">Fluxo projetado por período</caption>
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th scope="col" className="py-2 pr-3 font-medium">Período</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Entradas</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Saídas</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Líquido</th>
                  <th scope="col" className="py-2 text-right font-medium">Saldo projetado</th>
                </tr>
              </thead>
              <tbody>
                {projetado.linhas.map((l) => (
                  <tr key={l.inicio} className="border-b">
                    <td className="py-2 pr-3">{l.rotulo}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatarMoeda(l.entradasCentavos)}
                      {l.entradasPrevistasPorEtapaCentavos > 0 ? <span className="text-muted-foreground block text-xs">{formatarMoeda(l.entradasPrevistasPorEtapaCentavos)} pela previsão da etapa</span> : null}
                      {l.entradasVencidasCentavos > 0 ? <span className="text-muted-foreground block text-xs">{formatarMoeda(l.entradasVencidasCentavos)} já vencidos, esperados para hoje</span> : null}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatarMoeda(l.saidasCentavos)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      <ValorEmReais centavos={l.liquidoCentavos} />
                    </td>
                    <td className="py-2 text-right font-medium tabular-nums">
                      <ValorEmReais centavos={l.saldoProjetadoCentavos} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-muted-foreground grid gap-1 text-xs">
            {projetado.vencidos.aReceberCentavos > 0 || projetado.vencidos.aPagarCentavos > 0 ? (
              <p className="flex items-start gap-1">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />
                <span>
                  Já venceram: <Link href="/financeiro/receber?aba=atrasadas" className="underline">{formatarMoeda(projetado.vencidos.aReceberCentavos)} a receber</Link> (entram no fluxo como esperados para hoje
                  {projetado.vencidos.aReceberPrometidoCentavos > 0 ? `; ${formatarMoeda(projetado.vencidos.aReceberPrometidoCentavos)} na data que o cliente prometeu` : ""}; o atraso continua contado pelo vencimento original) e{" "}
                  <Link href="/financeiro/pagar?aba=atrasadas" className="underline">{formatarMoeda(projetado.vencidos.aPagarCentavos)} a pagar</Link> (já descontados das saídas do primeiro período, porque são dívida certa). Se o cliente pediu mais prazo, registre na parcela (“Cliente pediu mais prazo”).
                </span>
              </p>
            ) : null}
            {projetado.semPrevisao.aReceberCentavos > 0 ? <p>{formatarMoeda(projetado.semPrevisao.aReceberCentavos)} a receber aguardam uma etapa sem data prevista (ou com a etapa atrasada): não entram em nenhum período.</p> : null}
            {projetado.aposOHorizonte.aReceberCentavos > 0 || projetado.aposOHorizonte.aPagarCentavos > 0 ? (
              <p>Depois do último período: {formatarMoeda(projetado.aposOHorizonte.aReceberCentavos)} a receber e {formatarMoeda(projetado.aposOHorizonte.aPagarCentavos)} a pagar.</p>
            ) : null}
            {dados.recorrenciasVirtuais > 0 ? <p>{dados.recorrenciasVirtuais} ocorrência(s) de contas recorrentes ainda não geradas entram como saídas previstas.</p> : null}
            <details>
              <summary className="cursor-pointer">Como é calculado</summary>
              <p className="mt-1">
                Saldo projetado = saldo atual das contas + entradas previstas − saídas previstas, período a período. Entradas: parcelas a receber pelo que ainda falta receber, na data que o cliente prometeu (“pediu até o dia X”) ou, sem promessa, pelo vencimento; a que já venceu entra como esperada para hoje, e as que aguardam etapa entram pela data prevista de fim da etapa. O atraso e a inadimplência não mudam: seguem o vencimento original. Saídas: contas a pagar pelo vencimento e as
                recorrências ainda não geradas. O realizado vem só dos lançamentos (transferências entre contas ficam de fora).
              </p>
            </details>
          </div>
        </section>

        <section aria-labelledby="titulo-realizado" className="grid gap-3">
          <h2 id="titulo-realizado" className="font-medium">
            Realizado × projetado por mês
          </h2>
          <ul className="grid gap-2">
            {mesesPassados.map((p, i) => {
              const r = realizado[i];
              const proj = i === MESES_ATRAS ? projetadoMeses.linhas[0] : null;
              return (
                <li key={p.inicio} className="grid gap-1 rounded-xl border p-3 text-sm sm:grid-cols-[8rem_1fr_1fr_1fr] sm:items-center">
                  <p className="font-medium">
                    {p.rotulo}
                    {i === MESES_ATRAS ? " (mês atual)" : ""}
                  </p>
                  <p>
                    <span className="text-muted-foreground text-xs">Entrou </span>
                    {formatarMoeda(r.entradasCentavos)}
                  </p>
                  <p>
                    <span className="text-muted-foreground text-xs">Saiu </span>
                    {formatarMoeda(r.saidasCentavos)}
                  </p>
                  <p>
                    <span className="text-muted-foreground text-xs">Líquido </span>
                    <ValorEmReais centavos={r.liquidoCentavos} />
                    {proj ? <span className="text-muted-foreground block text-xs">Ainda previsto neste mês: +{formatarMoeda(proj.entradasCentavos)} / −{formatarMoeda(proj.saidasCentavos)}</span> : null}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="text-muted-foreground text-xs">
            No mês atual, entrou {formatarMoeda(mesAtualRealizado.entradasCentavos)} e saiu {formatarMoeda(mesAtualRealizado.saidasCentavos)} até hoje.
          </p>
        </section>

        <section aria-labelledby="titulo-contas" className="grid gap-2">
          <h2 id="titulo-contas" className="font-medium">
            Saldo por conta
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {dados.contas.map((c) => (
              <li key={c.id}>
                <Link href={`/financeiro/contas/${c.id}`} className="hover:border-primary/50 flex items-center justify-between gap-2 rounded-xl border p-3">
                  <span>
                    {c.nome}
                    {!c.saldoInicialInformado ? <span className="text-muted-foreground block text-xs">saldo não informado</span> : null}
                  </span>
                  <ValorEmReais centavos={c.saldoAtualCentavos} className="font-medium" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
