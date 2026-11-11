"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { ErroNegocio, executar, falha, falhaDeValidacao, formDataParaObjeto, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { podeMudarSituacao, vinculoExigido } from "@/lib/dominio/agenda";
import { faseAposAgendarVisita, faseSugeridaAposVisitaRealizada, type StatusProjeto } from "@/lib/dominio/funil";
import { formatarDataHora, inputDataHoraParaInstante } from "@/lib/formatadores";
import { can } from "@/lib/permissoes";
import { resumoDoEndereco } from "@/modules/clientes/schemas";
import { registrarInteracao } from "@/modules/interacoes/registrar";
import { mudarFaseDoProjeto } from "@/modules/projetos/servico";

import { avisosDoEvento } from "../servico";
import { eventoEditadoSchema, eventoSchema, idUnicoSchema, mudarStatusSchema, ROTULO_STATUS_EVENTO, ROTULO_TIPO_EVENTO } from "../schemas";

const campos = {
  id: true,
  tipo: true,
  titulo: true,
  inicio: true,
  fim: true,
  status: true,
  responsavelId: true,
  equipeId: true,
  clienteId: true,
  projetoId: true,
  enderecoId: true,
  local: true,
  lembreteMin: true,
  observacoes: true,
} as const;

function revalidar(projetoId?: string | null, id?: string) {
  revalidatePath("/agenda");
  if (id) revalidatePath(`/agenda/${id}`);
  if (projetoId) {
    revalidatePath(`/projetos/${projetoId}`);
    revalidatePath("/funil");
  }
  revalidatePath("/", "layout");
}

type DadosDoEvento = ReturnType<typeof eventoSchema.parse>;

/** Confere tudo que veio do navegador (nunca confiar em IDs) e monta o que será gravado. */
async function resolver(dados: DadosDoEvento) {
  const inicio = inputDataHoraParaInstante(dados.inicio);
  if (!inicio) throw new ErroNegocio("Data ou hora inválida.", { inicio: "Informe uma data e hora válidas." });
  const fim = new Date(inicio.getTime() + dados.duracaoMin * 60_000);

  const projeto = dados.projetoId
    ? await prisma.projeto.findFirst({ where: { id: dados.projetoId, deletadoEm: null }, select: { id: true, codigo: true, titulo: true, status: true, clienteId: true, enderecoObraId: true } })
    : null;
  if (dados.projetoId && !projeto) throw new ErroNegocio("O projeto escolhido não foi encontrado.", { projetoId: "Escolha um projeto da lista." });
  if (projeto && dados.clienteId && dados.clienteId !== projeto.clienteId) throw new ErroNegocio("Esse projeto pertence a outro cliente.", { projetoId: "Escolha um projeto do cliente." });

  const clienteId = projeto?.clienteId ?? dados.clienteId ?? null;
  if (clienteId && !projeto) {
    const existe = await prisma.cliente.findFirst({ where: { id: clienteId, deletadoEm: null }, select: { id: true } });
    if (!existe) throw new ErroNegocio("O cliente escolhido não foi encontrado.", { clienteId: "Escolha um cliente da lista." });
  }

  const exigido = vinculoExigido(dados.tipo);
  if (exigido === "projeto" && !projeto) throw new ErroNegocio(`${ROTULO_TIPO_EVENTO[dados.tipo]} precisa estar ligada a um projeto.`, { projetoId: "Escolha o projeto." });
  if (exigido === "cliente_ou_projeto" && !clienteId) throw new ErroNegocio("Escolha o cliente ou o projeto.", { projetoId: "Escolha o projeto ou o cliente." });

  if (dados.responsavelId) {
    const usuario = await prisma.usuario.findFirst({ where: { id: dados.responsavelId, ativo: true, deletadoEm: null }, select: { id: true } });
    if (!usuario) throw new ErroNegocio("O responsável escolhido não está disponível.", { responsavelId: "Escolha um usuário ativo." });
  }
  if (dados.equipeId) {
    const equipe = await prisma.equipe.findFirst({ where: { id: dados.equipeId, ativo: true, deletadoEm: null }, select: { id: true } });
    if (!equipe) throw new ErroNegocio("A equipe escolhida não está disponível.", { equipeId: "Escolha uma equipe ativa." });
  }

  let local = dados.local ?? null;
  if (dados.enderecoId) {
    const endereco = await prisma.enderecoCliente.findFirst({
      where: { id: dados.enderecoId, clienteId: clienteId ?? "sem-cliente", deletadoEm: null },
      select: { id: true, logradouro: true, numero: true, bairro: true, cidade: true, uf: true },
    });
    if (!endereco) throw new ErroNegocio("O endereço não pertence a esse cliente.", { enderecoId: "Escolha um endereço do cliente." });
    local ??= resumoDoEndereco(endereco) || null;
  }

  return { inicio, fim, projeto, clienteId, local };
}

