import type { Metadata } from "next";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { listarLotes } from "@/modules/importacao/aplicar";
import { AssistenteDeImportacao } from "@/modules/importacao/components/assistente-de-importacao";
import { ImportacoesAnteriores } from "@/modules/importacao/components/importacoes-anteriores";

export const metadata: Metadata = { title: "Importação" };

/** Importar/desfazer milhares de linhas leva mais que o padrão da hospedagem (as Server Actions herdam o limite desta página). */
export const maxDuration = 60;

export default async function PaginaImportacao() {
  await exigirSessao();
  const lotes = await listarLotes();
  return (
    <>
      <CabecalhoPagina
        titulo="Importação de planilhas"
        descricao="Traga clientes, fornecedores e produtos de uma planilha. Você confere tudo antes de gravar, e cada importação pode ser desfeita."
      />
      <div className="grid max-w-4xl gap-10">
        <AssistenteDeImportacao />
        <ImportacoesAnteriores lotes={lotes} />
      </div>
    </>
  );
}
