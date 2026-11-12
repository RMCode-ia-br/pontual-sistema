"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { executar, falha, falhaDeValidacao, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissoes";
import { campoCaixa, campoDecimalOpcional, campoIdOpcional, campoInteiroOpcional, campoTexto, campoTextoOpcional } from "@/lib/validadores/campos";
import { idsDeProdutosPorBusca } from "@/modules/estoque/queries";

import { UNIDADES } from "../schemas";
import { criarProdutoRapido } from "../servico-rapido";

export type ProdutoParaEscolha = {
  id: string;
  /** "P-0001 · Perfil X" */
  rotulo: string;
  unidade: (typeof UNIDADES)[number];
  custoUnitarioCentavos: number | null;
  custoPorKg: boolean;
};

const selecao = { id: true, codigo: true, descricao: true, unidade: true, custoUnitarioCentavos: true, custoPorKg: true } as const;
const paraEscolha = (p: { id: string; codigo: string; descricao: string; unidade: (typeof UNIDADES)[number]; custoUnitarioCentavos: number | null; custoPorKg: boolean }): ProdutoParaEscolha => ({
  id: p.id,
  rotulo: `${p.codigo} · ${p.descricao}`,
  unidade: p.unidade,
  custoUnitarioCentavos: p.custoUnitarioCentavos,
  custoPorKg: p.custoPorKg,
});

/** Busca produtos ativos por parte do código ou da descrição (sem acento), para o campo de escolha. */
export async function buscarProdutosParaCampo(termo: string): Promise<ResultadoAcao<ProdutoParaEscolha[]>> {
  await exigirSessao();
  const t = termo.trim().slice(0, 80);
  if (t.length < 2) return sucesso([]);
  const ids = await idsDeProdutosPorBusca(t);
  if (ids.length === 0) return sucesso([]);
  const produtos = await prisma.produto.findMany({ where: { id: { in: ids }, ativo: true, deletadoEm: null }, orderBy: [{ descricao: "asc" }], take: 8, select: selecao });
  return sucesso(produtos.map(paraEscolha));
}

/** Listas do formulário de cadastro rápido (categorias, linhas e acabamentos ativos). */
export async function opcoesDoCadastroRapidoDeProduto(): Promise<ResultadoAcao<{ categorias: { id: string; nome: string }[]; linhas: { id: string; nome: string }[]; acabamentos: { id: string; nome: string }[] }>> {
  await exigirSessao();
  const ordem = [{ ordem: "asc" as const }, { nome: "asc" as const }];
  const [categorias, linhas, acabamentos] = await Promise.all([
    prisma.categoriaProduto.findMany({ where: { ativo: true, deletadoEm: null }, orderBy: ordem, select: { id: true, nome: true } }),
    prisma.linhaAluminio.findMany({ where: { ativo: true, deletadoEm: null }, orderBy: ordem, select: { id: true, nome: true } }),
    prisma.acabamentoAluminio.findMany({ where: { ativo: true, deletadoEm: null }, orderBy: ordem, select: { id: true, nome: true } }),
  ]);
  return sucesso({ categorias, linhas, acabamentos });
}

const produtoRapidoSchema = z
  .object({
    descricao: campoTexto("a descrição", 200),
    unidade: z.enum(UNIDADES, { message: "Escolha a unidade de medida." }),
    categoriaId: campoIdOpcional,
    codigo: campoTextoOpcional(40),
    perfil: campoCaixa,
    acabamentoId: campoIdOpcional,
    linhaId: campoIdOpcional,
    pesoKgPorMetro: campoDecimalOpcional("Peso por metro", 1000, 3),
    comprimentoBarraMm: campoInteiroOpcional("Comprimento da barra", 20000),
  })
  .superRefine((d, ctx) => {
    if (d.perfil && !d.acabamentoId) ctx.addIssue({ code: "custom", path: ["acabamentoId"], message: "Escolha o acabamento: é dele que vem o preço do kg." });
  });

/** Cadastra um produto na hora (custo vazio = "sem custo"); devolve o produto para o campo já selecionar. */
export async function cadastrarProdutoRapido(entrada: unknown): Promise<ResultadoAcao<ProdutoParaEscolha>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "produto")) return falha("Sem permissão.");
  const dados = produtoRapidoSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  const d = dados.data;
  return executar(
    "produtos.rapido",
    async () => {
      const ip = extrairIp(await headers());
      const criado = await prisma.$transaction(
        (tx) =>
          criarProdutoRapido(
            tx,
            {
              descricao: d.descricao,
              unidade: d.unidade,
              categoriaId: d.categoriaId ?? null,
              codigo: d.codigo ?? null,
              perfil: d.perfil,
              acabamentoId: d.acabamentoId ?? null,
              linhaId: d.linhaId ?? null,
              pesoKgPorMetro: d.pesoKgPorMetro ?? null,
              comprimentoBarraMm: d.comprimentoBarraMm ?? null,
            },
            { usuario: sessao, ip },
          ),
        { timeout: 30_000 },
      );
      revalidatePath("/produtos");
      return sucesso(paraEscolha(criado), "Produto cadastrado.");
    },
    "Já existe um produto com esse código.",
  );
}