/** Avisos (conflito, feriado, fora do expediente) pedem confirmação, como o aviso de cliente duplicado. */
async function exigirConfirmacaoDeAvisos(dados: DadosDoEvento, inicio: Date, fim: Date, id?: string) {
  if (dados.confirmarAvisos === "1") return;
  const avisos = await avisosDoEvento({ inicio, fim, id, responsavelId: dados.responsavelId, equipeId: dados.equipeId });
  if (avisos.length > 0) {
    throw new ErroNegocio("Confira os avisos abaixo. Se estiver tudo certo, confirme para agendar assim mesmo.", { _avisos: avisos.join("\n") });
  }
}

export async function criarEvento(_anterior: ResultadoAcao<{ id: string }> | null, formData: FormData): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "evento")) return falha("Sem permissão.");

  const lido = eventoSchema.safeParse(formDataParaObjeto(formData));
  if (!lido.success) return falhaDeValidacao(lido.error);
  const dados = lido.data;

  return executar("agenda.criar", async () => {
    const { inicio, fim, projeto, clienteId, local } = await resolver(dados);
    await exigirConfirmacaoDeAvisos(dados, inicio, fim);
    const ip = extrairIp(await headers());

    const criado = await prisma.$transaction(async (tx) => {
      const novo = await tx.eventoAgenda.create({
        data: {
          tipo: dados.tipo,
          titulo: dados.titulo ?? null,
          inicio,
          fim,
          responsavelId: dados.responsavelId ?? null,
          equipeId: dados.equipeId ?? null,
          clienteId,
          projetoId: projeto?.id ?? null,
          enderecoId: dados.enderecoId ?? null,
          local,
          lembreteMin: dados.lembreteMin ?? null,
          observacoes: dados.observacoes ?? null,
          criadoPorId: sessao.id,
          atualizadoPorId: sessao.id,
        },
        select: campos,
      });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "EventoAgenda", entidadeId: novo.id, acao: "CRIAR", depois: novo, ip });

      if (projeto) {
        await registrarInteracao(tx, {
          tipo: "SISTEMA",
          texto: `${ROTULO_TIPO_EVENTO[dados.tipo]} agendada para ${formatarDataHora(inicio)}.`,
          clienteId: projeto.clienteId,
          projetoId: projeto.id,
          usuarioId: sessao.id,
        });
        // Agendar a visita tira o projeto de "Novo contato" (as demais fases só mudam por decisão da pessoa).
        const proxima = dados.tipo === "VISITA_TECNICA" ? faseAposAgendarVisita(projeto.status) : null;
        if (proxima) await mudarFaseDoProjeto(tx, { usuario: sessao, projeto, para: proxima, ip });
      }
      return novo;
    });
    revalidar(projeto?.id);
    return sucesso({ id: criado.id }, `${ROTULO_TIPO_EVENTO[dados.tipo]} agendada.`);
  });
}

export async function editarEvento(_anterior: ResultadoAcao<{ id: string }> | null, formData: FormData): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "evento")) return falha("Sem permissão.");

  const lido = eventoEditadoSchema.safeParse(formDataParaObjeto(formData));
  if (!lido.success) return falhaDeValidacao(lido.error);
  const { id, ...dadosDoFormulario } = lido.data;

  return executar("agenda.editar", async () => {
    // O "Local" vem preenchido pelo endereço anterior: se a pessoa só trocou o endereço, o local acompanha a troca.
    const anterior = await prisma.eventoAgenda.findFirst({ where: { id, deletadoEm: null }, select: { local: true, enderecoId: true } });
    const localAutomatico = !!anterior && dadosDoFormulario.local === (anterior.local ?? undefined) && dadosDoFormulario.enderecoId !== (anterior.enderecoId ?? undefined);
    const dados = localAutomatico ? { ...dadosDoFormulario, local: undefined } : dadosDoFormulario;
    const { inicio, fim, projeto, clienteId, local } = await resolver(dados);
    await exigirConfirmacaoDeAvisos(dados, inicio, fim, id);
    const ip = extrairIp(await headers());

    await prisma.$transaction(async (tx) => {
      const antes = await tx.eventoAgenda.findFirst({ where: { id, deletadoEm: null }, select: campos });
      if (!antes) throw new ErroNegocio("Compromisso não encontrado.");

      // Mudar o horário de um compromisso em aberto é remarcar: a situação reflete isso e a linha do tempo registra.
      const remarcou = antes.inicio.getTime() !== inicio.getTime() && (antes.status === "AGENDADO" || antes.status === "CONFIRMADO" || antes.status === "REMARCADO");
      const depois = await tx.eventoAgenda.update({
        where: { id },
        data: {
          tipo: dados.tipo,
          titulo: dados.titulo ?? null,
          inicio,
          fim,
          responsavelId: dados.responsavelId ?? null,
          equipeId: dados.equipeId ?? null,
          clienteId,
          projetoId: projeto?.id ?? null,
          enderecoId: dados.enderecoId ?? null,
          local,
          lembreteMin: dados.lembreteMin ?? null,
          observacoes: dados.observacoes ?? null,
          ...(remarcou ? { status: "REMARCADO" as const } : {}),
          atualizadoPorId: sessao.id,
        },
        select: campos,
      });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "EventoAgenda", entidadeId: id, acao: "ATUALIZAR", antes, depois, ip });
      if (remarcou && projeto) {
        await registrarInteracao(tx, {
          tipo: "SISTEMA",
          texto: `${ROTULO_TIPO_EVENTO[dados.tipo]} remarcada de ${formatarDataHora(antes.inicio)} para ${formatarDataHora(inicio)}.`,
          clienteId: projeto.clienteId,
          projetoId: projeto.id,
          usuarioId: sessao.id,
        });
      }
    });
    revalidar(projeto?.id, id);
    return sucesso({ id }, "Compromisso atualizado.");
  });
}

