import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { FormCliente } from "@/modules/clientes/components/form-cliente";

export const metadata: Metadata = { title: "Novo cliente" };

export default async function PaginaNovoCliente() {
  await exigirSessao();
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/clientes" className="text-muted-foreground hover:underline">
          ← Voltar para os clientes
        </Link>
      </p>
      <CabecalhoPagina titulo="Novo cliente" descricao="Só o nome é obrigatório. Dá para completar o resto depois." />
      <div className="max-w-3xl">
        <FormCliente />
      </div>
    </>
  );
}
