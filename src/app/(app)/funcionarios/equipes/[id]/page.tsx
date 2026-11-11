import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { AcoesDaEquipe } from "@/modules/funcionarios/components/acoes-da-equipe";
import { FormEquipe } from "@/modules/funcionarios/components/form-equipe";
import { SecaoMembros } from "@/modules/funcionarios/components/secao-membros";
import { listarFuncionariosForaDaEquipe, obterEquipe } from "@/modules/funcionarios/queries";

export const metadata: Metadata = { title: "Equipe" };

export default async function PaginaEquipe({ params }: { params: Promise<{ id: string }> }) {
  await exigirSessao();
  const { id } = await params;
  const equipe = await obterEquipe(id);
  if (!equipe) notFound();
  const disponiveis = await listarFuncionariosForaDaEquipe(equipe.id);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/funcionarios/equipes" className="text-muted-foreground hover:underline">
          ← Voltar para as equipes
        </Link>
      </p>
      <CabecalhoPagina titulo={equipe.nome} descricao={equipe.descricao ?? undefined} acoes={<AcoesDaEquipe id={equipe.id} nome={equipe.nome} />} />
      <div className="grid max-w-3xl gap-8">
        <FormEquipe equipe={{ id: equipe.id, nome: equipe.nome, descricao: equipe.descricao, ativo: equipe.ativo }} />
        <SecaoMembros equipeId={equipe.id} membros={equipe.membros} disponiveis={disponiveis} />
      </div>
    </>
  );
}
