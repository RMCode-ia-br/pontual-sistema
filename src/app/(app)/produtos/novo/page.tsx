import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { FormProduto } from "@/modules/produtos/components/form-produto";
import { listarOpcoesDeProduto } from "@/modules/produtos/queries";

export const metadata: Metadata = { title: "Novo produto" };

export default async function PaginaNovoProduto() {
  await exigirSessao();
  const opcoes = await listarOpcoesDeProduto();
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/produtos" className="text-muted-foreground hover:underline">
          ← Voltar para os produtos
        </Link>
      </p>
      <CabecalhoPagina titulo="Novo produto" descricao="Só o código, a descrição e a unidade são obrigatórios. O custo pode ficar vazio até você saber o valor." />
      <div className="max-w-3xl">
        <FormProduto opcoes={opcoes} />
      </div>
    </>
  );
}
