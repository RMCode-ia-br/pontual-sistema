import type { Metadata } from "next";
import Link from "next/link";
import { LinkDeCsvDaTabela } from "@/components/relatorios/link-de-csv-da-tabela";

import { CabecalhoDeRelatorio, TabelaDeRelatorio } from "@/components/relatorios/cabecalho-de-relatorio";
import { lerVisao, NavegacaoDeVisoes, type Visao } from "@/components/relatorios/navegacao-de-visoes";
import { NumeroDoPainel } from "@/components/relatorios/numero-do-painel";
import { SeletorDePeriodo } from "@/components/relatorios/seletor-de-periodo";
import { exigirSessao } from "@/lib/auth/sessao";
import { formatarData, formatarMoeda, dataLocalDoInstante } from "@/lib/formatadores";
import { montarConsulta } from "@/lib/listas/parametros";
import { lerPeriodo, parametrosDoPeriodo, rotuloDoPeriodo, type Periodo } from "@/lib/periodo";
import { cancelamentosNoPeriodo, LIMITE_DE_CANCELAMENTOS, listarCancelamentos } from "@/modules/indicadores/cancelamentos";
import { LIMITE_DE_LINHAS_DE_VENDAS, listarVendas, vendidoNoPeriodo } from "@/modules/indicadores/vendas";

import { VisaoAnoContraAno, VisaoOrigem, VisaoParceiros, VisaoTicket } from "./visoes";

export const metadata: Metadata = { title: "Vendas por período" };

const VISOES = [
  { valor: "periodo", titulo: "Por proposta" },
  { valor: "origem", titulo: "Origem dos clientes" },
  { valor: "parceiros", titulo: "Arquitetos e construtoras" },
  { valor: "ticket", titulo: "Ticket médio" },
  { valor: "ano", titulo: "Ano contra ano" },
] as const satisfies readonly Visao[];

const DESCRICAO: Record<string, string> = {
  periodo: "O que foi aprovado pelo cliente no período, proposta por proposta. É a lista que explica o número “Vendido” do painel e o “Valor médio por obra”.",
  origem: "De onde vieram os contatos e quanto cada origem vendeu no período.",
  parceiros: "O que cada arquiteto ou construtora indicou e vendeu no período.",
  ticket: "Quanto vale, em média, cada obra vendida, por tipo de serviço e por porte.",
  ano: "Os últimos 12 meses contra os mesmos meses de um ano antes.",
};

export default async function PaginaDeVendas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSessao();
  const brutos = await searchParams;
  const hoje = dataLocalDoInstante(new Date());
  const { periodo, tipo, aviso } = lerPeriodo(brutos, hoje);
  const visao = lerVisao(brutos.visao, VISOES);
  const papel = (Array.isArray(brutos.papel) ? brutos.papel[0] : brutos.papel) === "construtora" ? "construtora" : "arquiteto";
  const doPeriodo = parametrosDoPeriodo(periodo);
  const extras: Record<string, string> = visao === "parceiros" ? { papel } : {};
  const consulta = montarConsulta({ ...doPeriodo, ...extras, visao });

  return (
    <>
      <p className="mb-2 text-sm print:hidden">
        <Link href="/relatorios" className="text-muted-foreground hover:underline">
          ← Relatórios
        </Link>
      </p>
      <CabecalhoDeRelatorio
        titulo="Vendas por período"
        descricao={DESCRICAO[visao]}
        periodoRotulo={visao === "ano" ? "últimos 12 meses" : rotuloDoPeriodo(periodo)}
        hrefCsv={`/api/exportar/relatorios/vendas${consulta}`}
      >
        {visao !== "ano" ? <SeletorDePeriodo periodo={periodo} tipo={tipo} hoje={hoje} /> : null}
      </CabecalhoDeRelatorio>
      <NavegacaoDeVisoes visoes={VISOES} atual={visao} parametros={{ ...doPeriodo, ...extras }} rotulo="Visões do relatório de vendas" />

      {aviso && visao !== "ano" ? (
        <p role="status" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {aviso}
        </p>
      ) : null}

      {visao === "periodo" ? <VisaoPorProposta periodo={periodo} /> : null}
      {visao === "origem" ? <VisaoOrigem periodo={periodo} /> : null}
      {visao === "parceiros" ? (
        <>
          <nav aria-label="Arquitetos ou construtoras" className="mb-4 flex gap-1.5 print:hidden">
            {(["arquiteto", "construtora"] as const).map((p) => (
              <Link
                key={p}
                href={montarConsulta({ ...doPeriodo, visao: "parceiros", papel: p })}
                aria-current={papel === p ? "page" : undefined}
                className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm ${papel === p ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
              >
                {p === "arquiteto" ? "Arquitetos" : "Construtoras"}
              </Link>
            ))}
          </nav>
          <VisaoParceiros periodo={periodo} papel={papel} />
        </>
      ) : null}
      {visao === "ticket" ? <VisaoTicket periodo={periodo} /> : null}
      {visao === "ano" ? <VisaoAnoContraAno referencia={hoje} /> : null}
    </>
  );
}

