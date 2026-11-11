import type { Metadata } from "next";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { PainelListaClientes } from "@/modules/clientes/components/painel-lista-clientes";

export const metadata: Metadata = { title: "Parceiros" };

export default async function PaginaParceiros({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const usuario = await exigirSessao();
  const brutos = await searchParams;
  return (
    <>
      <CabecalhoPagina titulo="Parceiros" descricao="Arquitetos, designers e construtoras que indicam e trazem obras. É uma visão dos clientes marcados assim." />
      <PainelListaClientes brutos={brutos} usuarioId={usuario.id} parceiros />
    </>
  );
}
