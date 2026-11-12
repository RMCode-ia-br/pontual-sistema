import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AcoesDoCadastro } from "@/components/acoes-do-cadastro";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { exigirSessao } from "@/lib/auth/sessao";
import { abaixoDoMinimo, formatarQuantidade } from "@/lib/dominio/estoque";
import { dataLocalDoInstante, formatarData, formatarMoeda } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { Anexos } from "@/modules/anexos/components/anexos";
import { listarAnexos } from "@/modules/anexos/queries";
import { DialogoDeMovimento } from "@/modules/estoque/components/dialogo-de-movimento";
import { ListaDeMovimentos } from "@/modules/estoque/components/lista-de-movimentos";
import { estoqueDoProduto } from "@/modules/estoque/queries";
import { excluirProdutos, inativarProdutos, reativarProdutos } from "@/modules/produtos/actions/produtos";
import { FormProduto } from "@/modules/produtos/components/form-produto";
import { HistoricoDePreco } from "@/modules/produtos/components/historico-de-preco";
import { listarHistoricoDePreco, listarOpcoesDeProduto, obterProduto } from "@/modules/produtos/queries";
import { SIGLA_UNIDADE } from "@/modules/produtos/schemas";

export const metadata: Metadata = { title: "Produto" };

const ABAS = [
  { valor: "dados", titulo: "Dados" },
  { valor: "estoque", titulo: "Estoque" },
  { valor: "historico", titulo: "Histórico de preço" },
  { valor: "anexos", titulo: "Arquivos" },
] as const;

export default async function PaginaProduto({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  await exigirSessao();
  const { id } = await params;
  const { aba: abaBruta } = await searchParams;

  const produto = await obterProduto(id);
  if (!produto) notFound();
  const aba = ABAS.find((a) => a.valor === abaBruta)?.valor ?? "dados";

  const descricao = [
    produto.codigo,
    produto.custoUnitarioCentavos !== null ? `${formatarMoeda(produto.custoUnitarioCentavos)} por ${SIGLA_UNIDADE[produto.unidade]}` : "Sem custo informado",
    produto.custoAtualizadoEm ? `custo atualizado em ${formatarData(produto.custoAtualizadoEm)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/produtos" className="text-muted-foreground hover:underline">
          ← Voltar para os produtos
        </Link>
      </p>
      <CabecalhoPagina
        titulo={produto.descricao}
        descricao={descricao}
        acoes={
          <AcoesDoCadastro
            id={produto.id}
            nome={produto.descricao}
            ativo={produto.ativo}
            voltarPara="/produtos"
            inativar={inativarProdutos}
            reativar={reativarProdutos}
            excluir={excluirProdutos}
            preservado="O histórico de preços é preservado."
          />
        }
      />
      {produto.ativo ? null : (
        <div className="mb-4">
          <Badge variant="destructive">Inativo</Badge>
        </div>
      )}

      <nav aria-label="Seções do produto" className="mb-6 flex gap-1 overflow-x-auto border-b">
        {ABAS.map((a) => (
          <Link
            key={a.valor}
            href={`/produtos/${produto.id}?aba=${a.valor}`}
            aria-current={aba === a.valor ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center border-b-2 px-3 text-sm",
              aba === a.valor ? "border-primary text-primary font-medium" : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {a.titulo}
          </Link>
        ))}
      </nav>

      <div className="max-w-3xl">
        {aba === "dados" ? <FormProduto produto={produto} opcoes={await listarOpcoesDeProduto()} /> : null}
        {aba === "estoque" ? <AbaDeEstoque produtoId={produto.id} nome={produto.descricao} unidade={produto.unidade} custoCentavos={produto.custoUnitarioCentavos} ativo={produto.ativo} /> : null}
        {aba === "historico" ? <HistoricoDePreco itens={await listarHistoricoDePreco(produto.id)} /> : null}
        {aba === "anexos" ? <Anexos entidadeTipo="Produto" entidadeId={produto.id} anexos={await listarAnexos("Produto", produto.id)} titulo="Arquivos do produto" /> : null}
      </div>
    </>
  );
}

async function AbaDeEstoque({ produtoId, nome, unidade, custoCentavos, ativo }: { produtoId: string; nome: string; unidade: keyof typeof SIGLA_UNIDADE; custoCentavos: number | null; ativo: boolean }) {
  const e = await estoqueDoProduto(produtoId);
  if (!e) return null;
  const sigla = SIGLA_UNIDADE[unidade];
  const abaixo = abaixoDoMinimo(e.saldoMilesimos, e.minimoMilesimos);
  return (
    <section aria-labelledby="titulo-estoque" className="grid gap-4">
      <h2 id="titulo-estoque" className="sr-only">
        Estoque
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">Saldo em estoque</p>
          <p className="text-2xl font-semibold tabular-nums">
            {formatarQuantidade(e.saldoMilesimos)} {sigla}
          </p>
          {abaixo ? <Badge variant="destructive">Abaixo do mínimo ({formatarQuantidade(e.minimoMilesimos ?? 0)})</Badge> : e.minimoMilesimos === null ? <p className="text-muted-foreground text-xs">Sem estoque mínimo definido: sem alerta.</p> : null}
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">Custo unitário atual</p>
          <p className="text-2xl font-semibold tabular-nums">{custoCentavos !== null ? formatarMoeda(custoCentavos) : "Sem custo"}</p>
          {custoCentavos === null ? <p className="text-muted-foreground text-xs">Sem custo, as saídas deste produto deixam a margem da obra incompleta.</p> : null}
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">Retalhos disponíveis</p>
          <p className="text-2xl font-semibold tabular-nums">{e.retalhosDisponiveis}</p>
        </div>
      </div>

      {ativo ? (
        <div className="flex flex-wrap gap-2">
          <DialogoDeMovimento produtoId={produtoId} produtoNome={nome} sigla={sigla} saldoMilesimos={e.saldoMilesimos} custoAtualCentavos={custoCentavos} hoje={dataLocalDoInstante(new Date())} />
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Produto inativo: reative-o para registrar movimentos.</p>
      )}

      <div className="grid gap-2">
        <h3 className="font-medium">Últimos movimentos</h3>
        {e.movimentos.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">Nenhum movimento ainda. O saldo parte de zero: registre uma entrada ou faça a contagem inicial (opcional).</p>
        ) : (
          <ListaDeMovimentos movimentos={e.movimentos} mostrarProduto={false} />
        )}
        {e.totalDeMovimentos > e.movimentos.length ? <p className="text-muted-foreground text-xs">Mostrando os {e.movimentos.length} mais recentes de {e.totalDeMovimentos}. Veja todos em Movimentações.</p> : null}
      </div>
    </section>
  );
}
