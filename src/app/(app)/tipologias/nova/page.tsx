import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { FormTipologia } from "@/modules/tipologias/components/form-tipologia";

export const metadata: Metadata = { title: "Nova tipologia" };

export default async function PaginaNovaTipologia() {
  await exigirSessao();
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/tipologias" className="text-muted-foreground hover:underline">
          ← Voltar para as tipologias
        </Link>
      </p>
      <CabecalhoPagina titulo="Nova tipologia" descricao="Depois de criar, cadastre a composição de custo e a tabela de preços." />
      <div className="max-w-3xl">
        <FormTipologia />
      </div>
    </>
  );
}
