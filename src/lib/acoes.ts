import { z } from "zod";

import { Prisma } from "../generated/prisma/client";

/** Resultado padrão das Server Actions: nunca lança erro para a interface. */
export type ResultadoAcao<T = undefined> =
  | { ok: true; dados?: T; mensagem?: string }
  | { ok: false; erro: string; campos?: Record<string, string> };

export function sucesso<T = undefined>(dados?: T, mensagem?: string): ResultadoAcao<T> {
  return { ok: true, dados, mensagem };
}

export function falha(erro: string, campos?: Record<string, string>): ResultadoAcao<never> {
  return { ok: false, erro, campos };
}

/** Converte erros do Zod em mensagem + mapa campo → mensagem (para validação inline). */
export function falhaDeValidacao(erro: z.ZodError): ResultadoAcao<never> {
  const campos: Record<string, string> = {};
  for (const problema of erro.issues) {
    const chave = problema.path.join(".") || "_";
    campos[chave] ??= problema.message;
  }
  return falha(erro.issues[0]?.message ?? "Dados inválidos.", campos);
}

/** Erro de regra de negócio com mensagem segura para mostrar ao usuário. */
export class ErroNegocio extends Error {
  constructor(
    mensagem: string,
    readonly campos?: Record<string, string>,
  ) {
    super(mensagem);
    this.name = "ErroNegocio";
  }
}

/**
 * Executa uma ação convertendo qualquer exceção em resultado seguro.
 * - ErroNegocio: mostra a mensagem.
 * - Violação de unicidade do banco (P2002): mensagem amigável.
 * - Demais: log estruturado só com o tipo (sem stack nem dados) e mensagem genérica.
 * Erros de redirecionamento do Next (redirect/notFound) são repassados.
 */
export async function executar<T>(
  acao: string,
  fn: () => Promise<ResultadoAcao<T>>,
  mensagemUnicidade = "Já existe um registro com esse valor.",
): Promise<ResultadoAcao<T>> {
  try {
    return await fn();
  } catch (erro) {
    if (erro instanceof ErroNegocio) return falha(erro.message, erro.campos);
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      return falha(mensagemUnicidade);
    }
    if (ehRedirecionamentoDoNext(erro)) throw erro;
    console.error(JSON.stringify({ evento: "acao.erro", acao, tipo: erro instanceof Error ? erro.name : "Erro" }));
    return falha("Não foi possível concluir a operação. Tente novamente.");
  }
}

function ehRedirecionamentoDoNext(erro: unknown): boolean {
  const digest = (erro as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"));
}

/** Texto de formulário: tira espaços e transforma vazio em undefined. */
export const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

/** Converte FormData em objeto simples (strings), ignorando campos internos do Next ($ACTION_...). */
export function formDataParaObjeto(formData: FormData): Record<string, string> {
  const objeto: Record<string, string> = {};
  for (const [chave, valor] of formData.entries()) {
    if (typeof valor === "string" && !chave.startsWith("$ACTION")) objeto[chave] = valor;
  }
  return objeto;
}
