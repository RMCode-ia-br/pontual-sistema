"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { ErroNegocio, executar, falha, falhaDeValidacao, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { avaliarMovimento, ROTULO_STATUS_PROJETO, type StatusProjeto } from "@/lib/dominio/funil";
import { can } from "@/lib/permissoes";

import { moverProjetoSchema } from "../schemas";
import { mudarFaseDoProjeto } from "../servico";

/**
 * Move o projeto de fase (Kanban ou menu "Mover para…"). As regras vivem em `avaliarMovimento` (domínio):
 * entre fases abertas é livre; perder exige motivo; "Aprovado" só pela aprovação de proposta (Fase 3);
 * sair de "Perdido" reabre o projeto.
 */
export async function moverProjeto(entrada: unknown): Promise<ResultadoAcao<{ status: StatusProjeto }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "projeto")) return falha("Sem permissão.");

  const lido = moverProjetoSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  const dados = lido.data;

  return executar("projetos.mover", async () => {
    const ip = extrairIp(await headers());
    const clienteId = await prisma.$transaction(async (tx) => {
      const projeto = await tx.projeto.findFirst({
        where: { id: dados.id, deletadoEm: null },
        select: { id: true, codigo: true, titulo: true, clienteId: true, status: true },
      });
      if (!projeto) throw new ErroNegocio("Projeto não encontrado.");

      // Relê o estado no banco (não o que a tela mostrava): outra pessoa pode ter movido antes.
      const movimento = avaliarMovimento(projeto.status, dados.para);
      if (!movimento.ok) throw new ErroNegocio(movimento.motivo);
      if (movimento.exigeMotivo && !dados.motivoPerdaId) throw new ErroNegocio("Informe o motivo da perda.", { motivoPerdaId: "Escolha o motivo." });

      await mudarFaseDoProjeto(tx, {
        usuario: sessao,
        projeto,
        para: dados.para,
        perda: movimento.exigeMotivo ? { motivoPerdaId: dados.motivoPerdaId!, detalhe: dados.motivoPerdaDetalhe, concorrente: dados.concorrente } : undefined,
        ip,
      });
      return projeto.clienteId;
    });
    revalidatePath("/funil");
    revalidatePath("/projetos");
    revalidatePath(`/projetos/${dados.id}`);
    revalidatePath(`/clientes/${clienteId}`);
    revalidatePath("/", "layout");
    return sucesso({ status: dados.para }, `Projeto movido para "${ROTULO_STATUS_PROJETO[dados.para]}".`);
  });
}
