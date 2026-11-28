import { NextResponse } from "next/server";

import { can, type UsuarioParaPermissao } from "@/lib/permissoes";

/**
 * Acesso a exportações e documentos (CSV, PDF, .ics, ZIP): UMA função decide, para toda rota de saída (Fase 7C, camada 4).
 * Rota nova que gera arquivo precisa chamar `saidaNegada` logo depois de checar a sessão (um teste varre as rotas).
 */
export type ExigenciaDeSaida = {
  /** Recursos que a pessoa precisa poder VER (todos). Nomes do mapeamento em `src/lib/dominio/permissoes.ts`. */
  recursos?: readonly string[];
  /** Precisa poder ALTERAR todos estes (ex.: o CSV de clientes traz CPF/CNPJ e e-mail, dados de quem edita Clientes, não de quem só consulta). */
  editar?: readonly string[];
  /** Basta ver UM destes (ex.: a folha de produção serve a Obras e a Comercial). */
  algum?: readonly string[];
  /** A saída traz valores (dinheiro): exige "ver valores". */
  valores?: boolean;
  /** A saída traz custo ou margem: exige "ver custo e margem". */
  custo?: boolean;
};

/** Devolve a resposta 403 quando a pessoa não pode receber a saída; `null` quando pode. */
export function saidaNegada(usuario: UsuarioParaPermissao, e: ExigenciaDeSaida): NextResponse | null {
  const ok =
    (e.recursos ?? []).every((r) => can(usuario, "ver", r)) &&
    (e.editar ?? []).every((r) => can(usuario, "editar", r)) &&
    (!e.algum || e.algum.some((r) => can(usuario, "ver", r))) &&
    (!e.valores || can(usuario, "ver", "valores")) &&
    (!e.custo || can(usuario, "ver", "custo"));
  return ok ? null : NextResponse.json({ erro: "Sem permissão para esta exportação." }, { status: 403, headers: { "Cache-Control": "no-store" } });
}

/** Opções de `csvDoRelatorio` para este usuário (colunas de dinheiro e de custo só saem com a permissão). */
export function acessoDoCsv(usuario: UsuarioParaPermissao): { podeVerInterno: boolean; podeVerValores: boolean } {
  return { podeVerInterno: can(usuario, "ver", "custo"), podeVerValores: can(usuario, "ver", "valores") };
}

/**
 * CSV montado à mão (cabeçalho + linhas): tira as colunas de índice dado quando a pessoa não pode vê-las.
 * Linha de aviso (uma só célula, ex.: "AVISO: exportação limitada...") passa intacta.
 */
export function semColunas(cabecalho: readonly string[], linhas: readonly unknown[][], remover: readonly number[]): { cabecalho: string[]; linhas: unknown[][] } {
  const fora = new Set(remover);
  const filtrar = <T,>(l: readonly T[]) => l.filter((_, i) => !fora.has(i));
  return {
    cabecalho: filtrar(cabecalho),
    linhas: linhas.map((l) => (l.length === cabecalho.length ? filtrar(l) : [...l])),
  };
}
