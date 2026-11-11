import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { TelaDeReajuste } from "@/modules/produtos/components/tela-de-reajuste";
import { listarOpcoesDeProduto } from "@/modules/produtos/queries";

export const metadata: Metadata = { title: "Reajuste em lote" };

export default async function PaginaReajuste() {
  await exigirSessao();
  const { fornecedores, categorias } = await listarOpcoesDeProduto();
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/produtos" className="text-muted-foreground hover:underline">
          ← Voltar para os produtos
        </Link>
      </p>
      <CabecalhoPagina
        titulo="Reajuste de custos em lote"
        descricao="Quando um fornecedor reajusta a tabela, atualize todos os produtos dele de uma vez, vendo antes o que vai mudar."
      />
      <div className="max-w-4xl">
        <TelaDeReajuste fornecedores={fornecedores} categorias={categorias} />
      </div>
    </>
  );
}
