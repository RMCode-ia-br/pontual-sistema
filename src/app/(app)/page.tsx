import type { Metadata } from "next";

import { exigirSessao } from "@/lib/auth/sessao";

export const metadata: Metadata = { title: "Painel" };

export default async function PaginaPainel() {
  const usuario = await exigirSessao();
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Olá, {usuario.nome}</h1>
      <p className="text-muted-foreground mt-1 text-sm">O painel será construído nas próximas etapas.</p>
    </section>
  );
}
