import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { FormCompra } from "@/modules/compras/components/form-compra";
import { obterCompra, opcoesDeCompra } from "@/modules/compras/queries";

export const metadata: Metadata = { title: "Editar compra" };

export default async function PaginaEditarCompra({ params }: { params: Promise<{ id: string }> }) {
  await exigirSessao();
  const { id } = await params;
  const compra = await obterCompra(id, dataLocalDoInstante(new Date()));
  if (!compra) notFound();
  if (compra.status === "RECEBIDO" || compra.status === "CANCELADO") redirect(`/compras/${id}`);
  const opcoes = await opcoesDeCompra();

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/compras/${id}`} className="text-muted-foreground hover:underline">
          ← {compra.numero}
        </Link>
      </p>
      <CabecalhoPagina titulo={`Editar ${compra.numero}`} descricao={compra.fornecedor} />
      <div className="max-w-4xl">
        <FormCompra opcoes={opcoes} compra={compra} />
      </div>
    </>
  );
}
