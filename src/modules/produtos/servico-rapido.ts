import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import type { UsuarioSessao } from "@/lib/auth/sessao";

import { COMPRIMENTO_BARRA_PADRAO_MM, type UNIDADES } from "./schemas";
import { recalcularCustoDoPerfil } from "./servico-preco-kg";

type Tx = Prisma.TransactionClient;

/** Próximo código livre `P-0001`: contador atômico, pulando códigos que já existem (cadastrados à mão ou importados). */
export async function proximoCodigoDeProduto(tx: Tx): Promise<string> {
  for (let tentativa = 0; tentativa < 50; tentativa += 1) {
    const linhas = await tx.$queryRaw<{ valor: number }[]>`
      INSERT INTO "ContadorSequencia" ("chave", "valor", "atualizadoEm")
      VALUES ('produto', 1, now())
      ON CONFLICT ("chave") DO UPDATE SET "valor" = "ContadorSequencia"."valor" + 1, "atualizadoEm" = now()
      RETURNING "valor"`;
    const codigo = `P-${String(Number(linhas[0].valor)).padStart(4, "0")}`;
    const existe = await tx.produto.findFirst({ where: { codigo: { equals: codigo, mode: "insensitive" }, deletadoEm: null }, select: { id: true } });
    if (!existe) return codigo;
  }
  throw new ErroNegocio("Não foi possível gerar um código livre. Informe um código.");
}

export type DadosDoProdutoRapido = {
  descricao: string;
  unidade: (typeof UNIDADES)[number];
  categoriaId: string | null;
  codigo: string | null;
  /** Perfil de alumínio comprado por kg (custo pelo preço do kg do acabamento). */
  perfil: boolean;
  acabamentoId: string | null;
  linhaId: string | null;
  /** kg por metro; vazio = não informado (nunca inventado). */
  pesoKgPorMetro: number | null;
  comprimentoBarraMm: number | null;
};

/**
 * Cadastra um produto com o mínimo, na hora (dentro de uma compra ou do pedido de vidro). Custo nasce VAZIO ("sem custo"):
 * a primeira compra recebida com preço (ou o preço do kg, nos perfis) preenche. Código vazio = gerado (`P-0001`).
 */
export async function criarProdutoRapido(tx: Tx, d: DadosDoProdutoRapido, ctx: { usuario: UsuarioSessao; ip: string | null }) {
  const [categoria, linha, acabamento] = await Promise.all([
    d.categoriaId ? tx.categoriaProduto.count({ where: { id: d.categoriaId, deletadoEm: null } }) : 1,
    d.linhaId ? tx.linhaAluminio.count({ where: { id: d.linhaId, deletadoEm: null } }) : 1,
    d.acabamentoId ? tx.acabamentoAluminio.count({ where: { id: d.acabamentoId, deletadoEm: null } }) : 1,
  ]);
  const campos: Record<string, string> = {};
  if (!categoria) campos.categoriaId = "Escolha uma categoria da lista.";
  if (!linha) campos.linhaId = "Escolha uma linha da lista.";
  if (!acabamento) campos.acabamentoId = "Escolha um acabamento da lista.";
  if (Object.keys(campos).length > 0) throw new ErroNegocio("Alguma opção escolhida não existe mais. Recarregue a página.", campos);

  let codigo: string;
  if (d.codigo) {
    const outro = await tx.produto.findFirst({ where: { codigo: { equals: d.codigo, mode: "insensitive" }, deletadoEm: null }, select: { descricao: true } });
    if (outro) throw new ErroNegocio(`Já existe um produto com esse código: ${outro.descricao}.`, { codigo: `Código já usado em ${outro.descricao}.` });
    codigo = d.codigo;
  } else codigo = await proximoCodigoDeProduto(tx);

  const novo = await tx.produto.create({
    data: {
      codigo,
      descricao: d.descricao,
      unidade: d.unidade,
      categoriaId: d.categoriaId,
      custoPorKg: d.perfil,
      acabamentoId: d.perfil ? d.acabamentoId : null,
      linhaId: d.perfil ? d.linhaId : null,
      pesoKgPorMetro: d.perfil ? d.pesoKgPorMetro : null,
      // Perfil por barra: o comprimento padrão da spec (R14) só quando nada foi informado.
      comprimentoBarraMm: d.perfil ? (d.comprimentoBarraMm ?? (d.unidade === "BARRA" ? COMPRIMENTO_BARRA_PADRAO_MM : null)) : null,
      criadoPorId: ctx.usuario.id,
      atualizadoPorId: ctx.usuario.id,
    },
    select: { id: true, codigo: true, descricao: true, unidade: true, custoPorKg: true },
  });
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "Produto", entidadeId: novo.id, acao: "CRIAR", depois: { ...novo, origem: "cadastro rápido" }, ip: ctx.ip });
  let custo: number | null = null;
  if (novo.custoPorKg) custo = (await recalcularCustoDoPerfil(tx, novo.id, ctx)).custoCentavos;
  return { ...novo, custoUnitarioCentavos: custo };
}
