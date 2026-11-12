import { Download, HandCoins } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { FiltroSelect, FiltrosDaLista } from "@/components/lista/filtros-da-lista";
import { ListaDeRegistros, type ColunaLista, type LinhaLista } from "@/components/lista/lista-de-registros";
import { PaginacaoLista } from "@/components/lista/paginacao-lista";
import { buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { dataLocalDoInstante, formatarDataCalendario, formatarMoeda } from "@/lib/formatadores";
import { hrefDaLista, montarConsulta, type ParametrosBrutos } from "@/lib/listas/parametros";
import { textoDaSituacao } from "@/modules/financeiro/components/selo-da-situacao";
import { ABAS_A_RECEBER, lerListaAReceber, lerParametrosFinanceiros, listarContasAReceber, type ContaAReceberDaLista } from "@/modules/financeiro/queries-receber";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "A receber" };

const COLUNAS: ColunaLista[] = [
  { id: "parcela", rotulo: "Parcela", ordenavel: "cliente" },
  { id: "vencimento", rotulo: "Vencimento", ordenavel: "vencimento" },
  { id: "valor", rotulo: "Valor", ordenavel: "valor" },
  { id: "recebido", rotulo: "Recebido" },
  { id: "saldo", rotulo: "Saldo" },
  { id: "nota", rotulo: "Nota", escondidaPorPadrao: true },
];

function paraLinha(c: ContaAReceberDaLista): LinhaLista {
  const r = c.resumo;
  const marcas: { texto: string; variante?: "default" | "secondary" | "outline" | "destructive" }[] = [
    { texto: textoDaSituacao(r), variante: r.situacao === "ATRASADO" ? "destructive" : r.situacao === "VENCE_HOJE" ? "default" : r.situacao === "PAGO" ? "secondary" : "outline" },
  ];
  // "Cliente pediu até o dia X": o atraso acima continua pelo vencimento original; a promessa é só uma marca a mais.
  if (c.dataPrometida && (c.status === "ABERTA" || c.status === "PARCIAL")) marcas.push({ texto: `Prometido para ${formatarDataCalendario(c.dataPrometida)}`, variante: "secondary" });
  return {
    id: c.id,
    href: `/financeiro/receber/${c.id}`,
    inativa: c.status === "CANCELADA",
    celulas: {
      parcela: { texto: c.descricao, sub: [c.clienteNome, c.projetoCodigo ? `${c.projetoCodigo} · ${c.projetoTitulo}` : null].filter(Boolean).join(" · ") },
      vencimento: { texto: c.vencimento ? formatarDataCalendario(c.vencimento) : "—", marcas },
      valor: { texto: formatarMoeda(c.valorCentavos), direita: true },
      recebido: { texto: c.valorPagoCentavos > 0 ? formatarMoeda(c.valorPagoCentavos) : "—", direita: true },
      saldo: { texto: formatarMoeda(r.saldoCentavos), direita: true },
      nota: c.comNotaFiscal ? "Com nota" : "Sem nota",
    },
  };
}

