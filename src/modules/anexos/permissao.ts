import { can, type UsuarioParaPermissao } from "@/lib/permissoes";
import type { EntidadeComAnexo } from "@/lib/storage/regras";

/**
 * Permissão de anexo = a do módulo da ENTIDADE DONA do arquivo (Fase 7C, camada 4), nunca "qualquer anexo de qualquer um":
 * o comprovante de um lançamento é do Financeiro, a foto de uma visita é da Agenda, e assim por diante.
 * O tipo `Record<EntidadeComAnexo, ...>` obriga a declarar a regra de toda entidade nova que aceitar anexo.
 */
type RegraDoAnexo = {
  /** Basta poder (no nível da operação) em UM destes recursos. */
  algum: readonly string[];
  /** Entidade cujo arquivo é financeiro ou comercial: exige também "ver valores". */
  valores?: boolean;
};

export const REGRA_DO_ANEXO: Record<EntidadeComAnexo, RegraDoAnexo> = {
  ConfiguracaoEmpresa: { algum: ["configuracao"] },
  Tarefa: { algum: ["tarefa"] },
  Cliente: { algum: ["cliente"] },
  Fornecedor: { algum: ["fornecedor"] },
  Produto: { algum: ["produto"] },
  Funcionario: { algum: ["funcionario"] },
  // Fotos de obra (Obras) e documentos do projeto (Comercial) ficam na mesma entidade.
  Projeto: { algum: ["obra", "projeto"] },
  EventoAgenda: { algum: ["evento"] },
  MedidaRascunho: { algum: ["medidaRascunho"] },
  Proposta: { algum: ["proposta"], valores: true },
  Chamado: { algum: ["chamado"] },
  Lancamento: { algum: ["lancamento"], valores: true },
};

export type OperacaoDeAnexo = "ver" | "criar" | "excluir";

/** Pode esta pessoa fazer esta operação com anexos desta entidade? Entidade desconhecida = não (falha fechada). */
export function podeNoAnexo(usuario: UsuarioParaPermissao, operacao: OperacaoDeAnexo, entidadeTipo: string): boolean {
  const regra = (REGRA_DO_ANEXO as Record<string, RegraDoAnexo | undefined>)[entidadeTipo];
  if (!regra) return false;
  if (regra.valores && !can(usuario, "ver", "valores")) return false;
  return regra.algum.some((recurso) => can(usuario, operacao, recurso));
}
