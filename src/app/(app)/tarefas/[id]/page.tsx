import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { formatarDataCalendario } from "@/lib/formatadores";
import { Anexos } from "@/modules/anexos/components/anexos";
import { listarAnexos } from "@/modules/anexos/queries";
import { AcoesTarefa } from "@/modules/tarefas/components/acoes-tarefa";
import { FormTarefa } from "@/modules/tarefas/components/form-tarefa";
import { listarUsuariosAtivos, obterTarefa } from "@/modules/tarefas/queries";

export const metadata: Metadata = { title: "Tarefa" };

export default async function PaginaTarefa({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await exigirSessao();
  const { id } = await params;

  const tarefa = await obterTarefa(id);
  if (!tarefa) notFound();

  const [usuarios, anexos] = await Promise.all([listarUsuariosAtivos(), listarAnexos("Tarefa", tarefa.id)]);
  const concluida = tarefa.status === "CONCLUIDA";

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/tarefas" className="text-muted-foreground hover:underline">
          ← Voltar para as tarefas
        </Link>
      </p>
      <CabecalhoPagina
        titulo={tarefa.titulo}
        descricao={
          tarefa.vencimento ? `Vence em ${formatarDataCalendario(tarefa.vencimento)}${tarefa.responsavelNome ? ` · ${tarefa.responsavelNome}` : ""}` : tarefa.responsavelNome ?? undefined
        }
        acoes={<AcoesTarefa id={tarefa.id} concluida={concluida} titulo={tarefa.titulo} />}
      />
      <div className="mb-6 flex flex-wrap gap-2">
        {concluida ? <Badge variant="secondary">Concluída</Badge> : <Badge variant="outline">Aberta</Badge>}
        {tarefa.vencida ? <Badge variant="destructive">Vencida</Badge> : null}
      </div>

      <div className="grid max-w-2xl gap-8">
        <FormTarefa usuarios={usuarios} usuarioAtualId={usuario.id} tarefa={tarefa} />
        <Anexos entidadeTipo="Tarefa" entidadeId={tarefa.id} anexos={anexos} titulo="Arquivos da tarefa" />
      </div>
    </>
  );
}
