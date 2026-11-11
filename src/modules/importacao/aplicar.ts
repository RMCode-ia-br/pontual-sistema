import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { prisma } from "@/lib/db";

import { analisarImportacao, type LinhaAnalisada, type PedidoDeImportacao } from "./analisar";
import type { TipoDeImportacao } from "./campos";
import type { ClienteImportado, FornecedorImportado, ProdutoImportado } from "./linhas";

type Usuario = { id: string; nome: string };

export type ResultadoDaImportacao = { loteId: string; criados: number; atualizados: number; ignorados: number };

/** Tamanho dos blocos de inserção (cada linha leva ~20 parâmetros; o PostgreSQL aceita 65.535 por comando). */
const BLOCO = 500;

function emBlocos<T>(itens: T[], tamanho = BLOCO): T[][] {
  const blocos: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) blocos.push(itens.slice(i, i + tamanho));
  return blocos;
}

/** Campos do produto que a planilha pode atualizar (e o nome da coluna da planilha que os traz). */
type PatchDeProduto = Partial<{
  descricao: string;
  unidade: ProdutoImportado["unidade"];
  categoriaId: string | null;
  fornecedorPrincipalId: string | null;
  linhaId: string | null;
  acabamentoId: string | null;
  custoUnitarioCentavos: number | null;
  comprimentoBarraMm: number | null;
  pesoKgPorMetro: number | null;
  estoqueMinimo: number | null;
  localizacao: string | null;
}>;

/** Só o que veio PREENCHIDO na planilha entra no patch: célula vazia nunca apaga o que já existe. */
function montarPatch(d: ProdutoImportado, presentes: Set<string>): PatchDeProduto {
  const p: PatchDeProduto = {};
  if (presentes.has("descricao")) p.descricao = d.descricao;
  if (presentes.has("unidade")) p.unidade = d.unidade;
  if (presentes.has("categoria")) p.categoriaId = d.categoriaId ?? null;
  if (presentes.has("fornecedor")) p.fornecedorPrincipalId = d.fornecedorPrincipalId ?? null;
  if (presentes.has("linha")) p.linhaId = d.linhaId ?? null;
  if (presentes.has("acabamento")) p.acabamentoId = d.acabamentoId ?? null;
  if (presentes.has("custo")) p.custoUnitarioCentavos = d.custoCentavos ?? null;
  if (presentes.has("comprimentoBarraMm")) p.comprimentoBarraMm = d.comprimentoBarraMm ?? null;
  if (presentes.has("pesoKgPorMetro")) p.pesoKgPorMetro = d.pesoKgPorMetro ?? null;
  if (presentes.has("estoqueMinimo")) p.estoqueMinimo = d.estoqueMinimo ?? null;
  if (presentes.has("localizacao")) p.localizacao = d.localizacao ?? null;
  return p;
}

const numeroOuNulo = (v: { toString(): string } | null | undefined) => (v === null || v === undefined ? null : Number(v.toString()));

/**
 * Grava a importação numa transação só: lote, registros, histórico de preço, itens do lote (para poder
 * reverter) e auditoria. Roda a análise DE NOVO no servidor: o que a tela mostrou é só uma prévia.
 */
