import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirModulo } from "@/lib/auth/modulo";
import { FormCondicao } from "@/modules/condicoes-pagamento/components/form-condicao";

export const metadata: Metadata = { title: "Nova condição de pagamento" };

export default async function PaginaNovaCondicao() {
  await exigirModulo("CADASTROS", { nivel: "alterar" });
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/configuracoes/condicoes-pagamento" className="text-muted-foreground hover:underline">
          ← Voltar para as condições
        </Link>
      </p>
      <CabecalhoPagina titulo="Nova condição de pagamento" />
      <div className="max-w-3xl">
        <FormCondicao />
      </div>
    </>
  );
}
