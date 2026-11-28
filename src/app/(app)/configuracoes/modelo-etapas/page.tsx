import type { Metadata } from "next";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirModulo } from "@/lib/auth/modulo";
import { EditorModeloEtapas } from "@/modules/obras/components/editor-modelo-etapas";
import { obterModeloPadrao } from "@/modules/obras/queries";

export const metadata: Metadata = { title: "Modelo de etapas" };

export default async function PaginaModeloDeEtapas() {
  await exigirModulo("CONFIGURACOES");
  const modelo = await obterModeloPadrao();
  return (
    <>
      <CabecalhoPagina
        titulo="Modelo de etapas"
        descricao="As etapas que toda obra nova recebe quando uma proposta é aprovada, a que prazo cada uma pertence e qual delas libera a cobrança de cada parcela."
      />
      <div className="max-w-4xl">
        <EditorModeloEtapas itens={modelo?.itens ?? []} />
      </div>
    </>
  );
}