export async function aplicarImportacao(entrada: { usuario: Usuario; pedido: PedidoDeImportacao; importarValidas: boolean; ip?: string | null }): Promise<ResultadoDaImportacao> {
  const { usuario, pedido, importarValidas, ip } = entrada;
  const analise = await analisarImportacao(pedido);

  if (analise.totais.erros > 0 && !importarValidas) {
    throw new ErroNegocio(`Há ${analise.totais.erros} ${analise.totais.erros === 1 ? "linha com erro" : "linhas com erro"}. Corrija a planilha ou escolha importar só as linhas válidas.`);
  }
  const aGravar = analise.linhas.filter((l) => l.status === "NOVA" || l.status === "ATUALIZARA");
  if (aGravar.length === 0) throw new ErroNegocio("Nenhuma linha válida para importar.");

  const auditavel = { id: usuario.id, nome: usuario.nome };
  return prisma.$transaction(
    async (tx) => {
      const lote = await tx.loteImportacao.create({
        data: { tipo: pedido.tipo, nomeArquivo: pedido.nomeArquivo.slice(0, 200), totalLinhas: analise.totais.total, criadoPorId: usuario.id, atualizadoPorId: usuario.id },
        select: { id: true },
      });
      const meta = { loteImportacaoId: lote.id, criadoPorId: usuario.id, atualizadoPorId: usuario.id };
      const itens: { entidadeId: string; acao: "CRIADO" | "ATUALIZADO"; antes?: Prisma.InputJsonValue }[] = [];
      let atualizados = 0;

      const novas = aGravar.filter((l) => l.status === "NOVA");
      const atualizar = aGravar.filter((l) => l.status === "ATUALIZARA");

      if (pedido.tipo === "CLIENTES") {
        const registros = novas.map((l) => ({ id: randomUUID(), d: l.dados as ClienteImportado }));
        for (const bloco of emBlocos(registros)) {
          await tx.cliente.createMany({ data: bloco.map(({ id, d }) => ({ id, ...d, ...meta })) });
          await tx.interacao.createMany({
            data: bloco.map(({ id }) => ({ tipo: "SISTEMA" as const, texto: "Cliente cadastrado por importação de planilha.", clienteId: id, criadoPorId: usuario.id, atualizadoPorId: usuario.id })),
          });
        }
        itens.push(...registros.map((r) => ({ entidadeId: r.id, acao: "CRIADO" as const })));
      }

      if (pedido.tipo === "FORNECEDORES") {
        const registros = novas.map((l) => ({ id: randomUUID(), d: l.dados as FornecedorImportado }));
        for (const bloco of emBlocos(registros)) {
          await tx.fornecedor.createMany({
            data: bloco.map(({ id, d: { categoriaIds: _categorias, ...resto } }) => ({ id, ...resto, ...meta })),
          });
          // Categorias do fornecedor: tabela de ligação (A = categoria, B = fornecedor), uma instrução por bloco.
          const pares = bloco.flatMap(({ id, d }) => d.categoriaIds.map((cat) => [cat, id] as const));
          if (pares.length > 0) {
            await tx.$executeRaw`INSERT INTO "_CategoriaProdutoToFornecedor" ("A", "B") SELECT unnest(${pares.map((p) => p[0])}::text[]), unnest(${pares.map((p) => p[1])}::text[])`;
          }
        }
        itens.push(...registros.map((r) => ({ entidadeId: r.id, acao: "CRIADO" as const })));
      }

      if (pedido.tipo === "PRODUTOS") {
        const registros = novas.map((l) => ({ id: randomUUID(), d: l.dados as ProdutoImportado }));
        const agora = new Date();
        for (const bloco of emBlocos(registros)) {
          await tx.produto.createMany({
            data: bloco.map(({ id, d }) => ({
              id,
              codigo: d.codigo,
              descricao: d.descricao,
              unidade: d.unidade,
              categoriaId: d.categoriaId,
              fornecedorPrincipalId: d.fornecedorPrincipalId,
              linhaId: d.linhaId,
              acabamentoId: d.acabamentoId,
              custoUnitarioCentavos: d.custoCentavos,
              custoAtualizadoEm: d.custoCentavos !== undefined ? agora : undefined,
              comprimentoBarraMm: d.comprimentoBarraMm,
              pesoKgPorMetro: d.pesoKgPorMetro,
              estoqueMinimo: d.estoqueMinimo,
              localizacao: d.localizacao,
              ...meta,
            })),
          });
          const comCusto = bloco.filter(({ d }) => d.custoCentavos !== undefined);
          if (comCusto.length > 0) {
            await tx.historicoPreco.createMany({
              data: comCusto.map(({ id, d }) => ({
                produtoId: id,
                custoAnteriorCentavos: null,
                custoNovoCentavos: d.custoCentavos as number,
                origem: "IMPORTACAO" as const,
                fornecedorId: d.fornecedorPrincipalId,
                usuarioId: usuario.id,
                observacao: "Custo inicial (importação)",
                ...meta,
              })),
            });
          }
        }
        itens.push(...registros.map((r) => ({ entidadeId: r.id, acao: "CRIADO" as const })));

        // Atualizações de produtos que já existem (modo "atualizar"): cada uma guarda o antes e o depois.
        for (const l of atualizar) {
          if (!l.idExistente) continue;
          const patch = montarPatch(l.dados as ProdutoImportado, new Set(l.presentes));
          const atual = await tx.produto.findFirst({ where: { id: l.idExistente, deletadoEm: null } });
          if (!atual) continue;
          const antes: Record<string, unknown> = {};
          const depois: Record<string, unknown> = {};
          const valorAtual: Record<string, unknown> = {
            descricao: atual.descricao,
            unidade: atual.unidade,
            categoriaId: atual.categoriaId,
            fornecedorPrincipalId: atual.fornecedorPrincipalId,
            linhaId: atual.linhaId,
            acabamentoId: atual.acabamentoId,
            custoUnitarioCentavos: atual.custoUnitarioCentavos,
            comprimentoBarraMm: atual.comprimentoBarraMm,
            pesoKgPorMetro: numeroOuNulo(atual.pesoKgPorMetro),
            estoqueMinimo: numeroOuNulo(atual.estoqueMinimo),
            localizacao: atual.localizacao,
          };
          for (const [campo, novo] of Object.entries(patch)) {
            if (novo !== valorAtual[campo]) {
              antes[campo] = valorAtual[campo];
              depois[campo] = novo;
            }
          }
          if (Object.keys(depois).length === 0) continue; // nada mudou: nada a gravar

          const custoMudou = "custoUnitarioCentavos" in depois;
          if (custoMudou) antes.custoAtualizadoEm = atual.custoAtualizadoEm?.toISOString() ?? null;
          await tx.produto.update({
            where: { id: atual.id },
            data: { ...(patch as Prisma.ProdutoUncheckedUpdateInput), ...(custoMudou ? { custoAtualizadoEm: new Date() } : {}), atualizadoPorId: usuario.id, loteImportacaoId: lote.id },
          });
          if (custoMudou && patch.custoUnitarioCentavos !== null && patch.custoUnitarioCentavos !== undefined) {
            await tx.historicoPreco.create({
              data: {
                produtoId: atual.id,
                custoAnteriorCentavos: atual.custoUnitarioCentavos,
                custoNovoCentavos: patch.custoUnitarioCentavos,
                origem: "IMPORTACAO",
                fornecedorId: patch.fornecedorPrincipalId ?? atual.fornecedorPrincipalId,
                usuarioId: usuario.id,
                observacao: "Atualização por importação",
                ...meta,
              },
            });
          }
          itens.push({ entidadeId: atual.id, acao: "ATUALIZADO", antes: { antes, depois } as Prisma.InputJsonValue });
          atualizados++;
        }
      }

      for (const bloco of emBlocos(itens)) {
        await tx.loteImportacaoItem.createMany({
          data: bloco.map((i) => ({ loteId: lote.id, entidadeId: i.entidadeId, acao: i.acao, antes: i.antes, criadoPorId: usuario.id, atualizadoPorId: usuario.id })),
        });
      }

      const criados = itens.filter((i) => i.acao === "CRIADO").length;
      const ignorados = analise.totais.total - criados - atualizados;
      await tx.loteImportacao.update({ where: { id: lote.id }, data: { criados, atualizados, ignorados } });
      await registrarAuditoria(tx, {
        usuario: auditavel,
        entidade: "LoteImportacao",
        entidadeId: lote.id,
        acao: "IMPORTAR",
        depois: { tipo: pedido.tipo, arquivo: pedido.nomeArquivo, linhas: analise.totais.total, criados, atualizados, ignorados, erros: analise.totais.erros, repetidas: analise.totais.duplicadas },
        ip,
      });
      return { loteId: lote.id, criados, atualizados, ignorados };
    },
    // Importar centenas de linhas leva mais que os 5 s padrão do Prisma.
    { timeout: 120_000, maxWait: 15_000 },
  );
}

