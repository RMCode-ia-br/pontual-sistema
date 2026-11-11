import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { obterExpediente } from "@/modules/agenda/queries";
import { FormEvento } from "@/modules/agenda/components/form-evento";
import { TIPOS_EVENTO, type TipoEvento } from "@/modules/agenda/schemas";
import { listarEquipes } from "@/modules/funcionarios/queries";
import { listarUsuariosAtivos } from "@/modules/tarefas/queries";

export const metadata: Metadata = { title: "Novo compromisso" };

const ID = /^[\w-]{1,64}$/;

export default async function PaginaNovoEvento({ searchParams }: { searchParams: Promise<{ inicio?: string; projeto?: string; tipo?: string }> }) {
  const usuario = await exigirSessao();
  const { inicio, projeto: projetoId, tipo } = await searchParams;

  // Vindo do projeto (?projeto=ID): já chega com o projeto, o cliente e o endereço da obra escolhidos.
  const projeto =
    projetoId && ID.test(projetoId)
      ? await prisma.projeto.findFirst({
          where: { id: projetoId, deletadoEm: null },
          select: { id: true, codigo: true, titulo: true, clienteId: true, enderecoObraId: true, cliente: { select: { nome: true } } },
        })
      : null;
  const [usuarios, equipes, expediente] = await Promise.all([listarUsuariosAtivos(), listarEquipes(), obterExpediente()]);

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
          equipes={equipes.filter((e) => e.ativo).map((e) => ({ id: e.id, nome: e.nome }))}
          usuarioAtualId={usuario.id}
          duracaoPadraoMin={expediente.visitaDuracaoMin}
          inicioInicial={inicio && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(inicio) ? inicio : undefined}
          tipoInicial={(TIPOS_EVENTO as readonly string[]).includes(tipo ?? "") ? (tipo as TipoEvento) : undefined}
          projetoInicial={projeto ? { id: projeto.id, rotulo: `${projeto.codigo} · ${projeto.titulo} — ${projeto.cliente.nome}`, clienteId: projeto.clienteId, clienteNome: projeto.cliente.nome, enderecoObraId: projeto.enderecoObraId } : null}
        />
      </div>
    </>
  );
}
