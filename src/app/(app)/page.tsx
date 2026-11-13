import { History, ListChecks, PackageX, TriangleAlert, UserPlus, Users, Handshake } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { NumeroDoPainel, type Comparativo } from "@/components/relatorios/numero-do-painel";
import { SeletorDePeriodo } from "@/components/relatorios/seletor-de-periodo";
import { exigirSessao } from "@/lib/auth/sessao";
import { ROTULO_TIPO_ETAPA } from "@/lib/dominio/etapas";
import { ROTULO_STATUS_PROJETO } from "@/lib/dominio/funil";
import { percentualDaMeta } from "@/lib/dominio/indicadores";
import { dataLocalDoInstante, formatarDataCalendario, formatarDataHora, formatarMoeda } from "@/lib/formatadores";
import { montarConsulta } from "@/lib/listas/parametros";
import { ehMesInteiro, lerPeriodo, mesDaData, parametrosDoPeriodo, periodoDeComparacao, rotuloDoPeriodo, type Periodo } from "@/lib/periodo";
import { cn } from "@/lib/utils";
import { ROTULO_TIPO_EVENTO, type TipoEvento } from "@/modules/agenda/schemas";
import { resumoDeCadastros } from "@/modules/cadastros/resumo";
import { MESES_SEM_CONTATO } from "@/modules/clientes/queries";
import { ROTULO_ORIGEM } from "@/modules/clientes/schemas";
import { resumoComercial } from "@/modules/comercial/resumo";
import { resumoDeEstoque } from "@/modules/estoque/resumo";
import { resumoFinanceiro } from "@/modules/financeiro/resumo";
import { ocupacaoAtualDaFabrica } from "@/modules/indicadores/fabrica";
import { DIAS_DA_JANELA_DE_FECHAMENTO, fechamentoNaJanela, janelaDeFechamento, tempoVisitaAteProposta } from "@/modules/indicadores/fechamento";
import { faturamentoComNota, recebidoNoPeriodo } from "@/modules/indicadores/recebimentos";
import { vendidoNoPeriodo } from "@/modules/indicadores/vendas";
import { resumoDeObras } from "@/modules/obras/resumo";
import { DIAS_CUSTO_DESATUALIZADO } from "@/modules/produtos/queries";
import { resumoDePropostas } from "@/modules/propostas/resumo";
import { listarTarefas, resumoDeTarefas } from "@/modules/tarefas/queries";

export const metadata: Metadata = { title: "Painel" };

