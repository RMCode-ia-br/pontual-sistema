import "server-only";

import { prisma } from "@/lib/db";
import type { LinhaTabelaPreco } from "@/lib/dominio/composicao";
import { dataParaInput } from "@/lib/formatadores";

export async function listarTipologias(situacao: "ativas" | "inativas" | "todas" = "ativas") {
  const tipologias = await prisma.tipologia.findMany({
    where: { deletadoEm: null, ...(situacao === "todas" ? {} : { ativo: situacao === "ativas" }) },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    select: {
      id: true,
      nome: true,
      categoria: true,
      tipoDesenho: true,
      cobrancaPadrao: true,
      categoriaMarkup: true,
      revisarTexto: true,
      exemplo: true,
      ativo: true,
      _count: { select: { insumos: { where: { deletadoEm: null } }, maoDeObra: { where: { deletadoEm: null } }, precos: { where: { deletadoEm: null } } } },
    },
  });
  return tipologias;
}

export type TipologiaDaLista = Awaited<ReturnType<typeof listarTipologias>>[number];

export async function obterTipologia(id: string) {
  const tipologia = await prisma.tipologia.findFirst({
    where: { id, deletadoEm: null },
    select: {
      id: true,
      nome: true,
      categoria: true,
      tipoDesenho: true,
      opcoesFolhas: true,
      templateDescricao: true,
      revisarTexto: true,
      cobrancaPadrao: true,
      categoriaMarkup: true,
      exigeEsquadria: true,
      exemplo: true,
      ativo: true,
      insumos: {
        where: { deletadoEm: null },
        orderBy: { ordem: "asc" },
        select: {
          id: true,
          produtoId: true,
          descricao: true,
          unidade: true,
          formulaQuantidade: true,
          perdaPb: true,
          custoUnitarioCentavos: true,
          produto: { select: { codigo: true, descricao: true, custoUnitarioCentavos: true } },
        },
      },
      maoDeObra: {
        where: { deletadoEm: null },
        orderBy: { ordem: "asc" },
        select: { id: true, papel: true, base: true, horasCentesimos: true, custoHoraCentavos: true },
      },
    },
  });
  return tipologia;
}

export type TipologiaDetalhe = NonNullable<Awaited<ReturnType<typeof obterTipologia>>>;

export async function listarPrecosDaTipologia(tipologiaId: string) {
  return prisma.tabelaPreco.findMany({
    where: { tipologiaId, deletadoEm: null },
    orderBy: [{ linha: { nome: "asc" } }, { acabamento: { nome: "asc" } }, { tipoVidro: { nome: "asc" } }, { espessuraVidroMm: "asc" }],
    select: {
      id: true,
      linhaId: true,
      acabamentoId: true,
      tipoVidroId: true,
      espessuraVidroMm: true,
      cobranca: true,
      valorCentavos: true,
      vigenciaInicio: true,
      vigenciaFim: true,
      ativo: true,
      linha: { select: { nome: true } },
      acabamento: { select: { nome: true } },
      tipoVidro: { select: { nome: true } },
    },
  });
}

export type PrecoDaLista = Awaited<ReturnType<typeof listarPrecosDaTipologia>>[number];

/** Linhas da tabela no formato do domínio (datas AAAA-MM-DD). */
export function paraDominio(precos: PrecoDaLista[]): LinhaTabelaPreco[] {
  return precos.map((p) => ({
    id: p.id,
    linhaId: p.linhaId,
    acabamentoId: p.acabamentoId,
    tipoVidroId: p.tipoVidroId,
    espessuraVidroMm: p.espessuraVidroMm,
    cobranca: p.cobranca,
    valorCentavos: p.valorCentavos,
    vigenciaInicio: p.vigenciaInicio ? dataParaInput(p.vigenciaInicio) : null,
    vigenciaFim: p.vigenciaFim ? dataParaInput(p.vigenciaFim) : null,
    ativo: p.ativo,
  }));
}

export async function listarOpcoesDeTipologia() {
  const [linhas, acabamentos, tiposVidro, espessuras, produtos] = await Promise.all([
    prisma.linhaAluminio.findMany({ where: { deletadoEm: null, ativo: true }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
    prisma.acabamentoAluminio.findMany({ where: { deletadoEm: null, ativo: true }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
    prisma.tipoVidro.findMany({ where: { deletadoEm: null, ativo: true }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
    prisma.espessuraVidro.findMany({ where: { deletadoEm: null, ativo: true }, orderBy: { mm: "asc" }, select: { mm: true } }),
    prisma.produto.findMany({
      where: { deletadoEm: null, ativo: true },
      orderBy: { descricao: "asc" },
      take: 1000,
      select: { id: true, codigo: true, descricao: true, unidade: true, custoUnitarioCentavos: true },
    }),
  ]);
  return { linhas, acabamentos, tiposVidro, espessuras: espessuras.map((e) => e.mm), produtos };
}
