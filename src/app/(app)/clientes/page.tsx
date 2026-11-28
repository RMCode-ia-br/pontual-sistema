import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { buttonVariants } from "@/components/ui/button";
import { permissoesDaLista } from "@/components/lista/acoes-permitidas";
import { exigirModulo } from "@/lib/auth/modulo";
import { can } from "@/lib/permissoes";
import { PainelListaClientes } from "@/modules/clientes/components/painel-lista-clientes";

export const metadata: Metadata = { title: "Clientes" };

export default async function PaginaClientes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await exigirModulo("CLIENTES");
  const brutos = await searchParams;
  return (
    <>
      <CabecalhoPagina
        titulo="Clientes"
        descricao="Quem compra da Pontual: dados, endereços de obra, contatos e a conversa até aqui."
        acoes={
          can(usuario, "criar", "cliente") ? (
            <Link href="/clientes/novo" className={buttonVariants()}>
              <Plus aria-hidden /> Novo cliente
            </Link>
          ) : null
        }
      />
      <PainelListaClientes
        brutos={brutos}
        usuarioId={usuario.id}
        permitidas={permissoesDaLista(usuario, "cliente")}
      />
    </>
  );
}
