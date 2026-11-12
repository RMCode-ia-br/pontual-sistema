import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import type { UsuarioSessao } from "@/lib/auth/sessao";
import { MAXIMO_CENTAVOS } from "@/lib/dominio/preco";

type Tx = Prisma.TransactionClient;

export type EntradaDeCustoDeMaterial = {
  propostaId: string;
  opcaoId: string;
  /** Total da opção (do programa de corte do fornecedor); null = não informado. */
  totalCentavos: number | null;
  /** Custo de cada item (só os que a pessoa quer registrar); null = apagar. */
  itens: { itemId: string; custoCentavos: number | null }[];
};

const valido = (c: number | null) => c === null || (Number.isInteger(c) && c > 0 && c <= MAXIMO_CENTAVOS);

/**
 * Registra o custo de MATERIAL informado à mão (vindo do programa de corte do fornecedor) numa opção da proposta, no total
 * e/ou por item. É dado INTERNO: serve só à margem estimada e NUNCA entra no snapshot, no PDF nem na folha de produção.
 * Pode ser informado ou corrigido em qualquer status (não é conteúdo da proposta), sem criar revisão. Auditado.
 */
export async function informarCustoDeMaterial(tx: Tx, e: EntradaDeCustoDeMaterial, ctx: { usuario: UsuarioSessao; ip: string | null }): Promise<{ alterados: number }> {
  if (!valido(e.totalCentavos) || e.itens.some((i) => !valido(i.custoCentavos))) throw new ErroNegocio("O custo precisa ser um valor em reais maior que zero (ou deixe vazio).");
  if (new Set(e.itens.map((i) => i.itemId)).size !== e.itens.length) throw new ErroNegocio("Há um item repetido.");

  const proposta = await tx.proposta.findFirst({
    where: { id: e.propostaId, deletadoEm: null },
    select: { id: true, numero: true, revisao: true, opcoes: { where: { deletadoEm: null }, select: { id: true, custoMaterialInformadoCentavos: true } } },
  });
  if (!proposta) throw new ErroNegocio("Proposta não encontrada.");
  const opcao = proposta.opcoes.find((o) => o.id === e.opcaoId);
  if (!opcao) throw new ErroNegocio("Opção não encontrada nesta proposta.");
  const itens = await tx.itemProposta.findMany({ where: { propostaId: proposta.id, opcaoId: opcao.id, deletadoEm: null }, select: { id: true, custoMaterialInformadoCentavos: true } });
  const doItem = new Map(itens.map((i) => [i.id, i.custoMaterialInformadoCentavos]));
  for (const i of e.itens) if (!doItem.has(i.itemId)) throw new ErroNegocio("Algum item não pertence a esta opção. Recarregue a página.");

  const antes: Record<string, number | null> = { total: opcao.custoMaterialInformadoCentavos };
  const depois: Record<string, number | null> = { total: e.totalCentavos };
  let alterados = 0;
  if (e.totalCentavos !== opcao.custoMaterialInformadoCentavos) {
    await tx.opcaoProposta.update({ where: { id: opcao.id }, data: { custoMaterialInformadoCentavos: e.totalCentavos, atualizadoPorId: ctx.usuario.id } });
    alterados += 1;
  }
  for (const i of e.itens) {
    const anterior = doItem.get(i.itemId) ?? null;
    if (anterior === i.custoCentavos) continue;
    await tx.itemProposta.update({ where: { id: i.itemId }, data: { custoMaterialInformadoCentavos: i.custoCentavos, atualizadoPorId: ctx.usuario.id } });
    antes[i.itemId] = anterior;
    depois[i.itemId] = i.custoCentavos;
    alterados += 1;
  }
  if (alterados === 0) throw new ErroNegocio("Nada foi alterado.");
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "Proposta", entidadeId: proposta.id, acao: "CUSTO_MATERIAL", antes, depois: { ...depois, opcaoId: opcao.id, proposta: `${proposta.numero} Rev. ${proposta.revisao}` }, ip: ctx.ip });
  return { alterados };
}
