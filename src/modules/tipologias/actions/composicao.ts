"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { ErroNegocio, executar, falha, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissoes";

import { composicaoSchema, lerComposicao, type EntradaComposicao } from "../schemas";

/**
 * Substitui a composição inteira da tipologia (insumos e mão de obra) numa transação: as linhas antigas vão
 * para a exclusão lógica e as novas são criadas na ordem enviada. `entrada` chega do navegador e é revalidada aqui
 * (fórmulas, números, produtos).
 */
export async function salvarComposicao(entrada: EntradaComposicao): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "tipologia")) return falha("Sem permissão.");

  const bruto = composicaoSchema.safeParse(entrada);
  if (!bruto.success) return falha(bruto.error.issues[0]?.message ?? "Dados inválidos.");
  const lido = lerComposicao(bruto.data);
  if ("erro" in lido) return falha(lido.erro);

  return executar("tipologias.composicao", async () => {
    const tipologiaId = bruto.data.tipologiaId;
    const tipologia = await prisma.tipologia.findFirst({ where: { id: tipologiaId, deletadoEm: null }, select: { id: true } });
    if (!tipologia) throw new ErroNegocio("Tipologia não encontrada.");

    // Produtos citados precisam existir (IDs do navegador nunca são confiáveis).
    const idsProdutos = [...new Set(lido.insumos.flatMap((i) => (i.produtoId ? [i.produtoId] : [])))];
    if (idsProdutos.length > 0) {
      const achados = await prisma.produto.count({ where: { id: { in: idsProdutos }, deletadoEm: null } });
      if (achados !== idsProdutos.length) throw new ErroNegocio("Um dos produtos escolhidos não foi encontrado. Atualize a página.");
    }

    const ip = extrairIp(await headers());
    const agora = new Date();
    await prisma.$transaction(async (tx) => {
      const [insumosAntes, maoAntes] = await Promise.all([
        tx.composicaoInsumo.findMany({ where: { tipologiaId, deletadoEm: null }, orderBy: { ordem: "asc" }, select: { produtoId: true, descricao: true, unidade: true, formulaQuantidade: true, perdaPb: true, custoUnitarioCentavos: true } }),
        tx.composicaoMaoDeObra.findMany({ where: { tipologiaId, deletadoEm: null }, orderBy: { ordem: "asc" }, select: { papel: true, base: true, horasCentesimos: true, custoHoraCentavos: true } }),
      ]);
      await tx.composicaoInsumo.updateMany({ where: { tipologiaId, deletadoEm: null }, data: { deletadoEm: agora, atualizadoPorId: sessao.id } });
      await tx.composicaoMaoDeObra.updateMany({ where: { tipologiaId, deletadoEm: null }, data: { deletadoEm: agora, atualizadoPorId: sessao.id } });
      if (lido.insumos.length > 0) {
        await tx.composicaoInsumo.createMany({
          data: lido.insumos.map((i, ordem) => ({
            tipologiaId,
            produtoId: i.produtoId,
            descricao: i.descricao,
            unidade: i.unidade,
            formulaQuantidade: i.formulaQuantidade,
            perdaPb: i.perdaPb,
            // Com produto, o custo vem do cadastro do produto; o custo próprio só vale sem produto.
            custoUnitarioCentavos: i.produtoId ? null : i.custoUnitarioCentavos,
            ordem,
            criadoPorId: sessao.id,
            atualizadoPorId: sessao.id,
          })),
        });
      }
      if (lido.maoDeObra.length > 0) {
        await tx.composicaoMaoDeObra.createMany({
          data: lido.maoDeObra.map((m, ordem) => ({ tipologiaId, ...m, ordem, criadoPorId: sessao.id, atualizadoPorId: sessao.id })),
        });
      }
      await registrarAuditoria(tx, {
        usuario: sessao,
        entidade: "Tipologia",
        entidadeId: tipologiaId,
        acao: "ATUALIZAR_COMPOSICAO",
        antes: { insumos: insumosAntes, maoDeObra: maoAntes },
        depois: { insumos: lido.insumos, maoDeObra: lido.maoDeObra },
        ip,
      });
    });
    revalidatePath(`/tipologias/${tipologiaId}`);
    return sucesso(undefined, "Composição salva.");
  });
}
