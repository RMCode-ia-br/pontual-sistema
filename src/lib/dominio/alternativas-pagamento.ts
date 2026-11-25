/**
 * Formas de pagamento alternativas da proposta (Fase 3.6a). Regra pura, tudo em centavos inteiros e pontos-base (1% = 100).
 *
 * Ordem de cálculo, por opção de produto:
 *   itens − desconto da opção = REFERÊNCIA (sem nota)
 *   → ajuste da forma de pagamento (percentual sobre a referência OU total digitado, também sem nota)
 *   → acréscimo da nota fiscal (se a proposta é com nota), em linha separada, sempre por último
 *   → total da forma = base ajustada + nota. As parcelas saem do total (última absorve a diferença).
 * A forma principal (a condição que a proposta já tinha) tem ajuste zero: o total dela é o da opção, como sempre foi.
 * Não existe taxa de operadora de cartão aqui: o ajuste é preço decidido pelo dono.
 */

import { acrescimoSobre, dividirArredondando, MAXIMO_CENTAVOS, PONTOS_BASE_100 } from "./preco";

export const MAXIMO_FORMAS_PAGAMENTO = 5;
/** Ajuste limitado a −50% e +50%. */
export const AJUSTE_MAXIMO_PB = 5000;
export const PARCELAS_CARTAO_MAXIMAS = 12;

export type ModoAjuste = "PERCENTUAL" | "TOTAL_DIGITADO";

export type EntradaAlternativa = {
  /** Itens − desconto da opção (sem nota). */
  referenciaCentavos: number;
  modo: ModoAjuste;
  /** Modo PERCENTUAL: −5000..5000 (pode ser zero). */
  ajustePb?: number;
  /** Modo TOTAL_DIGITADO: total desejado ANTES da nota. Zero não é aceito (a proposta não pode valer zero). */
  totalDigitadoCentavos?: number;
  comNotaFiscal: boolean;
  acrescimoNotaPb: number;
};

export type ResultadoAlternativa =
  | {
      ok: true;
      referenciaCentavos: number;
      /** Referência depois do ajuste, antes da nota. */
      baseAjustadaCentavos: number;
      /** baseAjustada − referência (negativo = desconto). */
      ajusteCentavos: number;
      /** Ajuste efetivo em pontos-base (derivado quando o total foi digitado), arredondado a 2 casas. */
      ajusteEfetivoPb: number;
      acrescimoNotaCentavos: number;
      totalCentavos: number;
    }
  | { ok: false; erro: string };

/** (base − referência) ÷ referência em pontos-base, meio ponto para longe do zero. */
export function ajusteEfetivoPb(referenciaCentavos: number, baseCentavos: number): number {
  if (referenciaCentavos <= 0) return 0;
  const dif = BigInt(baseCentavos) - BigInt(referenciaCentavos);
  const sinal = dif < BigInt(0) ? -1 : 1;
  const abs = dif < BigInt(0) ? -dif : dif;
  return sinal * Number(dividirArredondando(abs * BigInt(PONTOS_BASE_100), BigInt(referenciaCentavos)));
}

export function calcularAlternativa(e: EntradaAlternativa): ResultadoAlternativa {
  const ref = e.referenciaCentavos;
  if (!Number.isInteger(ref) || ref <= 0) return { ok: false, erro: "O valor da opção precisa ser maior que zero." };

  let base: number;
  if (e.modo === "PERCENTUAL") {
    const pb = e.ajustePb ?? 0;
    if (!Number.isInteger(pb) || Math.abs(pb) > AJUSTE_MAXIMO_PB) return { ok: false, erro: "O ajuste pode ir de −50% a +50%." };
    base = Number(dividirArredondando(BigInt(ref) * BigInt(PONTOS_BASE_100 + pb), BigInt(PONTOS_BASE_100)));
  } else {
    const t = e.totalDigitadoCentavos;
    if (t === undefined || !Number.isInteger(t) || t <= 0) return { ok: false, erro: "Informe o valor total desta forma de pagamento." };
    if (BigInt(t) * BigInt(PONTOS_BASE_100) > BigInt(ref) * BigInt(PONTOS_BASE_100 + AJUSTE_MAXIMO_PB) || BigInt(t) * BigInt(PONTOS_BASE_100) < BigInt(ref) * BigInt(PONTOS_BASE_100 - AJUSTE_MAXIMO_PB)) {
      return { ok: false, erro: "O total desta forma difere mais de 50% do valor da opção." };
    }
    base = t;
  }
  if (base <= 0) return { ok: false, erro: "O valor desta forma de pagamento ficou zerado." };

  const acrescimoNotaCentavos = e.comNotaFiscal ? acrescimoSobre(base, e.acrescimoNotaPb) : 0;
  const total = base + acrescimoNotaCentavos;
  if (total > MAXIMO_CENTAVOS) return { ok: false, erro: "O valor passa do limite que o sistema aceita." };
  return {
    ok: true,
    referenciaCentavos: ref,
    baseAjustadaCentavos: base,
    ajusteCentavos: base - ref,
    ajusteEfetivoPb: ajusteEfetivoPb(ref, base),
    acrescimoNotaCentavos,
    totalCentavos: total,
  };
}