export type ResultadoDaReversao = { removidos: number; restaurados: number; naoRestaurados: number };

/** Desfaz um lote: o que ele criou vai para a lixeira; o que ele atualizou volta ao valor anterior (se ninguém mexeu depois). */
export async function reverterLote(entrada: { usuario: Usuario; loteId: string; ip?: string | null }): Promise<ResultadoDaReversao> {
  const { usuario, loteId, ip } = entrada;
  return prisma.$transaction(
    async (tx) => {
      const lote = await tx.loteImportacao.findFirst({ where: { id: loteId, deletadoEm: null }, include: { itens: { where: { deletadoEm: null } } } });
      if (!lote) throw new ErroNegocio("Importação não encontrada.");
      if (lote.status === "REVERTIDO") throw new ErroNegocio("Essa importação já foi desfeita.");

      const agora = new Date();
      const criadosIds = lote.itens.filter((i) => i.acao === "CRIADO").map((i) => i.entidadeId);
      const marca = { deletadoEm: agora, atualizadoPorId: usuario.id };
      let removidos = 0;
      for (const bloco of emBlocos(criadosIds, 1000)) {
        const where = { id: { in: bloco }, deletadoEm: null };
        const r =
          lote.tipo === "CLIENTES"
            ? await tx.cliente.updateMany({ where, data: marca })
            : lote.tipo === "FORNECEDORES"
              ? await tx.fornecedor.updateMany({ where, data: marca })
              : await tx.produto.updateMany({ where, data: marca });
        removidos += r.count;
      }

      let restaurados = 0;
      let naoRestaurados = 0;
      for (const item of lote.itens.filter((i) => i.acao === "ATUALIZADO")) {
        const registro = item.antes as { antes?: Record<string, unknown>; depois?: Record<string, unknown> } | null;
        const atual = await tx.produto.findFirst({ where: { id: item.entidadeId, deletadoEm: null } });
        if (!registro?.antes || !registro.depois || !atual) {
          naoRestaurados++;
          continue;
        }
        const valorAtual: Record<string, unknown> = {
          descricao: atual.descricao,
          unidade: atual.unidade,
          categoriaId: atual.categoriaId,
          fornecedorPrincipalId: atual.fornecedorPrincipalId,
          linhaId: atual.linhaId,
          acabamentoId: atual.acabamentoId,
          custoUnitarioCentavos: atual.custoUnitarioCentavos,
          comprimentoBarraMm: atual.comprimentoBarraMm,
          pesoKgPorMetro: numeroOuNulo(atual.pesoKgPorMetro),
          estoqueMinimo: numeroOuNulo(atual.estoqueMinimo),
          localizacao: atual.localizacao,
        };
        // Só volta atrás se o produto continua exatamente como a importação o deixou; senão, preserva o trabalho de quem mexeu depois.
        const intacto = Object.entries(registro.depois).every(([campo, esperado]) => valorAtual[campo] === esperado);
        if (!intacto) {
          naoRestaurados++;
          continue;
        }
        const { custoAtualizadoEm, ...camposAntes } = registro.antes;
        await tx.produto.update({
          where: { id: atual.id },
          data: {
            ...(camposAntes as Prisma.ProdutoUncheckedUpdateInput),
            ...("custoUnitarioCentavos" in camposAntes ? { custoAtualizadoEm: typeof custoAtualizadoEm === "string" ? new Date(custoAtualizadoEm) : null } : {}),
            atualizadoPorId: usuario.id,
          },
        });
        const custoVoltou = camposAntes.custoUnitarioCentavos;
        if ("custoUnitarioCentavos" in camposAntes && typeof custoVoltou === "number") {
          await tx.historicoPreco.create({
            data: {
              produtoId: atual.id,
              custoAnteriorCentavos: atual.custoUnitarioCentavos,
              custoNovoCentavos: custoVoltou,
              origem: "IMPORTACAO",
              usuarioId: usuario.id,
              observacao: "Importação desfeita",
              loteImportacaoId: lote.id,
              criadoPorId: usuario.id,
              atualizadoPorId: usuario.id,
            },
          });
        }
        restaurados++;
      }

      await tx.loteImportacao.update({ where: { id: lote.id }, data: { status: "REVERTIDO", revertidoEm: agora, revertidoPorId: usuario.id, atualizadoPorId: usuario.id } });
      await registrarAuditoria(tx, {
        usuario: { id: usuario.id, nome: usuario.nome },
        entidade: "LoteImportacao",
        entidadeId: lote.id,
        acao: "REVERTER",
        antes: { status: lote.status },
        depois: { status: "REVERTIDO", removidos, restaurados, naoRestaurados },
        ip,
      });
      return { removidos, restaurados, naoRestaurados };
    },
    { timeout: 120_000, maxWait: 15_000 },
  );
}

