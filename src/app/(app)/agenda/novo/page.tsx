import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { formatarNumeroDoChamado } from "@/lib/dominio/chamados";
import { obterExpediente } from "@/modules/agenda/queries";
import { FormEvento } from "@/modules/agenda/components/form-evento";
import { TIPOS_EVENTO, type TipoEvento } from "@/modules/agenda/schemas";
import { listarEquipes } from "@/modules/funcionarios/queries";
import { listarUsuariosAtivos } from "@/modules/tarefas/queries";

export const metadata: Metadata = { title: "Novo compromisso" };

const ID = /^[\w-]{1,64}$/;

export default async function PaginaNovoEvento({ searchParams }: { searchParams: Promise<{ inicio?: string; projeto?: string; tipo?: string; etapa?: string; equipe?: string; chamado?: string }> }) {
  const usuario = await exigirSessao();
  const { inicio, projeto: projetoIdDaUrl, tipo, etapa: etapaId, equipe: equipeId, chamado: chamadoId } = await searchParams;

  // Vindo de um chamado de assistência (?chamado=ID): chega com o cliente e a obra do chamado, e o tipo "Assistência".
  const chamado =
    chamadoId && ID.test(chamadoId)
      ? await prisma.chamado.findFirst({
          where: { id: chamadoId, deletadoEm: null, status: { in: ["ABERTO", "AGENDADO", "EM_ATENDIMENTO"] } },
          select: { id: true, numero: true, projetoId: true, cliente: { select: { id: true, nome: true } } },
        })
      : null;
  const projetoId = chamado?.projetoId ?? projetoIdDaUrl;

  // Vindo do projeto (?projeto=ID): já chega com o projeto, o cliente e o endereço da obra escolhidos.
  const projeto =
    projetoId && ID.test(projetoId)
      ? await prisma.projeto.findFirst({
          where: { id: projetoId, deletadoEm: null },
          select: { id: true, codigo: true, titulo: true, clienteId: true, enderecoObraId: true, cliente: { select: { nome: true } } },
        })
      : null;
  // Vindo do calendário de instalação (?etapa=ID): o compromisso cumpre essa etapa, que precisa ser da obra escolhida.
  const etapa =
    projeto && etapaId && ID.test(etapaId)
      ? await prisma.etapaProjeto.findFirst({ where: { id: etapaId, projetoId: projeto.id, deletadoEm: null }, select: { id: true, nome: true } })
      : null;
  const [usuarios, equipes, expediente] = await Promise.all([listarUsuariosAtivos(), listarEquipes(), obterExpediente()]);
  const equipesAtivas = equipes.filter((e) => e.ativo);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/agenda" className="text-muted-foreground hover:underline">
          ← Voltar para a agenda
        </Link>
      </p>
      <CabecalhoPagina titulo="Novo compromisso" descricao="Visita, medição, instalação, entrega, assistência ou reunião. Conflitos de horário avisam, mas você decide." />
      <div className="max-w-3xl">
        <FormEvento
          usuarios={usuarios}
          equipes={equipesAtivas.map((e) => ({ id: e.id, nome: e.nome }))}
          equipeInicial={equipeId && equipesAtivas.some((e) => e.id === equipeId) ? equipeId : undefined}
          etapaInicial={etapa}
          usuarioAtualId={usuario.id}
          duracaoPadraoMin={expediente.visitaDuracaoMin}
          inicioInicial={inicio && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(inicio) ? inicio : undefined}
          tipoInicial={chamado ? "ASSISTENCIA" : (TIPOS_EVENTO as readonly string[]).includes(tipo ?? "") ? (tipo as TipoEvento) : undefined}
          clienteInicial={chamado ? chamado.cliente : null}
          chamadoInicial={chamado ? { id: chamado.id, rotulo: formatarNumeroDoChamado(chamado.numero) } : null}
          projetoInicial={projeto ? { id: projeto.id, rotulo: `${projeto.codigo} · ${projeto.titulo} — ${projeto.cliente.nome}`, clienteId: projeto.clienteId, clienteNome: projeto.cliente.nome, enderecoObraId: projeto.enderecoObraId } : null}
        />
      </div>
    </>
  );
}
