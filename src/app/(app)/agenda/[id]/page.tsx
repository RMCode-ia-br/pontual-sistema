import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { dataLocalDoInstante, formatarDataHora, instanteParaInputDataHora } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { AcoesDoEvento } from "@/modules/agenda/components/acoes-do-evento";
import { tituloDoEvento } from "@/modules/agenda/components/calendario";
import { estiloDoEvento } from "@/modules/agenda/components/estilo-do-evento";
import { FormEvento } from "@/modules/agenda/components/form-evento";
import { obterEvento, obterExpediente } from "@/modules/agenda/queries";
import { OPCOES_LEMBRETE, ROTULO_STATUS_EVENTO, ROTULO_TIPO_EVENTO } from "@/modules/agenda/schemas";
import { listarEquipes } from "@/modules/funcionarios/queries";
import { listarUsuariosAtivos } from "@/modules/tarefas/queries";

export const metadata: Metadata = { title: "Compromisso" };

function Item({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="text-sm">{children ?? <span className="text-muted-foreground">Não informado</span>}</dd>
    </div>
  );
}

export default async function PaginaEvento({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await exigirSessao();
  const { id } = await params;
  const evento = await obterEvento(id);
  if (!evento) notFound();

  const [usuarios, equipes, expediente] = await Promise.all([listarUsuariosAtivos(), listarEquipes(), obterExpediente()]);
  const duracaoMin = Math.round((new Date(evento.fim).getTime() - new Date(evento.inicio).getTime()) / 60_000);
  const lembrete = OPCOES_LEMBRETE.find((o) => o.valor === String(evento.lembreteMin ?? ""))?.rotulo ?? (evento.lembreteMin ? `${evento.lembreteMin} minutos antes` : null);
  const dia = dataLocalDoInstante(evento.inicio);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/agenda?vista=semana&data=${dia}`} className="text-muted-foreground hover:underline">
          ← Voltar para a agenda
        </Link>
      </p>
      <CabecalhoPagina
        titulo={tituloDoEvento(evento)}
        descricao={`${ROTULO_TIPO_EVENTO[evento.tipo]} · ${formatarDataHora(evento.inicio)}`}
        acoes={
          <>
            <AcoesDoEvento id={evento.id} status={evento.status} tipoVisita={evento.tipo === "VISITA_TECNICA"} />
            <a href={`/api/agenda/exportar?id=${evento.id}`} className={buttonVariants({ variant: "outline" })}>
              <Download aria-hidden /> .ics
            </a>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn("border", estiloDoEvento(evento.tipo, "AGENDADO"))}>
          {ROTULO_TIPO_EVENTO[evento.tipo]}
        </Badge>
        <Badge variant={evento.status === "CANCELADO" || evento.status === "NAO_COMPARECEU" ? "destructive" : evento.status === "REALIZADO" ? "default" : "secondary"}>{ROTULO_STATUS_EVENTO[evento.status]}</Badge>
      </div>

      <dl className="mb-8 grid gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Item rotulo="Quando">
          {formatarDataHora(evento.inicio)} ({duracaoMin} min)
        </Item>
        <Item rotulo="Responsável">{evento.responsavelNome}</Item>
        <Item rotulo="Equipe">{evento.equipeNome}</Item>
        <Item rotulo="Cliente">
          {evento.clienteId ? (
            <Link href={`/clientes/${evento.clienteId}`} className="underline">
              {evento.clienteNome}
            </Link>
          ) : null}
        </Item>
        <Item rotulo="Projeto">
          {evento.projetoId ? (
            <Link href={`/projetos/${evento.projetoId}`} className="underline">
              {evento.projetoCodigo} · {evento.projetoTitulo}
            </Link>
          ) : null}
        </Item>
        <Item rotulo="Local">{evento.local}</Item>
        <Item rotulo="Lembrete">{lembrete}</Item>
        {evento.observacoes ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <Item rotulo="Observações">
              <span className="whitespace-pre-line">{evento.observacoes}</span>
            </Item>
          </div>
        ) : null}
      </dl>

      <h2 className="mb-3 text-lg font-semibold">Editar ou remarcar</h2>
      <div className="max-w-3xl">
        <FormEvento
          usuarios={usuarios}
          equipes={equipes.filter((e) => e.ativo || e.id === evento.equipeId).map((e) => ({ id: e.id, nome: e.nome }))}
          usuarioAtualId={usuario.id}
          duracaoPadraoMin={expediente.visitaDuracaoMin}
          evento={{
            id: evento.id,
            tipo: evento.tipo,
            titulo: evento.titulo,
            inicio: instanteParaInputDataHora(evento.inicio),
            duracaoMin,
            responsavelId: evento.responsavelId,
            equipeId: evento.equipeId,
            clienteId: evento.clienteId,
            clienteNome: evento.clienteNome,
            projeto: evento.projetoId ? { id: evento.projetoId, rotulo: `${evento.projetoCodigo} · ${evento.projetoTitulo}${evento.clienteNome ? ` — ${evento.clienteNome}` : ""}` } : null,
            enderecoId: evento.enderecoId,
            local: evento.local,
            lembreteMin: evento.lembreteMin,
            observacoes: evento.observacoes,
          }}
        />
      </div>
    </>
  );
}
