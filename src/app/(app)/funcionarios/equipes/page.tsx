import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { Badge } from "@/components/ui/badge";
import { exigirSessao } from "@/lib/auth/sessao";
import { FormEquipe } from "@/modules/funcionarios/components/form-equipe";
import { SubnavFuncionarios } from "@/modules/funcionarios/components/subnav-funcionarios";
import { listarEquipes } from "@/modules/funcionarios/queries";

export const metadata: Metadata = { title: "Equipes" };

export default async function PaginaEquipes() {
  await exigirSessao();
  const equipes = await listarEquipes();
  return (
    <>
      <CabecalhoPagina titulo="Funcionários e equipes" descricao="Equipes de instalação e de fábrica: quem trabalha junto e quem lidera." />
      <SubnavFuncionarios atual="equipes" />

      <div className="mb-6 max-w-3xl">
        <FormEquipe />
      </div>

      {equipes.length === 0 ? (
        <EstadoVazio icone={Users} titulo="Nenhuma equipe criada ainda" descricao="Crie a primeira equipe acima (por exemplo, “Equipe de instalação 1”) e depois adicione as pessoas dela." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {equipes.map((e) => (
            <li key={e.id} className="rounded-xl border p-4">
              <Link href={`/funcionarios/equipes/${e.id}`} className="font-medium hover:underline">
                {e.nome}
              </Link>
              {e.ativo ? null : (
                <Badge variant="destructive" className="ml-2">
                  Inativa
                </Badge>
              )}
              {e.descricao ? <p className="text-muted-foreground mt-0.5 text-sm">{e.descricao}</p> : null}
              <p className="text-muted-foreground mt-2 text-sm">
                {e.membros.length === 0 ? "Sem ninguém ainda" : e.membros.map((m) => (m.lider ? `${m.nome} (líder)` : m.nome)).join(", ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
