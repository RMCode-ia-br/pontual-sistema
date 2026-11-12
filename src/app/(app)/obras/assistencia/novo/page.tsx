import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { FormChamado } from "@/modules/obras/components/form-chamado";

export const metadata: Metadata = { title: "Novo chamado" };

const ID = /^[\w-]{1,64}$/;

export default async function PaginaNovoChamado({ searchParams }: { searchParams: Promise<{ cliente?: string; projeto?: string }> }) {
  await exigirSessao();
  const { cliente: clienteIdDaUrl, projeto: projetoId } = await searchParams;

  // Vindo da obra (?projeto=ID) ou do cliente (?cliente=ID): chega com eles escolhidos.
  const obra = projetoId && ID.test(projetoId) ? await prisma.projeto.findFirst({ where: { id: projetoId, deletadoEm: null }, select: { id: true, clienteId: true, cliente: { select: { id: true, nome: true } } } }) : null;
  const cliente = obra
    ? obra.cliente
    : clienteIdDaUrl && ID.test(clienteIdDaUrl)
      ? await prisma.cliente.findFirst({ where: { id: clienteIdDaUrl, deletadoEm: null }, select: { id: true, nome: true } })
      : null;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/obras/assistencia" className="text-muted-foreground hover:underline">
          ← Voltar para a assistência
        </Link>
      </p>
      <CabecalhoPagina titulo="Novo chamado" descricao="Registre o pedido do cliente. A garantia é conferida pela data de conclusão da instalação da obra." />
      <div className="max-w-3xl">
        <FormChamado clienteInicial={cliente} obraInicial={obra?.id} />
      </div>
    </>
  );
}
