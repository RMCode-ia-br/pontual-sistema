import { z } from "zod";

import {
  campoCaixa,
  campoCpf,
  campoDataOpcional,
  campoEmail,
  campoIdObrigatorio,
  campoIdOpcional,
  campoMoedaOpcional,
  campoTelefone,
  campoTexto,
  campoTextoOpcional,
} from "@/lib/validadores/campos";

export const FUNCOES = ["VENDAS", "PROJETO", "FABRICA", "INSTALACAO", "ADMINISTRATIVO", "GESTAO"] as const;

export const ROTULO_FUNCAO: Record<(typeof FUNCOES)[number], string> = {
  VENDAS: "Vendas",
  PROJETO: "Projeto",
  FABRICA: "Fábrica",
  INSTALACAO: "Instalação",
  ADMINISTRATIVO: "Administrativo",
  GESTAO: "Gestão",
};

const funcionarioBase = z.object({
  nome: campoTexto("o nome", 160),
  cpf: campoCpf("CPF"),
  telefone: campoTelefone("Telefone"),
  email: campoEmail(),
  cargo: campoTextoOpcional(80),
  funcao: z.enum(FUNCOES, { message: "Escolha a função da pessoa na empresa." }),
  admissaoEm: campoDataOpcional("Admissão"),
  demissaoEm: campoDataOpcional("Demissão"),
  /** Digitado em reais ("2.500,00") e guardado em centavos (campos salarioBaseCentavos / custoHoraCentavos). */
  salarioBase: campoMoedaOpcional("Salário base"),
  custoHora: campoMoedaOpcional("Custo por hora"),
  usuarioId: campoIdOpcional,
  observacoes: campoTextoOpcional(4000),
});

type DatasDoFuncionario = { admissaoEm?: unknown; demissaoEm?: unknown };

/** Só compara quando as duas datas chegaram válidas (um campo com erro não impede os outros avisos). */
const demissaoDepoisDaAdmissao = (v: DatasDoFuncionario) =>
  !(v.admissaoEm instanceof Date) || !(v.demissaoEm instanceof Date) || v.demissaoEm.getTime() >= v.admissaoEm.getTime();

/**
 * `when` sempre verdadeiro: por padrão o Zod nem roda a regra se outro campo já deu erro, e a pessoa só
 * descobriria o aviso das datas depois de corrigir o CPF. Assim os erros aparecem todos de uma vez.
 */
const avisoDatas = { path: ["demissaoEm"], message: "A demissão não pode ser antes da admissão.", when: () => true };

export const funcionarioSchema = funcionarioBase.refine(demissaoDepoisDaAdmissao, avisoDatas);
export const editarFuncionarioSchema = funcionarioBase.extend({ id: campoIdObrigatorio("Funcionário inválido.") }).refine(demissaoDepoisDaAdmissao, avisoDatas);

export const idsSchema = z.array(campoIdObrigatorio()).min(1, "Escolha ao menos um funcionário.").max(200, "Escolha no máximo 200 de uma vez.");

// ----- Equipes -----

const equipeBase = z.object({
  nome: campoTexto("o nome da equipe", 80),
  descricao: campoTextoOpcional(300),
  ativo: campoCaixa,
});

export const equipeSchema = equipeBase;
export const editarEquipeSchema = equipeBase.extend({ id: campoIdObrigatorio("Equipe inválida.") });

export const membroSchema = z.object({
  equipeId: campoIdObrigatorio("Equipe inválida."),
  funcionarioId: campoIdObrigatorio("Escolha uma pessoa da lista."),
  lider: campoCaixa,
});
