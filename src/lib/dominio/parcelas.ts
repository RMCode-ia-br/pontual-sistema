/**
 * Condições de pagamento e geração de parcelas a receber (R6).
 * Percentuais em pontos-base (50% = 5000). A ÚLTIMA parcela absorve a diferença do arredondamento.
 * Sem cálculo de juros (cartão em até 12x só informa o número de parcelas).
 */
import { dividirArredondando, PONTOS_BASE_100 } from "./preco";

export const GATILHOS = ["CONFIRMACAO", "ENTREGA_MATERIAL", "ENTREGA_E_INSTALACAO", "DATA_FIXA", "DIAS_APOS_APROVACAO"] as const;
export type Gatilho = (typeof GATILHOS)[number];

export const ROTULO_GATILHO: Record<Gatilho, string> = {
  CONFIRMACAO: "Na confirmação do pedido",
  ENTREGA_MATERIAL: "Na entrega do material (esquadrias)",
  ENTREGA_E_INSTALACAO: "Na entrega dos vidros e instalação",
  DATA_FIXA: "Em data fixa",
  DIAS_APOS_APROVACAO: "Dias após a aprovação",
};

export const FORMAS_PAGAMENTO = ["PIX", "TRANSFERENCIA", "ESPECIE", "CARTAO_CREDITO", "BOLETO"] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

export const ROTULO_FORMA: Record<FormaPagamento, string> = {
  PIX: "PIX",
  TRANSFERENCIA: "Transferência",
  ESPECIE: "Espécie",
  CARTAO_CREDITO: "Cartão de crédito",
  BOLETO: "Boleto",
};

export const MAXIMO_PARCELAS_CARTAO = 12;

/** Gatilhos que dependem de uma etapa da obra: a parcela fica sem vencimento até a etapa ser concluída. */
export function gatilhoDeEtapa(g: Gatilho): boolean {
  return g === "ENTREGA_MATERIAL" || g === "ENTREGA_E_INSTALACAO";
}

export type ParcelaPlanejada = {
  descricao: string;
  /** Pontos-base: 5000 = 50%. */
  percentualPb: number;
  gatilho: Gatilho;
  forma: FormaPagamento | null;
  diasApos?: number | null;
  /** AAAA-MM-DD (só para DATA_FIXA). */
  dataFixa?: string | null;
  parcelasCartao?: number | null;
};

export type ValidacaoParcelas = { ok: true } | { ok: false; erro: string };

/** O cronograma precisa somar exatamente 100% e cada parcela precisa ser coerente com o gatilho/forma. */
export function validarParcelas(parcelas: ParcelaPlanejada[]): ValidacaoParcelas {
  if (parcelas.length === 0) return { ok: false, erro: "Inclua ao menos uma parcela." };
  let soma = 0;
  for (const [i, p] of parcelas.entries()) {
    const n = i + 1;
    if (!Number.isInteger(p.percentualPb) || p.percentualPb <= 0) return { ok: false, erro: `Parcela ${n}: informe um percentual maior que zero.` };
    soma += p.percentualPb;
    if (p.gatilho === "DATA_FIXA" && !(p.dataFixa && /^\d{4}-\d{2}-\d{2}$/.test(p.dataFixa))) return { ok: false, erro: `Parcela ${n}: informe a data fixa.` };
    if (p.gatilho === "DIAS_APOS_APROVACAO" && !(Number.isInteger(p.diasApos) && (p.diasApos as number) >= 0 && (p.diasApos as number) <= 730)) {
      return { ok: false, erro: `Parcela ${n}: informe os dias após a aprovação (0 a 730).` };
    }
    if (p.parcelasCartao != null) {
      if (p.forma !== "CARTAO_CREDITO") return { ok: false, erro: `Parcela ${n}: o número de parcelas só vale para cartão de crédito.` };
      if (!Number.isInteger(p.parcelasCartao) || p.parcelasCartao < 1 || p.parcelasCartao > MAXIMO_PARCELAS_CARTAO) {
        return { ok: false, erro: `Parcela ${n}: o cartão aceita de 1 a ${MAXIMO_PARCELAS_CARTAO} parcelas.` };
      }
    }
  }
  if (soma !== PONTOS_BASE_100) {
    return { ok: false, erro: `As parcelas somam ${(soma / 100).toLocaleString("pt-BR")}%. Elas precisam somar 100%.` };
  }
  return { ok: true };
}

export type ParcelaGerada = {
  ordem: number;
  descricao: string;
  valorCentavos: number;
  percentualPb: number;
  gatilho: Gatilho;
  forma: FormaPagamento | null;
  /** AGUARDANDO_GATILHO (sem vencimento) ou ABERTA (com vencimento). */
  status: "AGUARDANDO_GATILHO" | "ABERTA";
  /** AAAA-MM-DD ou null quando aguarda a etapa. */
  vencimento: string | null;
  parcelasCartao: number | null;
};

/** Soma dias a uma data AAAA-MM-DD (calendário, sem fuso: UTC puro). */
export function somarDiasData(data: string, dias: number): string {
  const [a, m, d] = data.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + dias));
  return t.toISOString().slice(0, 10);
}

/**
 * Gera as parcelas a receber a partir do total aprovado. Valor = total × percentual (meio centavo para cima);
 * a última parcela recebe o que sobrou, então a soma é SEMPRE igual ao total.
 * `aprovacao` é a data de calendário (AAAA-MM-DD, America/Sao_Paulo) do aceite.
 */
export function gerarParcelas(totalCentavos: number, parcelas: ParcelaPlanejada[], aprovacao: string): ParcelaGerada[] {
  const validacao = validarParcelas(parcelas);
  if (!validacao.ok) throw new Error(validacao.erro);
  if (!Number.isInteger(totalCentavos) || totalCentavos < 0) throw new Error("Total inválido.");

  let acumulado = 0;
  return parcelas.map((p, i) => {
    const ultima = i === parcelas.length - 1;
    const valor = ultima ? totalCentavos - acumulado : Number(dividirArredondando(BigInt(totalCentavos) * BigInt(p.percentualPb), BigInt(PONTOS_BASE_100)));
    acumulado += valor;

    let vencimento: string | null = null;
    if (p.gatilho === "CONFIRMACAO") vencimento = aprovacao;
    else if (p.gatilho === "DATA_FIXA") vencimento = p.dataFixa ?? null;
    else if (p.gatilho === "DIAS_APOS_APROVACAO") vencimento = somarDiasData(aprovacao, p.diasApos ?? 0);

    return {
      ordem: i + 1,
      descricao: p.descricao,
      valorCentavos: valor,
      percentualPb: p.percentualPb,
      gatilho: p.gatilho,
      forma: p.forma,
      status: vencimento ? "ABERTA" : "AGUARDANDO_GATILHO",
      vencimento,
      parcelasCartao: p.parcelasCartao ?? null,
    };
  });
}
