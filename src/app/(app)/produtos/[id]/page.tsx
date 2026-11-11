import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AcoesDoCadastro } from "@/components/acoes-do-cadastro";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { exigirSessao } from "@/lib/auth/sessao";
import { formatarData, formatarMoeda } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { Anexos } from "@/modules/anexos/components/anexos";
import { listarAnexos } from "@/modules/anexos/queries";
import { excluirProdutos, inativarProdutos, reativarProdutos } from "@/modules/produtos/actions/produtos";
import { FormProduto } from "@/modules/produtos/components/form-produto";
import { HistoricoDePreco } from "@/modules/produtos/components/historico-de-preco";
import { listarHistoricoDePreco, listarOpcoesDeProduto, obterProduto } from "@/modules/produtos/queries";
import { SIGLA_UNIDADE } from "@/modules/produtos/schemas";

export const metadata: Metadata = { title: "Produto" };

const ABAS = [
  { valor: "dados", titulo: "Dados" },
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
        {aba === "historico" ? <HistoricoDePreco itens={await listarHistoricoDePreco(produto.id)} /> : null}
        {aba === "anexos" ? <Anexos entidadeTipo="Produto" entidadeId={produto.id} anexos={await listarAnexos("Produto", produto.id)} titulo="Arquivos do produto" /> : null}
      </div>
    </>
  );
}