export default async function PaginaAReceber({ searchParams }: { searchParams: Promise<ParametrosBrutos> }) {
  await exigirSessao();
  const brutos = await searchParams;
  const hoje = dataLocalDoInstante(new Date());
  const { parametros, filtros } = lerListaAReceber(brutos);
  const config = await lerParametrosFinanceiros();
  const { linhas, paginacao, contagens, totais } = await listarContasAReceber(parametros, filtros, hoje, config.diasAlertaVencimento);

  const atuais = {
    aba: filtros.aba === "abertas" ? undefined : filtros.aba,
    busca: parametros.busca,
    nota: filtros.nota,
    cliente: filtros.clienteId,
    obra: filtros.projetoId,
    ordem: parametros.ordem === "vencimento" && parametros.direcao === "asc" ? undefined : parametros.ordem,
    direcao: parametros.ordem === "vencimento" && parametros.direcao === "asc" ? undefined : parametros.direcao,
    tamanho: parametros.tamanho === 25 ? undefined : parametros.tamanho,
  };
  const filtrado = !!(parametros.busca || filtros.nota || filtros.clienteId || filtros.projetoId);
  const rotuloAba = (id: string, rotulo: string) => (id === "proximos" ? `Próximos ${config.diasAlertaVencimento} dias` : rotulo);

  return (
    <>
      <CabecalhoPagina
        titulo="A receber"
        descricao="Parcelas das obras e cobranças avulsas: o que falta receber, o que está atrasado e o que já entrou."
        acoes={
          <a href={`/api/exportar/financeiro/receber${montarConsulta({ ...atuais, pagina: undefined })}`} className={buttonVariants({ variant: "outline" })}>
            <Download aria-hidden /> Exportar CSV
          </a>
        }
      />

      <section aria-labelledby="titulo-totais" className="mb-4 grid gap-3 sm:grid-cols-2">
        <h2 id="titulo-totais" className="sr-only">
          Totais
        </h2>
        <div className="rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">A receber nesta lista</p>
          <p className="text-2xl font-semibold tabular-nums">{formatarMoeda(totais.saldoCentavos)}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">Atrasado (com os mesmos filtros)</p>
          <p className={cn("text-2xl font-semibold tabular-nums", totais.atrasadoCentavos > 0 && "text-destructive")}>{formatarMoeda(totais.atrasadoCentavos)}</p>
        </div>
      </section>

      <nav aria-label="Situação das contas" className="mb-4 flex flex-wrap gap-2">
        {ABAS_A_RECEBER.map((a) => {
          const ativa = filtros.aba === a.id;
          return (
            <Link
              key={a.id}
              href={hrefDaLista("/financeiro/receber", { ...atuais, pagina: undefined }, { aba: a.id === "abertas" ? undefined : a.id })}
              aria-current={ativa ? "page" : undefined}
              className={cn("inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-sm", ativa ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent")}
            >
              {rotuloAba(a.id, a.rotulo)}
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", ativa ? "bg-primary-foreground/20" : "bg-muted")}>{contagens[a.id]}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mb-4">
        <FiltrosDaLista
          base="/financeiro/receber"
          busca={parametros.busca}
          placeholderBusca="Cliente, obra ou descrição"
          mantidos={{ aba: atuais.aba, ordem: atuais.ordem, direcao: atuais.direcao, tamanho: atuais.tamanho, cliente: atuais.cliente, obra: atuais.obra }}
          filtrado={filtrado}
        >
          <FiltroSelect nome="nota" rotulo="Nota fiscal" valor={filtros.nota} opcoes={[{ valor: "sim", rotulo: "Com nota" }, { valor: "nao", rotulo: "Sem nota" }]} />
        </FiltrosDaLista>
      </div>

      {linhas.length === 0 ? (
        <EstadoVazio
          icone={HandCoins}
          titulo={filtrado ? "Nada nesse filtro" : "Nenhuma conta nesta aba"}
          descricao={
            filtrado
              ? "Confira a busca e os filtros, ou limpe tudo para ver a lista completa."
              : "As parcelas nascem quando uma proposta é aprovada (e as de etapa abrem quando a etapa da obra é concluída). Aprove uma proposta para gerar o cronograma de recebimento."
          }
          acao={
            filtrado ? (
              <Link href="/financeiro/receber" className={buttonVariants({ variant: "outline" })}>
                Limpar filtros
              </Link>
            ) : (
              <Link href="/propostas" className={buttonVariants({ variant: "outline" })}>
                Ver propostas
              </Link>
            )
          }
        />
      ) : (
        <>
          <ListaDeRegistros tela="financeiro-receber" base="/financeiro/receber" atuais={{ ...atuais, pagina: undefined }} ordem={parametros.ordem} direcao={parametros.direcao} colunas={COLUNAS} linhas={linhas.map(paraLinha)} />
          <PaginacaoLista base="/financeiro/receber" atuais={atuais} paginacao={paginacao} tamanho={parametros.tamanho} />
        </>
      )}
    </>
  );
}
