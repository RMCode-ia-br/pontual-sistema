import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { exigirSessao } from "@/lib/auth/sessao";
import { formatarRevisao } from "@/lib/dominio/numeracao-proposta";
import { prisma } from "@/lib/db";
import { AcoesDaProposta } from "@/modules/propostas/components/acoes-da-proposta";
import { EditorProposta } from "@/modules/propostas/components/editor-proposta";
import { listarOpcoesDoEditor, obterPropostaParaEditor } from "@/modules/propostas/queries";
import { ROTULO_STATUS_PROPOSTA } from "@/modules/propostas/schemas";
import { serializarProposta } from "@/modules/propostas/tipos";

export const metadata: Metadata = { title: "Proposta" };

export default async function PaginaProposta({ params }: { params: Promise<{ id: string }> }) {
  await exigirSessao();
  const { id } = await params;
  const proposta = await obterPropostaParaEditor(id);
  if (!proposta) notFound();
  const [opcoes, medidasDaVisita] = await Promise.all([
    listarOpcoesDoEditor(),
    prisma.medidaRascunho.count({ where: { projetoId: proposta.projetoId, deletadoEm: null, larguraMm: { not: null }, alturaMm: { not: null } } }),
  ]);
  const rascunho = proposta.status === "RASCUNHO";

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/projetos/${proposta.projeto.id}?aba=propostas`} className="text-muted-foreground hover:underline">
          ← {proposta.projeto.codigo} · {proposta.projeto.titulo}
        </Link>
      </p>
      <CabecalhoPagina
        titulo={`Proposta ${proposta.numero}`}
        descricao={`${proposta.clienteNome}${proposta.parte ? ` · ${proposta.parte}` : ""}${proposta.revisao > 0 ? ` · ${formatarRevisao(proposta.revisao)}` : ""}`}
        acoes={<AcoesDaProposta propostaId={proposta.id} numero={proposta.numero} rascunho={rascunho} />}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant={proposta.status === "APROVADA" ? "default" : proposta.status === "RECUSADA" || proposta.status === "CANCELADA" ? "destructive" : "secondary"}>{ROTULO_STATUS_PROPOSTA[proposta.status]}</Badge>
        {rascunho ? null : <span className="text-muted-foreground text-sm">Esta proposta já foi enviada e não pode ser editada diretamente.</span>}
      </div>
      <EditorProposta proposta={serializarProposta(proposta)} opcoes={opcoes} somenteLeitura={!rascunho} temMedidasDaVisita={medidasDaVisita > 0} />
    </>
  );
}
