import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoDeRelatorio, TabelaDeRelatorio } from "@/components/relatorios/cabecalho-de-relatorio";
import { ComoECalculado } from "@/components/relatorios/como-e-calculado";
import { NumeroDoPainel } from "@/components/relatorios/numero-do-painel";
import { SeletorDePeriodo } from "@/components/relatorios/seletor-de-periodo";
import { exigirSessao } from "@/lib/auth/sessao";
import { dataLocalDoInstante, formatarData } from "@/lib/formatadores";
import { montarConsulta } from "@/lib/listas/parametros";
import { lerPeriodo, parametrosDoPeriodo, rotuloDoPeriodo } from "@/lib/periodo";
import { avaliacoesDoGoogle, LIMITE_DE_ENTREGAS_NA_LISTA, type SituacaoDoPedido } from "@/modules/indicadores/operacional";

export const metadata: Metadata = { title: "Avaliações no Google" };

const TEXTO: Record<SituacaoDoPedido, string> = { FEITO: "Pedido feito", ABERTO: "Pedido a fazer", CANCELADO: "Pedido cancelado", SEM_TAREFA: "Sem pedido" };
const th = "px-3 py-2";

export default async function PaginaDeAvaliacoes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSessao();
  const brutos = await searchParams;
  const hoje = dataLocalDoInstante(new Date());
  const { periodo, tipo, aviso } = lerPeriodo(brutos, hoje);
  const a = await avaliacoesDoGoogle(periodo, hoje);
  const consulta = montarConsulta(parametrosDoPeriodo(periodo));

  return (
    <>
      <p className="mb-2 text-sm print:hidden">
        <Link href="/relatorios" className="text-muted-foreground hover:underline">
          ← Relatórios
        </Link>
      </p>
      <CabecalhoDeRelatorio titulo="Avaliações no Google" descricao="Das obras entregues, para quantas já se pediu a avaliação no Google." periodoRotulo={rotuloDoPeriodo(periodo)} hrefCsv={`/api/exportar/relatorios/avaliacoes${consulta}`}>
        <SeletorDePeriodo periodo={periodo} tipo={tipo} hoje={hoje} />
      </CabecalhoDeRelatorio>
      {aviso ? (
        <p role="status" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {aviso}
        </p>
      ) : null}
      <section aria-label="Resumo" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <NumeroDoPainel titulo="Obras entregues" valor={String(a.obrasEntregues)} definicao="Obras cuja etapa de entrega foi concluída no período (pela data real de fim)." grande />
        <NumeroDoPainel titulo="Pedidos feitos" valor={String(a.pedidosFeitos)} definicao="Tarefas “Pedir avaliação no Google” marcadas como concluídas no período. O sistema não sabe se a mensagem saiu: é o que a pessoa marcou. Pode incluir obras entregues antes do período." />
        <NumeroDoPainel titulo="Pedidos a fazer" valor={String(a.pedidosEmAberto)} definicao="Tarefas “Pedir avaliação no Google” ainda abertas, de qualquer período." detalhe={a.pedidosVencidos > 0 ? `${a.pedidosVencidos} já passaram do prazo` : "Nenhuma atrasada"} />
      </section>
      {a.truncado ? (
        <p role="alert" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          A lista mostra só as {LIMITE_DE_ENTREGAS_NA_LISTA} entregas mais recentes do período. Escolha um período menor para ver as outras.
        </p>
      ) : null}
      {a.linhas.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">Nenhuma obra foi entregue neste período</p>
          <p className="text-muted-foreground mt-1 text-sm">Quando uma obra for entregue, ela aparece aqui com a situação do pedido de avaliação.</p>
        </div>
      ) : (
        <TabelaDeRelatorio legenda="Obras entregues e pedido de avaliação">
          <thead className="bg-muted/50 text-left text-xs">
            <tr>
              <th scope="col" className={th}>Obra</th>
              <th scope="col" className={th}>Cliente</th>
              <th scope="col" className={th}>Entregue em</th>
              <th scope="col" className={th}>Pedido</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {a.linhas.map((l) => (
              <tr key={l.projetoId}>
                <td className="px-3 py-2">
                  <Link href={`/obras/${l.projetoId}`} className="hover:underline">
                    {l.codigo} · {l.titulo}
                  </Link>
                </td>
                <td className="px-3 py-2">{l.cliente}</td>
                <td className="px-3 py-2 tabular-nums">{formatarData(l.entregueEm)}</td>
                <td className="px-3 py-2">
                  {TEXTO[l.situacao]}
                  {l.situacao === "FEITO" && l.pedidoFeitoEm ? ` em ${formatarData(l.pedidoFeitoEm)}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </TabelaDeRelatorio>
      )}
      <ComoECalculado className="mt-3" texto="Obras entregues e pedidos feitos são grupos diferentes: o pedido costuma sair uns dias depois da entrega (prazo de Configurações), então um não é um percentual do outro. A coluna “Pedido” mostra a situação da tarefa de cada obra entregue no período. Quantas avaliações o cliente de fato escreveu no Google o sistema não consegue saber." />
    </>
  );
}
