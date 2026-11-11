import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { custoDaComposicao, escolherLinhaDaTabela, type LinhaTabelaPreco } from "@/lib/dominio/composicao";
import { proximoNumero, formatarNumeroProposta } from "@/lib/dominio/numeracao-proposta";
import {
  MAXIMO_CENTAVOS,
  precoPorCobranca,
  precoPorComposicao,
  resolverMarkup,
  type Medida,
  type ModoPreco,
  type TipoCobranca,
} from "@/lib/dominio/preco";
import { anoEmSaoPaulo } from "@/lib/dominio/codigo-projeto";
import { dataParaInput, hojeCalendario } from "@/lib/formatadores";

type Db = Prisma.TransactionClient;

/**
 * Reserva o próximo número `NNNN-AA` na mesma transação da criação da proposta. A linha da configuração fica
 * travada (FOR UPDATE): duas criações simultâneas nunca recebem o mesmo número.
 */
export async function reservarNumeroDeProposta(tx: Db, agora: Date = new Date()): Promise<{ numero: string; sequencial: number; ano: number }> {
  const linhas = await tx.$queryRaw<{ proximo: number | null; ano: number | null; reinicia: boolean }[]>`
    SELECT "proximoNumeroProposta" AS proximo, "anoNumeracaoProposta" AS ano, "reiniciaNumeracaoPorAno" AS reinicia
      FROM "ConfiguracaoEmpresa" WHERE "id" = 'singleton' FOR UPDATE`;
  if (linhas.length === 0) throw new ErroNegocio("As configurações da empresa não foram encontradas. Rode o seed.");
  const ano = anoEmSaoPaulo(agora);
  let { sequencial, novoProximo } = proximoNumero({ proximo: linhas[0].proximo, anoDoContador: linhas[0].ano, anoAtual: ano, reiniciaPorAno: linhas[0].reinicia });
  // Proteção: o contador (editável em Configurações) nunca pode voltar para um número que já foi emitido (inclusive
  // de proposta excluída: a unicidade do banco vale para elas também). Com reinício por ano, só conta o ano.
  const emitido = linhas[0].reinicia
    ? await tx.$queryRaw<{ maior: number | null }[]>`SELECT max("numeroSequencial") AS maior FROM "Proposta" WHERE "ano" = ${ano}`
    : await tx.$queryRaw<{ maior: number | null }[]>`SELECT max("numeroSequencial") AS maior FROM "Proposta"`;
  const maior = emitido[0]?.maior ?? 0;
  if (maior >= sequencial) {
    sequencial = maior + 1;
    novoProximo = sequencial + 1;
  }
  await tx.$executeRaw`UPDATE "ConfiguracaoEmpresa" SET "proximoNumeroProposta" = ${novoProximo}, "anoNumeracaoProposta" = ${ano} WHERE "id" = 'singleton'`;
  return { numero: formatarNumeroProposta(sequencial, ano), sequencial, ano };
}

/** Só rascunho é editável; proposta enviada pede nova revisão (R4). Devolve o que as ações precisam. */
export async function exigirRascunho(db: Db, propostaId: string) {
  // Trava a linha: edição e envio/aprovação da mesma proposta nunca andam juntos (o snapshot não fica velho).
  await db.$queryRaw`SELECT "id" FROM "Proposta" WHERE "id" = ${propostaId} FOR UPDATE`;
  const p = await db.proposta.findFirst({
    where: { id: propostaId, deletadoEm: null },
    select: { id: true, status: true, projetoId: true, numero: true, revisao: true, comNotaFiscal: true, acrescimoNotaPb: true, markupPb: true, projeto: { select: { clienteId: true, deletadoEm: true } } },
  });
  if (!p || p.projeto.deletadoEm) throw new ErroNegocio("Proposta não encontrada.");
  if (p.status !== "RASCUNHO") {
    throw new ErroNegocio("Esta proposta já foi enviada e não pode ser editada. Crie uma nova revisão para alterá-la.");
  }
  return p;
}

// ----- Cálculo do preço do item (sempre no servidor) -----

export type EntradaCalculoItem = {
  modoPreco: ModoPreco;
  tipologiaId: string | null;
  linhaId: string | null;
  acabamentoId: string | null;
  tipoVidroId: string | null;
  espessuraVidroMm: number | null;
  folhas: number | null;
  medidas: Medida[];
  valorManualCentavos: number | null;
  markupItemPb: number | null;
  markupPropostaPb: number | null;
};

export type SaidaCalculoItem =
  | {
      ok: true;
      modoPreco: ModoPreco;
      cobranca: TipoCobranca | null;
      precoTotalCentavos: number;
      custoEstimadoCentavos: number | null;
      markupPb: number | null;
      aviso: string | null;
    }
  | { ok: false; erro: string; semTabela?: boolean };

