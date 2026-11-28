import { decidir, podeVerModulo, type Modulo, type PermissoesEfetivas, type Transversal } from "@/lib/dominio/permissoes";

/**
 * Quem abre cada relatório (Fase 7C): o módulo Relatórios, o módulo de ORIGEM dos dados e, se o relatório mostra dinheiro,
 * "ver valores" (custo e margem, "ver custo e margem"). O índice `/relatorios` mostra só o que a pessoa abre; um teste
 * confere esta tabela contra o `exigirModulo` de cada página, então os dois nunca discordam.
 */
export type AcessoDeRota = { modulos: readonly Modulo[]; exige: readonly Transversal[] };

export const ACESSO_DOS_RELATORIOS: Readonly<Record<string, AcessoDeRota>> = {
  "/relatorios/vendas": { modulos: ["RELATORIOS", "COMERCIAL"], exige: ["valores"] },
  "/relatorios/fechamento": { modulos: ["RELATORIOS", "COMERCIAL"], exige: ["valores"] },
  "/relatorios/funil": { modulos: ["RELATORIOS", "COMERCIAL"], exige: ["valores"] },
  "/relatorios/clientes": { modulos: ["RELATORIOS", "CLIENTES"], exige: ["valores"] },
  "/relatorios/produtos-e-precos": { modulos: ["RELATORIOS", "CADASTROS"], exige: ["valores"] },
  "/relatorios/producao": { modulos: ["RELATORIOS", "OBRAS"], exige: [] },
  "/relatorios/avaliacoes": { modulos: ["RELATORIOS", "OBRAS"], exige: [] },
  "/relatorios/obras": { modulos: ["RELATORIOS", "OBRAS"], exige: ["valores"] },
  "/relatorios/faturamento": { modulos: ["RELATORIOS", "FINANCEIRO"], exige: ["valores"] },
  "/relatorios/financeiro/receber": { modulos: ["RELATORIOS", "FINANCEIRO"], exige: ["valores"] },
  "/relatorios/financeiro/pagar": { modulos: ["RELATORIOS", "FINANCEIRO"], exige: ["valores"] },
  "/relatorios/margem-obras": { modulos: ["RELATORIOS", "OBRAS"], exige: ["custo"] },
  "/relatorios/estoque": { modulos: ["RELATORIOS", "ESTOQUE"], exige: [] },
  // Listas do Financeiro que o índice também aponta (a página exige o módulo e valores).
  "/financeiro": { modulos: ["FINANCEIRO"], exige: ["valores"] },
  "/financeiro/recebimentos": { modulos: ["FINANCEIRO"], exige: ["valores"] },
  "/financeiro/dre": { modulos: ["FINANCEIRO"], exige: ["valores"] },
};

/** A pessoa abre esta rota? Rota fora da tabela = não (falha fechada). */
export function rotaLiberada(p: PermissoesEfetivas, href: string): boolean {
  const regra = ACESSO_DOS_RELATORIOS[href];
  if (!regra) return false;
  return regra.modulos.every((m) => podeVerModulo(p, m)) && regra.exige.every((t) => (t === "valores" ? decidir(p, "ver", "valores") : decidir(p, "ver", "custo")));
}