/** Parcelas iguais do cartão: total ÷ n; a diferença de centavos vai para a última (nunca se perde centavo). */
export function parcelasDoCartao(totalCentavos: number, n: number): number[] {
  if (!Number.isInteger(n) || n < 1 || n > PARCELAS_CARTAO_MAXIMAS) throw new Error("Cartão: de 1 a 12 parcelas.");
  if (!Number.isInteger(totalCentavos) || totalCentavos <= 0) throw new Error("Total inválido.");
  const base = Math.floor(totalCentavos / n);
  const lista = Array.from({ length: n }, () => base);
  lista[n - 1] = totalCentavos - base * (n - 1);
  return lista;
}

// ----- Conteúdo congelado (snapshot) e PDF -----

/** Uma parcela do cronograma como fica no snapshot (mesma forma de `ParcelaConteudo`). */
export type ParcelaForma = { descricao: string; percentualPb: number; gatilho: string; forma: string | null; diasApos: number | null; dataFixa: string | null; parcelasCartao: number | null };

/** O que uma forma de pagamento vale para UMA opção de produto. */
export type TotalDaForma = {
  opcaoId: string;
  /** Itens − desconto da opção (sem nota). */
  referenciaCentavos: number;
  /** Base ajustada − referência (negativo = desconto). Zero na forma principal. */
  ajusteCentavos: number;
  /** Referência com o ajuste, antes da nota. */
  baseCentavos: number;
  acrescimoNotaCentavos: number;
  totalCentavos: number;
};

/**
 * Forma de pagamento congelada. A forma principal vem primeiro (`principal: true`, ajuste zero). Só existe no snapshot quando a
 * proposta tem formas extras: sem elas o conteúdo é exatamente o de antes. O acréscimo do cartão repassado (decisão 144) é
 * `repasseCartao && ajusteCentavos > 0`, lido na aprovação.
 */
export type FormaPagamentoConteudo = {
  nome: string;
  principal: boolean;
  textoLivre: string | null;
  parcelas: ParcelaForma[];
  repasseCartao: boolean;
  porOpcao: TotalDaForma[];
};

export type FormaExtraEntrada = {
  nome: string;
  modoAjuste: ModoAjuste;
  ajustePb: number;
  repasseCartao: boolean;
  textoLivre: string | null;
  parcelas: ParcelaForma[];
  totais: { opcaoId: string; baseCentavos: number }[];
};

export type OpcaoParaForma = { id: string; nome: string; baseCentavos: number; acrescimoNotaCentavos: number; totalCentavos: number };

export const NOME_PADRAO_FORMA_PRINCIPAL = "Forma A";

/**
 * Monta as formas congeladas (principal + extras) com o total de cada uma por opção, ou lista o que impede (português simples).
 * Sem formas extras devolve lista vazia: o snapshot e o PDF seguem como eram.
 */
export function montarFormasDePagamento(d: {
  nomePrincipal: string | null;
  principal: { textoLivre: string | null; parcelas: ParcelaForma[] };
  extras: FormaExtraEntrada[];
  opcoes: OpcaoParaForma[];
  comNotaFiscal: boolean;
  acrescimoNotaPb: number;
}): { ok: true; formas: FormaPagamentoConteudo[] } | { ok: false; problemas: string[] } {
  if (d.extras.length === 0) return { ok: true, formas: [] };
  const problemas: string[] = [];
  const varias = d.opcoes.length > 1;
  const principal: FormaPagamentoConteudo = {
    nome: (d.nomePrincipal ?? "").trim() || NOME_PADRAO_FORMA_PRINCIPAL,
    principal: true,
    textoLivre: d.principal.textoLivre,
    parcelas: d.principal.parcelas,
    repasseCartao: false,
    porOpcao: d.opcoes.map((o) => ({ opcaoId: o.id, referenciaCentavos: o.baseCentavos, ajusteCentavos: 0, baseCentavos: o.baseCentavos, acrescimoNotaCentavos: o.acrescimoNotaCentavos, totalCentavos: o.totalCentavos })),
  };
  const formas: FormaPagamentoConteudo[] = [principal];
  for (const e of d.extras) {
    const porOpcao: TotalDaForma[] = [];
    for (const o of d.opcoes) {
      if (o.baseCentavos <= 0) {
        problemas.push(`Forma "${e.nome}"${varias ? `, opção "${o.nome}"` : ""}: a opção ainda não tem valor.`);
        continue;
      }
      const r = calcularAlternativa({ referenciaCentavos: o.baseCentavos, modo: e.modoAjuste, ajustePb: e.ajustePb, totalDigitadoCentavos: e.totais.find((t) => t.opcaoId === o.id)?.baseCentavos, comNotaFiscal: d.comNotaFiscal, acrescimoNotaPb: d.acrescimoNotaPb });
      if (!r.ok) {
        problemas.push(`Forma "${e.nome}"${varias ? `, opção "${o.nome}"` : ""}: ${r.erro}`);
        continue;
      }
      porOpcao.push({ opcaoId: o.id, referenciaCentavos: r.referenciaCentavos, ajusteCentavos: r.ajusteCentavos, baseCentavos: r.baseAjustadaCentavos, acrescimoNotaCentavos: r.acrescimoNotaCentavos, totalCentavos: r.totalCentavos });
    }
    formas.push({ nome: e.nome, principal: false, textoLivre: e.textoLivre, parcelas: e.parcelas, repasseCartao: e.repasseCartao, porOpcao });
  }
  return problemas.length > 0 ? { ok: false, problemas } : { ok: true, formas };
}
