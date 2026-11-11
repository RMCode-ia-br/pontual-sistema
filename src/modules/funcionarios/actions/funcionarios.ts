"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { ErroNegocio, executar, falha, falhaDeValidacao, formDataParaObjeto, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissoes";

import { buscarFuncionarioPorCpf } from "../queries";
import { editarFuncionarioSchema, funcionarioSchema, idsSchema } from "../schemas";

const campos = {
  id: true,
  nome: true,
  cpf: true,
  telefone: true,
  email: true,
  cargo: true,
  funcao: true,
  admissaoEm: true,
  demissaoEm: true,
  salarioBaseCentavos: true,
  custoHoraCentavos: true,
  usuarioId: true,
  observacoes: true,
  ativo: true,
} as const;

const MENSAGEM_VINCULO = "Esse usuário já está vinculado a outro funcionário.";

function revalidar(id?: string) {
  revalidatePath("/funcionarios");
  if (id) revalidatePath(`/funcionarios/${id}`);
  revalidatePath("/funcionarios/equipes");
  revalidatePath("/", "layout");
}

/** O usuário vinculado precisa existir, estar ativo e não pertencer a outro funcionário. */
async function conferirUsuario(usuarioId: string | undefined, funcionarioId?: string) {
  if (!usuarioId) return;
  const usuario = await prisma.usuario.findFirst({
    where: { id: usuarioId, ativo: true, deletadoEm: null },
    select: { id: true, funcionario: { select: { id: true, deletadoEm: true } } },
  });
  if (!usuario) throw new ErroNegocio("O usuário escolhido não está disponível.", { usuarioId: "Escolha um usuário ativo." });
  if (usuario.funcionario && usuario.funcionario.id !== funcionarioId) {
    const aviso = usuario.funcionario.deletadoEm ? "Esse usuário ainda está vinculado a um funcionário que está na lixeira. Restaure-o (e tire o vínculo) antes de usar este usuário." : MENSAGEM_VINCULO;
    throw new ErroNegocio(aviso, { usuarioId: aviso });
  }
}

async function conferirCpf(cpf: string | undefined, exceto?: string) {
  if (!cpf) return;
  const outro = await buscarFuncionarioPorCpf(cpf, exceto);
  if (outro) throw new ErroNegocio(`Já existe um funcionário com esse CPF: ${outro.nome}.`, { cpf: `Já cadastrado em ${outro.nome}.` });
}

type Valores = NonNullable<ReturnType<typeof funcionarioSchema.safeParse>["data"]>;

/** Do formulário (salário em reais) para o banco (centavos). */
function paraBanco(v: Valores) {
  return {
    nome: v.nome,
    cpf: v.cpf ?? null,
    telefone: v.telefone ?? null,
    email: v.email ?? null,
    cargo: v.cargo ?? null,
    funcao: v.funcao,
    admissaoEm: v.admissaoEm ?? null,
    demissaoEm: v.demissaoEm ?? null,
    salarioBaseCentavos: v.salarioBase ?? null,
    custoHoraCentavos: v.custoHora ?? null,
    usuarioId: v.usuarioId ?? null,
    observacoes: v.observacoes ?? null,
  };
}

export async function criarFuncionario(_anterior: ResultadoAcao<{ id: string }> | null, formData: FormData): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "funcionario")) return falha("Sem permissão.");

  const dados = funcionarioSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);

  return executar(
    "funcionarios.criar",
    async () => {
      await conferirUsuario(dados.data.usuarioId);
      await conferirCpf(dados.data.cpf);
      const ip = extrairIp(await headers());
      const criado = await prisma.$transaction(async (tx) => {
        const novo = await tx.funcionario.create({ data: { ...paraBanco(dados.data), criadoPorId: sessao.id, atualizadoPorId: sessao.id }, select: campos });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "Funcionario", entidadeId: novo.id, acao: "CRIAR", depois: novo, ip });
        return novo;
      });
      revalidar();
      return sucesso({ id: criado.id }, "Funcionário cadastrado.");
    },
    MENSAGEM_VINCULO,
  );
}

