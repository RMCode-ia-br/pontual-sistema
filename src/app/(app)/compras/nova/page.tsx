import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { FormCompra } from "@/modules/compras/components/form-compra";
import { opcoesDeCompra } from "@/modules/compras/queries";

export const metadata: Metadata = { title: "Nova compra" };

/** Compra nova. Pode vir de uma obra (`?obra=`, destino obra) ou de um tipo (`?tipo=VIDRO`). */
export default async function PaginaNovaCompra({ searchParams }: { searchParams: Promise<{ obra?: string; tipo?: string }> }) {
  await exigirSessao();
  const { obra, tipo } = await searchParams;
  const opcoes = await opcoesDeCompra();
  const projeto = obra ? await prisma.projeto.findFirst({ where: { id: obra.slice(0, 64), deletadoEm: null }, select: { id: true, codigo: true, titulo: true } }) : null;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/compras" className="text-muted-foreground hover:underline">
          ← Compras
        </Link>
      </p>
      <CabecalhoPagina titulo="Nova compra" descricao="Pedido de material ou de vidro ao fornecedor. Fornecedor e produto que não existem se cadastram na hora." />
      <div className="max-w-4xl">
        <FormCompra
          opcoes={opcoes}
          inicial={{ tipo: tipo === "VIDRO" ? "VIDRO" : "MATERIAL", destino: projeto || tipo === "VIDRO" ? "OBRA" : "ESTOQUE", projeto: projeto ? { id: projeto.id, rotulo: `${projeto.codigo} · ${projeto.titulo}` } : null }}
        />
      </div>
    </>
  );
}
