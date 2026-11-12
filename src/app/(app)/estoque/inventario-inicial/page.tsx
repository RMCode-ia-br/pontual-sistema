import { Package } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exigirSessao } from "@/lib/auth/sessao";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { GradeDeContagem } from "@/modules/estoque/components/grade-de-contagem";
import { produtosSemMovimento } from "@/modules/estoque/queries";

export const metadata: Metadata = { title: "Contagem inicial do estoque" };

export default async function PaginaContagemInicial({ searchParams }: { searchParams: Promise<{ busca?: string }> }) {
  await exigirSessao();
  const { busca: brutoDaBusca } = await searchParams;
  const busca = (brutoDaBusca ?? "").trim().slice(0, 80) || undefined;
  const { produtos, temMais } = await produtosSemMovimento(busca, 100);
  const hoje = dataLocalDoInstante(new Date());

  return (
    <>
      <CabecalhoPagina
        titulo="Contagem inicial do estoque"
        descricao="Opcional. Conte o que já existe na fábrica e registre aqui, uma vez por produto. O sistema não inventa quantidade nem custo: só entra o que você digitar."
        acoes={
          <Link href="/estoque/movimentacoes" className={buttonVariants({ variant: "outline" })}>
            Ver movimentações
          </Link>
        }
      />

      <form method="get" role="search" className="mb-4 flex max-w-xl gap-2">
        <Input type="search" name="busca" defaultValue={busca ?? ""} placeholder="Buscar produto por código ou descrição" maxLength={80} className="h-9" aria-label="Buscar produto" autoComplete="off" />
        <button type="submit" className={buttonVariants({ variant: "secondary", className: "h-9" })}>
          Buscar
        </button>
      </form>

      {produtos.length === 0 ? (
        <EstadoVazio
          icone={Package}
          titulo={busca ? "Nenhum produto sem movimento nessa busca" : "Nenhum produto disponível para a contagem inicial"}
          descricao={
            busca
              ? "Só aparecem produtos ativos que ainda não têm nenhum movimento. Depois do primeiro movimento, a correção é um ajuste na ficha do produto."
              : "Cadastre os produtos primeiro (ou use produtos que ainda não tenham movimentos). Depois do primeiro movimento, a correção é um ajuste na ficha do produto."
          }
          acao={
            <Link href="/produtos/novo" className={buttonVariants()}>
              Cadastrar produto
            </Link>
          }
        />
      ) : (
        <>
          <GradeDeContagem produtos={produtos} hoje={hoje} />
          {temMais ? <p className="text-muted-foreground mt-3 text-sm">Mostrando os primeiros 100. Use a busca para achar os demais.</p> : null}
        </>
      )}
    </>
  );
}
