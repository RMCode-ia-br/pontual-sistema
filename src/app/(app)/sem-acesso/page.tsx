import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { exigirSessao } from "@/lib/auth/sessao";
import { permissoesDe, podeVerModulo } from "@/lib/permissoes";

export const metadata: Metadata = { title: "Sem acesso" };

/**
 * Tela simples para quem abriu uma área que não pode ver (Fase 7C). Só pede sessão: nunca chama `exigirModulo`
 * (senão quem não tem acesso a nada entraria em laço de redirecionamento).
 */
export default async function PaginaSemAcesso() {
  const usuario = await exigirSessao();
  const podeVoltarAoPainel = podeVerModulo(permissoesDe(usuario), "PAINEL");

  return (
    <section className="mx-auto flex max-w-lg flex-col items-center gap-4 py-16 text-center" aria-labelledby="titulo-sem-acesso">
      <ShieldAlert className="text-muted-foreground size-12" aria-hidden />
      <h1 id="titulo-sem-acesso" className="text-xl font-semibold">
        Você não tem acesso a esta área
      </h1>
      <p className="text-muted-foreground">Fale com o administrador se precisar dela.</p>
      {podeVoltarAoPainel ? (
        <Link href="/" className="text-primary text-sm underline underline-offset-4">
          Voltar ao painel
        </Link>
      ) : null}
    </section>
  );
}