const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("pt-BR")}%`);

function Secao({ id, titulo, href, rotuloDoLink, children }: { id: string; titulo: string; href?: string; rotuloDoLink?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id={id} className="text-lg font-medium">
          {titulo}
        </h2>
        {href ? (
          <Link href={href} className="text-primary text-sm hover:underline">
            {rotuloDoLink}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default async function PaginaPainel({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const usuario = await exigirSessao();
  const agora = new Date();
  const hoje = dataLocalDoInstante(agora);
  const { periodo, tipo, aviso } = lerPeriodo(await searchParams, hoje);
  const cmp = periodoDeComparacao(periodo, hoje);
  const janela = janelaDeFechamento(periodo, hoje);
  const doPeriodo = parametrosDoPeriodo(periodo);
  const consultaDoPeriodo = montarConsulta(doPeriodo);
  // O relatório do funil só lê "de" e "ate" (não "mes"): o link leva as datas do período, para a lista bater com o número.
  const consultaDeAte = montarConsulta({ de: periodo.de, ate: periodo.ate });

  const [vendido, vendidoAnterior, vendidoAnoPassado, recebido, recebidoAnterior, recebidoAnoPassado, comNota, fechamento, tempo, fabrica, resumo, proximas, cadastros, comercial, propostas, obras, fin, estoque] = await Promise.all([
    vendidoNoPeriodo(periodo),
    vendidoNoPeriodo(cmp.anterior),
    vendidoNoPeriodo(cmp.anoPassado),
    recebidoNoPeriodo(periodo),
    recebidoNoPeriodo(cmp.anterior),
    recebidoNoPeriodo(cmp.anoPassado),
    faturamentoComNota(hoje),
    fechamentoNaJanela(janela),
    tempoVisitaAteProposta(periodo),
    ocupacaoAtualDaFabrica(hoje),
    resumoDeTarefas(usuario.id),
    listarTarefas({ status: "abertas" }),
    resumoDeCadastros(),
    resumoComercial(periodo),
    resumoDePropostas(),
    resumoDeObras(agora, periodo),
    resumoFinanceiro(),
    resumoDeEstoque(hoje),
  ]);

  const mesInteiro = ehMesInteiro(periodo);
  const meta = fin.metaMensalCentavos > 0 ? fin.metaMensalCentavos : null;
  const nomeDoMes = (p: Periodo) => rotuloDoPeriodo(mesDaData(p.de));
  const rotuloDeComparacao = (p: Periodo) => (cmp.emAndamento && mesInteiro ? `${nomeDoMes(p)} (até o dia ${Number(p.ate.slice(8))})` : rotuloDoPeriodo(p));
  const comparar = (atual: number, anterior: number, anoPassado: number): Comparativo[] => [
    { rotulo: rotuloDeComparacao(cmp.anterior), atual, comparacao: anterior, formatar: formatarMoeda },
    { rotulo: rotuloDeComparacao(cmp.anoPassado), atual, comparacao: anoPassado, formatar: formatarMoeda },
  ];
  const metaDetalhe = (valor: number) => (mesInteiro && meta ? `${pct(percentualDaMeta(valor, meta))} da meta de ${formatarMoeda(meta)}` : null);
  const pontualidade = obras.pontualidade;
  const periodoDaPontualidade = obras.periodoDaPontualidade;

  return (
    <>
      <CabecalhoPagina titulo={`Olá, ${usuario.nome}`} descricao="Um resumo do seu negócio. Toque em qualquer número para ver a lista que está por trás dele." />
      <SeletorDePeriodo periodo={periodo} tipo={tipo} hoje={hoje} />
      {aviso ? (
        <p role="status" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {aviso}
        </p>
      ) : null}

      <section aria-labelledby="titulo-numeros">
        <h2 id="titulo-numeros" className="mb-3 text-lg font-medium">
          O período em números <span className="text-muted-foreground text-sm font-normal">({rotuloDoPeriodo(periodo)})</span>
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumeroDoPainel
            titulo="Vendido"
            valor={formatarMoeda(vendido.totalCentavos)}
            href={`/relatorios/vendas${consultaDoPeriodo}`}
            definicao="Soma do valor aprovado de cada proposta que o cliente aprovou no período, pela data da aprovação. Cada parte de uma obra entra no mês em que foi aprovada."
            detalhe={
              <>
                <span className="block">{metaDetalhe(vendido.totalCentavos) ?? `${vendido.propostas} proposta(s) aprovada(s)`}</span>
                <span className="block">Sem nota: {formatarMoeda(vendido.semNotaCentavos)}</span>
                <span className="block">Com nota: {formatarMoeda(vendido.comNotaCentavos)}</span>
                {vendido.repasseDeImpostoCentavos > 0 ? <span className="block">Repasse de imposto, fora da margem: {formatarMoeda(vendido.repasseDeImpostoCentavos)}</span> : null}
              </>
            }
            comparativos={comparar(vendido.totalCentavos, vendidoAnterior.totalCentavos, vendidoAnoPassado.totalCentavos)}
          />
          <NumeroDoPainel
            titulo="Recebido"
            valor={formatarMoeda(recebido.totalCentavos)}
            href={`/financeiro/recebimentos${consultaDoPeriodo}`}
            definicao="Soma dos pagamentos recebidos de clientes no período, pela data do pagamento, sem os estornos."
            detalhe={
              <>
                <span className="block">{metaDetalhe(recebido.totalCentavos) ?? `${recebido.quantidade} pagamento(s)`}</span>
                <span className="block">Sem nota: {formatarMoeda(recebido.semNotaCentavos)}</span>
                <span className="block">Com nota: {formatarMoeda(recebido.comNotaCentavos)}</span>
              </>
            }
            comparativos={comparar(recebido.totalCentavos, recebidoAnterior.totalCentavos, recebidoAnoPassado.totalCentavos)}
          />
          <NumeroDoPainel
            titulo="Saldo daqui a 30 dias"
            valor={fin.temContas ? formatarMoeda(fin.projetado.em30Centavos) : "—"}
            href="/financeiro"
            alerta={fin.temContas && fin.projetado.em30Centavos < 0}
            definicao="Saldo das contas hoje, mais o que se espera receber, menos o que se tem a pagar nos próximos 30 dias. O que já venceu e ainda não foi recebido entra como esperado para hoje (ou na data que o cliente prometeu); o que já venceu a pagar sai já no primeiro período."
            detalhe={fin.temContas ? (fin.contasSemSaldo > 0 ? <span className="text-amber-700 dark:text-amber-400">Parcial: {fin.contasSemSaldo} conta(s) com saldo não informado; o valor mostra só o movimento registrado</span> : `60 dias: ${formatarMoeda(fin.projetado.em60Centavos)} · 90 dias: ${formatarMoeda(fin.projetado.em90Centavos)}`) : "Cadastre as contas para ver o saldo"}
          />
          <NumeroDoPainel
            titulo="Obras entregues no prazo"
            valor={pct(pontualidade.pontualidadePct)}
            href={`/obras${montarConsulta({ situacao: "concluidas", de: periodoDaPontualidade.de, ate: periodoDaPontualidade.ate })}`}
            definicao={`Das obras concluídas no período que tinham prazo, quantas terminaram até o prazo prometido (já com as pausas justificadas). Sem considerar as pausas: ${pct(pontualidade.pontualidadeSemPausasPct)}.`}
            detalhe={pontualidade.concluidas === 0 ? "Nenhuma obra concluída com prazo neste período" : `${pontualidade.pontuais} de ${pontualidade.concluidas} no prazo`}
          />
        </div>
      </section>

      <Secao id="titulo-atencao" titulo="Atenção hoje">
        <div className="grid gap-3 lg:grid-cols-2">
          <NumeroDoPainel titulo="Tarefas vencidas" valor={resumo.vencidas} href="/tarefas?status=abertas" alerta={resumo.vencidas > 0} definicao="Tarefas que ainda não foram concluídas e cujo vencimento é anterior a hoje." detalhe={`${resumo.abertas} aberta(s) no total · ${resumo.minhasAbertas} suas`} />
          <NumeroDoPainel titulo="Propostas sem retorno" valor={comercial.semRetorno} href="/projetos?semRetorno=1" alerta={comercial.semRetorno > 0} definicao="Projetos em Proposta enviada ou Negociação parados além do prazo de “sem retorno” definido em Configurações." detalhe="Hora de cobrar o cliente" />
          <div className={cn("rounded-xl border p-4", fin.receberEmAtencao.length > 0 && "border-destructive/40 bg-destructive/5")}>
            <h3 className="mb-2 text-sm font-medium" title="Como é calculado: parcelas em aberto que venceram ou vencem hoje, as mais antigas primeiro.">
              Parcelas atrasadas ou vencendo hoje
            </h3>
            {fin.receberEmAtencao.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma parcela atrasada ou vencendo hoje.</p>
            ) : (
              <ul className="grid gap-2">
                {fin.receberEmAtencao.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <Link href={`/financeiro/receber/${c.id}`} className="min-w-0 hover:underline">
                      <span className="font-medium">{c.descricao}</span>
                      <span className="text-muted-foreground block text-xs">{c.quem}</span>
                    </Link>
                    <span className={cn("text-xs tabular-nums", c.diasEmAtraso > 0 && "text-destructive")}>
                      {formatarMoeda(c.saldoCentavos)} · {c.diasEmAtraso > 0 ? `atrasada há ${c.diasEmAtraso} dia${c.diasEmAtraso === 1 ? "" : "s"}` : "vence hoje"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={cn("rounded-xl border p-4", fin.pagarEmAtencao.length > 0 && "border-destructive/40 bg-destructive/5")}>
            <h3 className="mb-2 text-sm font-medium" title="Como é calculado: contas a pagar em aberto que venceram ou vencem hoje, as mais antigas primeiro.">
              Contas a pagar atrasadas ou vencendo hoje
            </h3>
            {fin.pagarEmAtencao.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma conta atrasada ou vencendo hoje.</p>
            ) : (
              <ul className="grid gap-2">
                {fin.pagarEmAtencao.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <Link href={`/financeiro/pagar/${c.id}`} className="min-w-0 hover:underline">
                      <span className="font-medium">{c.descricao}</span>
                      {c.quem ? <span className="text-muted-foreground block text-xs">{c.quem}</span> : null}
                    </Link>
                    <span className={cn("text-xs tabular-nums", c.diasEmAtraso > 0 && "text-destructive")}>
                      {formatarMoeda(c.saldoCentavos)} · {c.diasEmAtraso > 0 ? `atrasada há ${c.diasEmAtraso} dia${c.diasEmAtraso === 1 ? "" : "s"}` : "vence hoje"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border p-4">
            <h3 className="mb-2 text-sm font-medium">Visitas de hoje e de amanhã</h3>
            {comercial.visitas.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma visita marcada para hoje ou amanhã.</p>
            ) : (
              <ul className="grid gap-2">
                {comercial.visitas.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <Link href={`/agenda/${v.id}`} className="min-w-0 hover:underline">
                      <span className="font-medium">{v.clienteNome ?? v.projetoTitulo ?? "Visita"}</span>
                      <span className="text-muted-foreground block text-xs">
                        {v.dia === "hoje" ? "Hoje" : "Amanhã"} · {formatarDataHora(v.inicio).slice(11)}
                        {v.local ? ` · ${v.local}` : ""}
                      </span>
                    </Link>
                    <Link href={`/agenda/${v.id}`} className="text-primary text-xs hover:underline">
                      Enviar lembrete
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={cn("rounded-xl border p-4", obras.atrasadas.length > 0 && "border-destructive/40 bg-destructive/5")}>
            <h3 className="mb-2 text-sm font-medium" title="Como é calculado: obras em andamento com etapa aberta depois da data prevista, as mais urgentes primeiro.">
              Obras com etapa atrasada
            </h3>
            {obras.atrasadas.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma etapa atrasada nas obras em andamento.</p>
            ) : (
              <ul className="grid gap-2">
                {obras.atrasadas.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <Link href={`/obras/${o.id}?aba=etapas`} className="min-w-0 hover:underline">
                      <span className="font-medium">{o.titulo}</span>
                      <span className="text-muted-foreground block text-xs">
                        {o.clienteNome}
                        {o.etapaAtual ? ` · etapa atual: ${o.etapaAtual}` : ""}
                      </span>
                    </Link>
                    <span className="text-destructive text-xs">
                      {o.etapasAtrasadas} {o.etapasAtrasadas === 1 ? "etapa atrasada" : "etapas atrasadas"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Secao>

      <Secao id="titulo-comercial" titulo="Vendas e propostas" href={`/relatorios/fechamento${consultaDoPeriodo}`} rotuloDoLink="Ver relatório">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumeroDoPainel
            titulo="Projetos que o cliente fechou"
            valor={fechamento.taxaPercentual === null ? "—" : pct(fechamento.taxaPercentual)}
            href={`/relatorios/fechamento${consultaDoPeriodo}`}
            definicao={`Projetos aprovados dividido por (aprovados + perdidos que já tinham proposta enviada), pela data da decisão, nos ${DIAS_DA_JANELA_DE_FECHAMENTO} dias até ${formatarDataCalendario(janela.ate)}. Projeto perdido antes de receber proposta não entra.`}
            detalhe={fechamento.aprovados + fechamento.perdidos === 0 ? "Sem nenhuma decisão nessa janela" : `${fechamento.aprovados} aprovado(s) e ${fechamento.perdidos} perdido(s) em ${DIAS_DA_JANELA_DE_FECHAMENTO} dias`}
          />
          <NumeroDoPainel
            titulo="Valor médio por obra"
            valor={vendido.ticketMedioCentavos === null ? "—" : formatarMoeda(vendido.ticketMedioCentavos)}
            href={`/relatorios/vendas${consultaDoPeriodo}`}
            definicao="Vendido dividido pelo número de projetos que tiveram aprovação no período."
            detalhe={vendido.projetos === 0 ? "Sem projeto aprovado no período" : `${vendido.projetos} projeto(s) aprovado(s)`}
          />
          <NumeroDoPainel
            titulo="Da visita à proposta"
            valor={tempo.mediaDeDias === null ? "—" : `${tempo.mediaDeDias.toLocaleString("pt-BR")} dia(s)`}
            href={`/relatorios/fechamento${consultaDoPeriodo}`}
            definicao="Média de dias entre a primeira visita realizada e o envio da primeira proposta, dos projetos cuja primeira proposta foi enviada no período."
            detalhe={tempo.amostra === 0 ? "Sem dados neste período" : `${tempo.amostra} projeto(s)`}
          />
          <NumeroDoPainel
            titulo="Propostas aguardando resposta"
            valor={propostas.enviadas}
            href="/propostas?status=ENVIADA"
            definicao="Propostas na situação Enviada (revisão vigente). O valor soma a maior opção de cada uma, com a nota fiscal quando houver."
            detalhe={propostas.enviadas > 0 ? formatarMoeda(propostas.enviadasValorCentavos) : "Nenhuma proposta enviada"}
          />
        </div>
        <h3 className="mt-6 mb-2 text-sm font-medium">Projetos em cada fase hoje</h3>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {comercial.funil.map((f) => (
            <NumeroDoPainel
              key={f.status}
              titulo={ROTULO_STATUS_PROJETO[f.status]}
              valor={f.quantidade}
              href={`/projetos?status=${f.status}`}
              definicao="Projetos nessa fase hoje e a soma dos valores estimados (campo opcional do projeto)."
              detalhe={f.valorCentavos > 0 ? formatarMoeda(f.valorCentavos) : "Sem valor estimado"}
            />
          ))}
        </div>
        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border p-4">
            <h3 className="mb-2 text-sm font-medium">De onde vieram os projetos novos ({rotuloDoPeriodo(periodo)})</h3>
            {comercial.origensDoPeriodo.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum projeto novo neste período.</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {comercial.origensDoPeriodo.map((o) => (
                  <li key={o.origem ?? "sem"} className="flex justify-between gap-2">
                    <span>{o.origem ? (ROTULO_ORIGEM[o.origem as keyof typeof ROTULO_ORIGEM] ?? o.origem) : "Não informada"}</span>
                    <span className="tabular-nums">{o.quantidade}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/relatorios/funil${consultaDeAte}`} className="text-primary mt-2 inline-block text-xs hover:underline">
              Ver o relatório completo
            </Link>
          </div>
          <div className="rounded-xl border p-4">
            <h3 className="mb-2 text-sm font-medium">Por que se perdeu ({rotuloDoPeriodo(periodo)})</h3>
            {comercial.perdasDoPeriodo.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum projeto perdido neste período.</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {comercial.perdasDoPeriodo.map((p) => (
                  <li key={p.nome} className="flex justify-between gap-2">
                    <span>{p.nome}</span>
                    <span className="tabular-nums">{p.quantidade}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/relatorios/funil${consultaDeAte}`} className="text-primary mt-2 inline-block text-xs hover:underline">
              Ver o relatório completo
            </Link>
          </div>
        </div>
      </Secao>

      <Secao id="titulo-obras" titulo="Obras e fábrica" href="/obras" rotuloDoLink="Ver obras">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <NumeroDoPainel titulo="Obras em andamento" valor={obras.emAndamento} href="/obras" definicao="Obras aprovadas ou em execução (ainda não entregues)." detalhe={`${obras.verdes} no prazo${obras.semPrazo > 0 ? ` · ${obras.semPrazo} sem prazo definido` : ""}`} />
          <NumeroDoPainel titulo="Obras atrasadas" valor={obras.vermelhas} href="/obras?semaforo=VERMELHO" alerta={obras.vermelhas > 0} definicao="Obras em andamento com alguma etapa depois da data prevista, ou com o prazo prometido (já com as pausas justificadas) vencido." detalhe={`${obras.amarelas} vencem em breve`} />
          <NumeroDoPainel
            titulo="Ocupação da fábrica"
            valor={pct(fabrica.ocupacaoPercentual)}
            href="/relatorios/producao"
            definicao="m² das obras cuja fabricação está em andamento ou começa nos próximos 30 dias, dividido pela capacidade de produção por mês de Configurações. É a situação de hoje."
            detalhe={fabrica.capacidadeM2 === null ? "Informe a capacidade em Configurações" : `${fabrica.m2EmProducao.toLocaleString("pt-BR")} m² de ${fabrica.capacidadeM2.toLocaleString("pt-BR")} m² por mês`}
          />
          <NumeroDoPainel titulo="Assistências em aberto" valor={obras.chamadosEmAberto} href="/obras/assistencia" definicao="Chamados de assistência ainda não resolvidos nem cancelados." detalhe={obras.chamadosEmAberto > 0 ? `${obras.chamadosEmAbertoEmGarantia} em garantia` : "Assistência e garantia"} />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border p-4">
            <h3 className="mb-2 text-sm font-medium">Obras por etapa</h3>
            {obras.porEtapa.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma obra em andamento.</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {obras.porEtapa.map((e) => (
                  <li key={e.tipo} className="flex justify-between gap-2">
                    <Link href={`/obras?etapa=${e.tipo}`} className="hover:underline">
                      {ROTULO_TIPO_ETAPA[e.tipo]}
                    </Link>
                    <span className="tabular-nums">{e.quantidade}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border p-4">
            <h3 className="mb-2 text-sm font-medium">Próximas instalações e entregas</h3>
            {obras.proximasInstalacoes.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nada agendado. Veja o que falta agendar no calendário de instalação.</p>
            ) : (
              <ul className="grid gap-2">
                {obras.proximasInstalacoes.map((i) => (
                  <li key={i.id} className="text-sm">
                    <Link href={`/agenda/${i.id}`} className="hover:underline">
                      <span className="font-medium">{i.clienteNome ?? i.projetoTitulo ?? ROTULO_TIPO_EVENTO[i.tipo as TipoEvento]}</span>
                      <span className="text-muted-foreground block text-xs">
                        {ROTULO_TIPO_EVENTO[i.tipo as TipoEvento]} · {formatarDataHora(i.inicio)}
                        {i.equipeNome ? ` · ${i.equipeNome}` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/obras/calendario" className="text-primary mt-2 inline-block text-xs hover:underline">
              Abrir o calendário de instalação
            </Link>
          </div>
        </div>
      </Secao>

      <Secao id="titulo-financeiro" titulo="Dinheiro" href="/financeiro" rotuloDoLink="Ver fluxo de caixa">
        {!fin.temContas ? (
          <Link href="/financeiro/contas" className="hover:bg-accent mb-3 block rounded-xl border border-dashed p-4 text-sm transition-colors">
            <span className="font-medium">Cadastre as contas onde o dinheiro entra e sai</span>
            <span className="text-muted-foreground block">O saldo e o fluxo de caixa aparecem aqui assim que houver uma conta. O saldo inicial é opcional.</span>
          </Link>
        ) : null}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <NumeroDoPainel titulo="Saldo das contas" valor={fin.temContas ? formatarMoeda(fin.saldoAtualCentavos) : "—"} href="/financeiro/contas" alerta={fin.saldoAtualCentavos < 0} definicao="Soma dos saldos das contas ativas hoje. Conta sem saldo informado soma só o movimento registrado." detalhe={fin.contasSemSaldo > 0 ? <span className="text-amber-700 dark:text-amber-400">Parcial: {fin.contasSemSaldo} conta(s) com saldo não informado; o valor mostra só o movimento registrado</span> : "Soma das contas ativas"} />
          <NumeroDoPainel
            titulo="A receber"
            valor={formatarMoeda(fin.receber.vencidoCentavos + fin.receber.hojeCentavos + fin.receber.proximosCentavos)}
            href="/financeiro/receber?aba=atrasadas"
            alerta={fin.receber.vencidoCentavos > 0}
            definicao="O que falta receber das contas em aberto que já venceram, vencem hoje ou vencem nos próximos dias (a janela de dias está em Configurações). Parcelas que aguardam uma etapa e as que vencem mais adiante não entram."
            detalhe={
              <>
                <span className="block">Vencido: {formatarMoeda(fin.receber.vencidoCentavos)}</span>
                <span className="block">Hoje: {formatarMoeda(fin.receber.hojeCentavos)}</span>
                <span className="block">Próximos {fin.diasDeAlerta} dias: {formatarMoeda(fin.receber.proximosCentavos)}</span>
              </>
            }
          />
          <NumeroDoPainel
            titulo="A pagar"
            valor={formatarMoeda(fin.pagar.vencidoCentavos + fin.pagar.hojeCentavos + fin.pagar.proximosCentavos)}
            href="/financeiro/pagar?aba=atrasadas"
            alerta={fin.pagar.vencidoCentavos > 0}
            definicao="O que falta pagar das contas em aberto que já venceram, vencem hoje ou vencem nos próximos dias (a janela de dias está em Configurações). O que vence mais adiante não entra."
            detalhe={
              <>
                <span className="block">Vencido: {formatarMoeda(fin.pagar.vencidoCentavos)}</span>
                <span className="block">Hoje: {formatarMoeda(fin.pagar.hojeCentavos)}</span>
                <span className="block">Próximos {fin.diasDeAlerta} dias: {formatarMoeda(fin.pagar.proximosCentavos)}</span>
              </>
            }
          />
          <NumeroDoPainel
            titulo="Recebido com nota fiscal (12 meses)"
            valor={formatarMoeda(comNota.recebidoCentavos)}
            href={`/financeiro/recebimentos${montarConsulta({ periodo: "12m", nota: "com" })}`}
            definicao="Soma dos pagamentos marcados COM nota fiscal nos últimos 12 meses, pela data do pagamento. Recebimentos sem nota não entram. É só um acompanhamento do que você recebeu com nota: não calcula imposto nem faz apuração."
            detalhe={
              <>
                <span className="block">
                  {comNota.limiteCentavos === null ? "Limite não informado (Configurações → Empresa)" : `${pct(comNota.percentualDoLimite)} do limite de ${formatarMoeda(comNota.limiteCentavos)}`}
                </span>
                <span className="block">
                  {formatarDataCalendario(comNota.periodo.de)} a {formatarDataCalendario(comNota.periodo.ate)}
                </span>
                {comNota.avulsasComNotaForaDaSoma > 0 ? <span className="block">{comNota.avulsasComNotaForaDaSoma} entrada(s) avulsa(s) marcada(s) com nota ficaram de fora (sem conta a receber).</span> : null}
              </>
            }
          />
        </div>
        <p className="mt-3 text-sm">
          <Link href="/relatorios/faturamento" className="text-primary hover:underline">
            Ver o faturamento mês a mês, com nota e sem nota
          </Link>
        </p>
      </Secao>

      <Secao id="titulo-estoque" titulo="Estoque e compras" href="/relatorios/estoque" rotuloDoLink="Ver relatório de estoque">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <NumeroDoPainel titulo="Compras em aberto" valor={estoque.comprasEmAberto} href="/compras?aba=abertas" definicao="Pedidos feitos ao fornecedor e recebidos em parte, ainda não recebidos por inteiro. Atrasada = previsão de entrega já passada." detalhe={estoque.comprasAtrasadas > 0 ? `${estoque.comprasAtrasadas} com entrega atrasada` : "Nenhuma com entrega atrasada"} />
          <NumeroDoPainel titulo="Retalhos disponíveis" valor={estoque.retalhosDisponiveis} href="/estoque/retalhos" definicao="Sobras de perfil guardadas para outra obra (sobra maior ou igual ao retalho mínimo das Configurações)." detalhe="Para usar em obras" />
          <NumeroDoPainel titulo="Sucata para vender" valor={`${(estoque.sucataMilesimosKg / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg`} href="/estoque/retalhos" definicao="Kg de sucata registrados nos cortes e ajustes, menos o que já foi vendido." detalhe="Saldo registrado" />
          <NumeroDoPainel titulo="Abaixo do mínimo" valor={estoque.abaixoDoMinimo} href="/produtos?estoque=abaixo" alerta={estoque.abaixoDoMinimo > 0} definicao="Só produtos que têm estoque mínimo definido e saldo abaixo dele. Produto sem mínimo não gera alerta." detalhe="Só produtos com mínimo definido" />
          <NumeroDoPainel titulo="Perfis sem custo" valor={estoque.perfisSemCusto} href="/estoque/preco-do-kg" definicao="Perfis comprados por kg que ainda estão sem custo (falta preço do kg, peso por metro ou comprimento da barra)." detalhe={estoque.perfisSemCusto > 0 ? "Informe o preço do kg" : "Todos com custo"} />
        </div>
        {estoque.produtos === 0 ? (
          <p className="text-muted-foreground mt-3 text-sm">
            O estoque começa vazio, sem nada inventado: cadastre os <Link href="/produtos" className="underline">produtos</Link> e, se quiser, faça a <Link href="/estoque/inventario-inicial" className="underline">contagem inicial</Link>.
          </p>
        ) : null}
      </Secao>

      <Secao id="titulo-cadastros" titulo="Cadastros">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <NumeroDoPainel titulo="Clientes ativos" valor={cadastros.clientesAtivos} href="/clientes" definicao="Clientes cadastrados e ativos (fora da lixeira)." detalhe={<span className="flex items-center gap-1"><Users className="size-3.5" aria-hidden /> {cadastros.clientesNovosNoMes} novo(s) no mês</span>} />
          <NumeroDoPainel titulo="Parceiros" valor={cadastros.parceiros} href="/parceiros" definicao="Clientes ativos marcados como arquiteto/designer ou construtora." detalhe={<span className="flex items-center gap-1"><Handshake className="size-3.5" aria-hidden /> Quem indica serviço</span>} />
          <NumeroDoPainel titulo="Sem contato há 12 meses" valor={cadastros.clientesSemContato} href="/clientes?parado=1" definicao={`Clientes ativos cadastrados há mais de ${MESES_SEM_CONTATO} meses, sem nenhum registro de ligação, WhatsApp, visita, e-mail ou anotação no período. Boa lista para reativar.`} detalhe={<span className="flex items-center gap-1"><History className="size-3.5" aria-hidden /> Boa lista para reativar</span>} />
          <NumeroDoPainel titulo="Produtos sem custo" valor={cadastros.produtosSemCusto} href="/produtos?custo=sem" alerta={cadastros.produtosSemCusto > 0} definicao="Produtos ativos com o custo ainda não informado (o sistema nunca inventa preço)." detalhe={<span className="flex items-center gap-1"><PackageX className="size-3.5" aria-hidden /> A margem das obras fica incompleta</span>} />
          <NumeroDoPainel titulo="Custos desatualizados" valor={cadastros.produtosComCustoAntigo} href="/produtos?custo=antigo" alerta={cadastros.produtosComCustoAntigo > 0} definicao={`Produtos ativos cujo custo não é atualizado há mais de ${DIAS_CUSTO_DESATUALIZADO} dias.`} detalhe={<span className="flex items-center gap-1"><TriangleAlert className="size-3.5" aria-hidden /> Confira com o fornecedor</span>} />
          <NumeroDoPainel titulo="Novos clientes no mês" valor={cadastros.clientesNovosNoMes} href="/clientes?ordem=criadoEm&direcao=desc" definicao="Clientes ativos cadastrados desde o dia 1º do mês atual." detalhe={<span className="flex items-center gap-1"><UserPlus className="size-3.5" aria-hidden /> Desde o dia 1º</span>} />
        </div>
      </Secao>

      <Secao id="titulo-proximas" titulo="Próximas tarefas" href="/tarefas" rotuloDoLink="Ver todas">
        {proximas.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-10 text-center">
            <ListChecks className="text-muted-foreground mb-2 size-6" aria-hidden />
            <p className="font-medium">Nenhuma tarefa aberta</p>
            <p className="text-muted-foreground mt-1 text-sm">Anote o que precisa ser feito em Tarefas ou pelo botão “Novo”.</p>
          </div>
        ) : (
          <ul className="divide-y rounded-xl border">
            {proximas.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 p-3">
                <Link href={`/tarefas/${t.id}`} className="min-w-0 truncate text-sm font-medium hover:underline">
                  {t.titulo}
                </Link>
                <span className={cn("shrink-0 text-xs tabular-nums", t.vencida ? "text-destructive font-medium" : "text-muted-foreground")}>
                  {t.vencimento ? `${t.vencida ? "Venceu em" : "Vence em"} ${formatarDataCalendario(t.vencimento)}` : "Sem vencimento"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <p className="mt-8 text-sm">
        <Link href="/primeiros-passos" className="text-primary hover:underline">
          Veja o que falta configurar nos Primeiros passos →
        </Link>
      </p>
    </>
  );
}