/** A lista por proposta (a que explica o "Vendido" do painel) e o "cancelado depois de aprovado". */
async function VisaoPorProposta({ periodo }: { periodo: Periodo }) {
  const [v, lista, cancelados, listaDeCancelados] = await Promise.all([vendidoNoPeriodo(periodo), listarVendas(periodo), cancelamentosNoPeriodo(periodo), listarCancelamentos(periodo)]);
  return (
    <>
      <section aria-label="Resumo das vendas" className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <NumeroDoPainel titulo="Vendido" valor={formatarMoeda(v.totalCentavos)} definicao="Soma do valor aprovado de cada proposta que o cliente aprovou no período, pela data da aprovação. Uma obra com duas partes aprovadas em meses diferentes tem cada parte no seu mês." detalhe={`${v.propostas} proposta(s) em ${v.projetos} projeto(s)`} grande />
        <NumeroDoPainel titulo="Vendido sem nota" valor={formatarMoeda(v.semNotaCentavos)} definicao="Parte do vendido em propostas sem nota fiscal." />
        <NumeroDoPainel titulo="Vendido com nota" valor={formatarMoeda(v.comNotaCentavos)} definicao="Parte do vendido em propostas com nota fiscal. Já inclui o acréscimo da nota, que aparece separado ao lado." detalhe={`Repasse de imposto, fora da margem: ${formatarMoeda(v.repasseDeImpostoCentavos)}`} />
        <NumeroDoPainel titulo="Valor médio por obra" valor={v.ticketMedioCentavos === null ? "—" : formatarMoeda(v.ticketMedioCentavos)} definicao="Vendido dividido pelo número de projetos que tiveram aprovação no período." detalhe={v.projetos === 0 ? "Sem projeto aprovado no período" : `${v.projetos} projeto(s)`} />
        <NumeroDoPainel
          titulo="Cancelado depois de aprovado"
          valor={cancelados.projetos === 0 ? "Nenhum" : formatarMoeda(cancelados.valorAprovadoCentavos)}
          definicao="Obras que o cliente tinha aprovado e que foram canceladas dentro do período. A venda continua no “Vendido” do mês em que foi aprovada (os meses passados não mudam); aqui aparece só o cancelamento, no mês em que aconteceu. Aprovação desfeita por engano não entra: ela tira a venda do Vendido."
          detalhe={cancelados.projetos === 0 ? "Nenhuma obra cancelada no período" : `${cancelados.projetos} obra(s) · valor que tinha sido vendido`}
        />
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

      {listaDeCancelados.linhas.length > 0 ? (
        <section aria-labelledby="titulo-cancelados" className="mt-8">
          <h2 id="titulo-cancelados" className="mb-1 text-lg font-medium">
            Cancelado depois de aprovado
          </h2>
          <LinkDeCsvDaTabela href={`/api/exportar/relatorios/vendas${montarConsulta({ ...parametrosDoPeriodo(periodo), tabela: "cancelados" })}`} />
          <p className="text-muted-foreground mb-3 text-sm">Estas obras continuam no “Vendido” do mês em que foram aprovadas; o cancelamento aparece aqui, no mês em que aconteceu.</p>
          {listaDeCancelados.truncado ? (
            <p role="alert" className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              A lista mostra só {LIMITE_DE_CANCELAMENTOS} obras. Escolha um período menor para ver as outras.
            </p>
          ) : null}
          <TabelaDeRelatorio legenda="Obras canceladas depois de aprovadas no período">
            <thead className="bg-muted/50 text-left text-xs">
              <tr>
                <th scope="col" className="px-3 py-2">Obra</th>
                <th scope="col" className="px-3 py-2">Cliente</th>
                <th scope="col" className="px-3 py-2">Aprovada em</th>
                <th scope="col" className="px-3 py-2">Cancelada em</th>
                <th scope="col" className="px-3 py-2 text-right">Valor que tinha sido vendido</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {listaDeCancelados.linhas.map((l) => (
                <tr key={l.projetoId}>
                  <td className="px-3 py-2">
                    <Link href={`/projetos/${l.projetoId}`} className="hover:underline">
                      {l.codigo} · {l.titulo}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{l.cliente}</td>
                  <td className="px-3 py-2 tabular-nums">{l.aprovadoEm ? formatarData(l.aprovadoEm) : "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{formatarData(l.canceladoEm)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(l.valorAprovadoCentavos)}</td>
                </tr>
              ))}
            </tbody>
          </TabelaDeRelatorio>
        </section>
      ) : null}
    </>
  );
}
