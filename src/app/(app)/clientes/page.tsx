import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { PainelListaClientes } from "@/modules/clientes/components/painel-lista-clientes";

export const metadata: Metadata = { title: "Clientes" };

export default async function PaginaClientes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const usuario = await exigirSessao();
  const brutos = await searchParams;
  return (
    <>
      <CabecalhoPagina
        titulo="Clientes"
        descricao="Quem compra da Pontual: dados, endereços de obra, contatos e a conversa até aqui."
        acoes={
          <Link href="/clientes/novo" className={buttonVariants()}>
            <Plus aria-hidden /> Novo cliente
          </Link>
        }
      />
      <PainelListaClientes brutos={brutos} usuarioId={usuario.id} />
    </>
  );
}