export type ResultadoDeSituacao = { projetoId: string | null; /** Fase que o sistema sugere (nunca aplica sozinho). */ sugestaoDeFase: StatusProjeto | null };

/** Confirmar, marcar como realizado, cancelar ou "não compareceu". */
export async function mudarSituacaoDoEvento(entrada: unknown): Promise<ResultadoAcao<ResultadoDeSituacao>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "evento")) return falha("Sem permissão.");

  const lido = mudarStatusSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  const { id, status } = lido.data;

  return executar("agenda.situacao", async () => {
    const ip = extrairIp(await headers());
    const resultado = await prisma.$transaction(async (tx) => {
      const antes = await tx.eventoAgenda.findFirst({ where: { id, deletadoEm: null }, select: { ...campos, projeto: { select: { id: true, status: true, clienteId: true } } } });
      if (!antes) throw new ErroNegocio("Compromisso não encontrado.");
      if (!podeMudarSituacao(antes.status, status)) {
        throw new ErroNegocio(`Este compromisso está ${ROTULO_STATUS_EVENTO[antes.status].toLowerCase()} e não muda mais de situação. Para refazer, agende de novo.`);
      }
      const agora = new Date();
      await tx.eventoAgenda.update({ where: { id }, data: { status, realizadoEm: status === "REALIZADO" ? agora : null, atualizadoPorId: sessao.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "EventoAgenda", entidadeId: id, acao: "ATUALIZAR", antes: { status: antes.status }, depois: { status }, ip });
      if (antes.projeto) {
        await registrarInteracao(tx, {
          tipo: "SISTEMA",
          texto: `${ROTULO_TIPO_EVENTO[antes.tipo]} de ${formatarDataHora(antes.inicio)}: ${ROTULO_STATUS_EVENTO[status].toLowerCase()}.`,
          clienteId: antes.projeto.clienteId,
          projetoId: antes.projeto.id,
          usuarioId: sessao.id,
        });
      }
      const sugestaoDeFase = status === "REALIZADO" && antes.tipo === "VISITA_TECNICA" && antes.projeto ? faseSugeridaAposVisitaRealizada(antes.projeto.status) : null;
      return { projetoId: antes.projeto?.id ?? null, sugestaoDeFase };
    });
    revalidar(resultado.projetoId, id);
    return sucesso(resultado, `Compromisso marcado como ${ROTULO_STATUS_EVENTO[status].toLowerCase()}.`);
  });
}

/** Exclusão lógica: para compromisso criado por engano (para um que não aconteceu, prefira cancelar). */
export async function excluirEvento(idBruto: string): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "evento")) return falha("Sem permissão.");
  const id = idUnicoSchema.safeParse(idBruto);
  if (!id.success) return falha("Compromisso inválido.");

  return executar("agenda.excluir", async () => {
    const ip = extrairIp(await headers());
    const projetoId = await prisma.$transaction(async (tx) => {
      const antes = await tx.eventoAgenda.findFirst({ where: { id: id.data, deletadoEm: null }, select: campos });
      if (!antes) throw new ErroNegocio("Compromisso não encontrado.");
      await tx.eventoAgenda.update({ where: { id: id.data }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "EventoAgenda", entidadeId: id.data, acao: "EXCLUIR", antes, ip });
      return antes.projetoId;
    });
    revalidar(projetoId);
    return sucesso(undefined, "Compromisso excluído.");
  });
}
