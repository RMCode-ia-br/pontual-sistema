import { podeVerModulo, type PermissoesEfetivas } from "@/lib/dominio/permissoes";

/**
 * Quais blocos do painel a pessoa vê (Fase 7C): o número só aparece se ela abre a lista que está por trás dele, ou seja,
 * o módulo de origem (e Relatórios, quando o número leva a um relatório) mais "ver valores" quando é dinheiro.
 */
export type BlocosDoPainel = {
  agenda: boolean;
  obras: boolean;
  clientes: boolean;
  estoque: boolean;
  /** Funil, propostas e projetos (mostram valores). */
  comercial: boolean;
  /** Vendido e "Vendas e propostas" (levam a relatórios de vendas). */
  vendas: boolean;
  financeiro: boolean;
  relObras: boolean;
  relEstoque: boolean;
  /** Custo dos produtos e perfis. */
  custo: boolean;
};

export function blocosDoPainel(p: PermissoesEfetivas): BlocosDoPainel {
  const ver = (m: Parameters<typeof podeVerModulo>[1]) => podeVerModulo(p, m);
  return {
    agenda: ver("AGENDA"),
    obras: ver("OBRAS"),
    clientes: ver("CLIENTES"),
    estoque: ver("ESTOQUE"),
    comercial: ver("COMERCIAL") && p.verValores,
    vendas: ver("COMERCIAL") && ver("RELATORIOS") && p.verValores,
    financeiro: ver("FINANCEIRO") && p.verValores,
    relObras: ver("OBRAS") && ver("RELATORIOS"),
    relEstoque: ver("ESTOQUE") && ver("RELATORIOS"),
    custo: p.verCustoMargem,
  };
}
