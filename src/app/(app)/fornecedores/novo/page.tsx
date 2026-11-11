import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { FormFornecedor } from "@/modules/fornecedores/components/form-fornecedor";
import { listarCategoriasAtivas } from "@/modules/fornecedores/queries";

export const metadata: Metadata = { title: "Novo fornecedor" };

export default async function PaginaNovoFornecedor() {
  await exigirSessao();
  const categorias = await listarCategoriasAtivas();
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/fornecedores" className="text-muted-foreground hover:underline">
          ← Voltar para os fornecedores
        </Link>
      </p>
      <CabecalhoPagina titulo="Novo fornecedor" descricao="Só o nome é obrigatório. Dá para completar o resto depois." />
      <div className="max-w-3xl">
        <FormFornecedor categorias={categorias} />
      </div>
    </>
  );
}
