import { Download, Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { FiltrosDaLista } from "@/components/lista/filtros-da-lista";
import { ListaDeRegistros, type ColunaLista, type LinhaLista } from "@/components/lista/lista-de-registros";
import { PaginacaoLista } from "@/components/lista/paginacao-lista";
import { buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { dataLocalDoInstante, formatarDataCalendario, formatarMoeda } from "@/lib/formatadores";
import { hrefDaLista, montarConsulta, type ParametrosBrutos } from "@/lib/listas/parametros";
import { cn } from "@/lib/utils";
import { BotaoNovaContaAPagar } from "@/modules/financeiro/components/dialogo-conta-pagar";
import { textoDaSituacao } from "@/modules/financeiro/components/selo-da-situacao";
import { ABAS_A_PAGAR, lerListaAPagar, listarContasAPagar, opcoesDeContaAPagar, type ContaAPagarDaLista } from "@/modules/financeiro/queries-pagar";
import { lerParametrosFinanceiros } from "@/modules/financeiro/queries-receber";

export const metadata: Metadata = { title: "A pagar" };

const COLUNAS: ColunaLista[] = [
  { id: "conta", rotulo: "Conta", ordenavel: "descricao" },
  { id: "vencimento", rotulo: "Vencimento", ordenavel: "vencimento" },
  { id: "valor", rotulo: "Valor", ordenavel: "valor" },
  { id: "pago", rotulo: "Pago" },
  { id: "saldo", rotulo: "Saldo" },
  { id: "categoria", rotulo: "Categoria", escondidaPorPadrao: true },
];

function paraLinha(c: ContaAPagarDaLista): LinhaLista {
  const r = c.resumo;
  return {
    id: c.id,
    href: `/financeiro/pagar/${c.id}`,
    inativa: c.status === "CANCELADA",
    celulas: {
      conta: { texto: c.descricao, sub: [c.favorecido, c.obra, c.recorrente ? "Recorrente" : null].filter(Boolean).join(" · ") || undefined },
      vencimento: {
        texto: formatarDataCalendario(c.vencimento),
        marcas: [{ texto: textoDaSituacao(r), variante: r.situacao === "ATRASADO" ? "destructive" : r.situacao === "VENCE_HOJE" ? "default" : r.situacao === "PAGO" ? "secondary" : "outline" }],
      },
      valor: { texto: formatarMoeda(c.valorCentavos), direita: true },
      pago: { texto: c.valorPagoCentavos > 0 ? formatarMoeda(c.valorPagoCentavos) : "—", direita: true },
      saldo: { texto: formatarMoeda(r.saldoCentavos), direita: true },
      categoria: c.categoria,
    },
  };
}

export default async function PaginaAPagar({ searchParams }: { searchParams: Promise<ParametrosBrutos> }) {
  await exigirSessao();
  const brutos = await searchParams;
  const hoje = dataLocalDoInstante(new Date());
  const { parametros, filtros } = lerListaAPagar(brutos);
  const [config, opcoes] = await Promise.all([lerParametrosFinanceiros(), opcoesDeContaAPagar()]);
  const { linhas, paginacao, contagens, totais } = await listarContasAPagar(parametros, filtros, hoje, config.diasAlertaVencimento);

  const atuais = {
    aba: filtros.aba === "abertas" ? undefined : filtros.aba,
    busca: parametros.busca,
    fornecedor: filtros.fornecedorId,
    categoria: filtros.categoriaId,
    obra: filtros.projetoId,
    recorrencia: filtros.recorrenciaId,
    ordem: parametros.ordem === "vencimento" && parametros.direcao === "asc" ? undefined : parametros.ordem,
    direcao: parametros.ordem === "vencimento" && parametros.direcao === "asc" ? undefined : parametros.direcao,
    tamanho: parametros.tamanho === 25 ? undefined : parametros.tamanho,
  };
  const filtrado = !!(parametros.busca || filtros.fornecedorId || filtros.categoriaId || filtros.projetoId || filtros.recorrenciaId);

  return (
    <>
      <CabecalhoPagina
        titulo="A pagar"
        descricao="Contas únicas, parceladas e recorrentes: o que vence, o que está atrasado e o que já foi pago."
        acoes={
          <>
            <Link href="/financeiro/pagar/recorrencias" className={buttonVariants({ variant: "outline" })}>
              Recorrências
            </Link>
            <a href={`/api/exportar/financeiro/pagar${montarConsulta({ ...atuais, pagina: undefined })}`} className={buttonVariants({ variant: "outline" })}>
              <Download aria-hidden /> Exportar CSV
            </a>
            <BotaoNovaContaAPagar opcoes={opcoes} hoje={hoje} />
          </>
        }
      />

      <section aria-labelledby="titulo-totais" className="mb-4 grid gap-3 sm:grid-cols-2">
        <h2 id="titulo-totais" className="sr-only">
          Totais
        </h2>
        <div className="rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">A pagar nesta lista</p>
          <p className="text-2xl font-semibold tabular-nums">{formatarMoeda(totais.saldoCentavos)}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">Atrasado (com os mesmos filtros)</p>
          <p className={cn("text-2xl font-semibold tabular-nums", totais.atrasadoCentavos > 0 && "text-destructive")}>{formatarMoeda(totais.atrasadoCentavos)}</p>
        </div>
      </section>

      <nav aria-label="Situação das contas" className="mb-4 flex flex-wrap gap-2">
        {ABAS_A_PAGAR.map((a) => {
          const ativa = filtros.aba === a.id;
          return (
            <Link
              key={a.id}
              href={hrefDaLista("/financeiro/pagar", { ...atuais, pagina: undefined }, { aba: a.id === "abertas" ? undefined : a.id })}
              aria-current={ativa ? "page" : undefined}
              className={cn("inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-sm", ativa ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent")}
            >
              {a.id === "proximos" ? `Próximos ${config.diasAlertaVencimento} dias` : a.rotulo}
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", ativa ? "bg-primary-foreground/20" : "bg-muted")}>{contagens[a.id]}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mb-4">
        <FiltrosDaLista
          base="/financeiro/pagar"
          busca={parametros.busca}
          placeholderBusca="Descrição, fornecedor, categoria ou obra"
          mantidos={{ aba: atuais.aba, ordem: atuais.ordem, direcao: atuais.direcao, tamanho: atuais.tamanho, fornecedor: atuais.fornecedor, categoria: atuais.categoria, obra: atuais.obra, recorrencia: atuais.recorrencia }}
          filtrado={filtrado}
        />
      </div>

      {linhas.length === 0 ? (
        <EstadoVazio
          icone={Receipt}
          titulo={filtrado ? "Nada nesse filtro" : "Nenhuma conta nesta aba"}
          descricao={filtrado ? "Confira a busca e os filtros, ou limpe tudo para ver a lista completa." : "Lance as contas que vão vencer (única, parcelada ou recorrente) para o fluxo de caixa mostrar o que sai nos próximos dias."}
          acao={
            filtrado ? (
              <Link href="/financeiro/pagar" className={buttonVariants({ variant: "outline" })}>
                Limpar filtros
              </Link>
            ) : (
              <BotaoNovaContaAPagar opcoes={opcoes} hoje={hoje} />
            )
          }
        />
      ) : (
        <>
          <ListaDeRegistros tela="financeiro-pagar" base="/financeiro/pagar" atuais={{ ...atuais, pagina: undefined }} ordem={parametros.ordem} direcao={parametros.direcao} colunas={COLUNAS} linhas={linhas.map(paraLinha)} />
          <PaginacaoLista base="/financeiro/pagar" atuais={atuais} paginacao={paginacao} tamanho={parametros.tamanho} />
        </>
      )}
    </>
  );
}