export async function editarFuncionario(_anterior: ResultadoAcao<{ id: string }> | null, formData: FormData): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "funcionario")) return falha("Sem permissão.");

  const dados = editarFuncionarioSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  const { id } = dados.data;

  return executar(
    "funcionarios.editar",
    async () => {
      await conferirUsuario(dados.data.usuarioId, id);
      await conferirCpf(dados.data.cpf, id);
      const ip = extrairIp(await headers());
      await prisma.$transaction(async (tx) => {
        const antes = await tx.funcionario.findFirst({ where: { id, deletadoEm: null }, select: campos });
        if (!antes) throw new ErroNegocio("Funcionário não encontrado.");
        const depois = await tx.funcionario.update({ where: { id }, data: { ...paraBanco(dados.data), atualizadoPorId: sessao.id }, select: campos });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "Funcionario", entidadeId: id, acao: "ATUALIZAR", antes, depois, ip });
      });
      revalidar(id);
      return sucesso({ id }, "Funcionário atualizado.");
    },
    MENSAGEM_VINCULO,
  );
}

async function mudarSituacao(idsBrutos: string[], ativo: boolean): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "funcionario")) return falha("Sem permissão.");
  const ids = idsSchema.safeParse(idsBrutos);
  if (!ids.success) return falha(ids.error.issues[0]?.message ?? "Seleção inválida.");

  return executar("funcionarios.situacao", async () => {
    const ip = extrairIp(await headers());
    const alterados = await prisma.$transaction(async (tx) => {
      const alvos = await tx.funcionario.findMany({ where: { id: { in: ids.data }, deletadoEm: null, ativo: !ativo }, select: { id: true, ativo: true } });
      for (const antes of alvos) {
        await tx.funcionario.update({ where: { id: antes.id }, data: { ativo, atualizadoPorId: sessao.id } });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "Funcionario", entidadeId: antes.id, acao: ativo ? "REATIVAR" : "INATIVAR", antes: { ativo: antes.ativo }, depois: { ativo }, ip });
      }
      return alvos.length;
    });
    revalidar();
    if (alterados === 0) return sucesso(undefined, "Nada a alterar.");
    return sucesso(undefined, `${alterados} ${alterados === 1 ? "funcionário" : "funcionários"} ${ativo ? "reativado" : "inativado"}${alterados === 1 ? "" : "s"}.`);
  });
}

export async function inativarFuncionarios(ids: string[]): Promise<ResultadoAcao> {
  return mudarSituacao(ids, false);
}

export async function reativarFuncionarios(ids: string[]): Promise<ResultadoAcao> {
  return mudarSituacao(ids, true);
}

/** Exclusão lógica (lixeira). Sai também das equipes (a participação é preservada para a restauração). */
export async function excluirFuncionarios(idsBrutos: string[]): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "funcionario")) return falha("Sem permissão.");
  const ids = idsSchema.safeParse(idsBrutos);
  if (!ids.success) return falha(ids.error.issues[0]?.message ?? "Seleção inválida.");

  return executar("funcionarios.excluir", async () => {
    const ip = extrairIp(await headers());
    const removidos = await prisma.$transaction(async (tx) => {
      const alvos = await tx.funcionario.findMany({ where: { id: { in: ids.data }, deletadoEm: null }, select: campos });
      for (const antes of alvos) {
        await tx.funcionario.update({ where: { id: antes.id }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "Funcionario", entidadeId: antes.id, acao: "EXCLUIR", antes, ip });
      }
      return alvos.length;
    });
    revalidar();
    if (removidos === 0) return sucesso(undefined, "Nada a remover.");
    return sucesso(undefined, `${removidos} ${removidos === 1 ? "funcionário enviado" : "funcionários enviados"} para a lixeira.`);
  });
}