export type LoteDaLista = {
  id: string;
  tipo: TipoDeImportacao;
  nomeArquivo: string;
  criados: number;
  atualizados: number;
  ignorados: number;
  totalLinhas: number;
  status: "APLICADO" | "REVERTIDO";
  criadoEm: string;
  autor: string | null;
};

export async function listarLotes(limite = 20): Promise<LoteDaLista[]> {
  const lotes = await prisma.loteImportacao.findMany({ where: { deletadoEm: null }, orderBy: { criadoEm: "desc" }, take: limite });
  const ids = Array.from(new Set(lotes.map((l) => l.criadoPorId).filter((id): id is string => !!id)));
  const usuarios = ids.length ? await prisma.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }) : [];
  const nomes = new Map(usuarios.map((u) => [u.id, u.nome]));
  return lotes.map((l) => ({
    id: l.id,
    tipo: l.tipo,
    nomeArquivo: l.nomeArquivo,
    criados: l.criados,
    atualizados: l.atualizados,
    ignorados: l.ignorados,
    totalLinhas: l.totalLinhas,
    status: l.status,
    criadoEm: l.criadoEm.toISOString(),
    autor: l.criadoPorId ? (nomes.get(l.criadoPorId) ?? null) : null,
  }));
}

/** Para as linhas da análise que vão para a tela (sem os dados internos prontos para gravar). */
export type LinhaParaTela = Pick<LinhaAnalisada, "numero" | "status" | "resumo" | "detalhe">;