export async function calcularPrecoDoItem(db: Db, e: EntradaCalculoItem): Promise<SaidaCalculoItem> {
  if (e.medidas.length === 0) return { ok: false, erro: "Informe ao menos uma medida (largura × altura × quantidade)." };

  const [config, tipologia] = await Promise.all([
    db.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { markupPadraoPb: true, markupVidroTemperadoPb: true } }),
    e.tipologiaId
      ? db.tipologia.findFirst({
          where: { id: e.tipologiaId, deletadoEm: null },
          select: {
            categoriaMarkup: true,
            cobrancaPadrao: true,
            insumos: { where: { deletadoEm: null }, orderBy: { ordem: "asc" }, select: { descricao: true, formulaQuantidade: true, perdaPb: true, custoUnitarioCentavos: true, produto: { select: { descricao: true, custoUnitarioCentavos: true } } } },
            maoDeObra: { where: { deletadoEm: null }, orderBy: { ordem: "asc" }, select: { papel: true, base: true, horasCentesimos: true, custoHoraCentavos: true } },
          },
        })
      : null,
  ]);
  if (e.tipologiaId && !tipologia) return { ok: false, erro: "A tipologia escolhida não foi encontrada." };

  // Custo estimado (informativo): só existe quando a composição está completa.
  let custo: number | null = null;
  let motivoSemCusto: string | null = null;
  if (tipologia) {
    const c = custoDaComposicao(
      tipologia.insumos.map((i) => ({
        descricao: i.produto?.descricao ?? i.descricao ?? "insumo",
        formulaQuantidade: i.formulaQuantidade,
        perdaPb: i.perdaPb,
        custoUnitarioCentavos: i.produto ? i.produto.custoUnitarioCentavos : i.custoUnitarioCentavos,
      })),
      tipologia.maoDeObra,
      e.medidas,
      { folhas: e.folhas },
    );
    if (c.ok) custo = c.custoCentavos;
    else motivoSemCusto = c.erro;
  }

  const limite = (v: number) => (v > MAXIMO_CENTAVOS ? null : v);

  if (e.modoPreco === "MANUAL") {
    if (e.valorManualCentavos === null) return { ok: false, erro: "Informe o valor do item." };
    return { ok: true, modoPreco: "MANUAL", cobranca: null, precoTotalCentavos: e.valorManualCentavos, custoEstimadoCentavos: custo, markupPb: null, aviso: null };
  }

  if (e.modoPreco === "TABELA") {
    if (!tipologia || !e.tipologiaId) return { ok: false, erro: "Escolha a tipologia para usar a tabela de preços." };
    const linhas = await db.tabelaPreco.findMany({
      where: { tipologiaId: e.tipologiaId, deletadoEm: null },
      select: { id: true, linhaId: true, acabamentoId: true, tipoVidroId: true, espessuraVidroMm: true, cobranca: true, valorCentavos: true, vigenciaInicio: true, vigenciaFim: true, ativo: true },
    });
    const dominio: LinhaTabelaPreco[] = linhas.map((l) => ({
      ...l,
      vigenciaInicio: l.vigenciaInicio ? dataParaInput(l.vigenciaInicio) : null,
      vigenciaFim: l.vigenciaFim ? dataParaInput(l.vigenciaFim) : null,
    }));
    const achada = escolherLinhaDaTabela(dominio, { linhaId: e.linhaId, acabamentoId: e.acabamentoId, tipoVidroId: e.tipoVidroId, espessuraVidroMm: e.espessuraVidroMm }, dataParaInput(hojeCalendario()));
    if (!achada) {
      // R1: sem linha na tabela o item cai em MANUAL com aviso.
      if (e.valorManualCentavos === null) {
        return { ok: false, semTabela: true, erro: "Não há preço na tabela para esta combinação. O item passa para valor manual: informe o valor." };
      }
      return {
        ok: true,
        modoPreco: "MANUAL",
        cobranca: null,
        precoTotalCentavos: e.valorManualCentavos,
        custoEstimadoCentavos: custo,
        markupPb: null,
        aviso: "Sem preço na tabela para esta combinação: usando o valor manual.",
      };
    }
    const preco = limite(precoPorCobranca(achada.cobranca, achada.valorCentavos, e.medidas));
    if (preco === null) return { ok: false, erro: "O preço calculado passa do valor máximo aceito." };
    return { ok: true, modoPreco: "TABELA", cobranca: achada.cobranca, precoTotalCentavos: preco, custoEstimadoCentavos: custo, markupPb: null, aviso: null };
  }

  // COMPOSICAO: custo × (1 + markup)
  if (!tipologia) return { ok: false, erro: "Escolha a tipologia para calcular por composição." };
  if (custo === null) return { ok: false, erro: motivoSemCusto ?? "Não foi possível calcular o custo." };
  const { markupPb } = resolverMarkup({
    itemPb: e.markupItemPb,
    propostaPb: e.markupPropostaPb,
    categoria: tipologia.categoriaMarkup,
    config: { padraoPb: config?.markupPadraoPb ?? 8000, vidroTemperadoPb: config?.markupVidroTemperadoPb ?? 10000 },
  });
  const preco = precoPorComposicao(custo, markupPb);
  if (!preco.ok) return { ok: false, erro: preco.erro };
  return { ok: true, modoPreco: "COMPOSICAO", cobranca: null, precoTotalCentavos: preco.precoCentavos, custoEstimadoCentavos: custo, markupPb, aviso: null };
}
