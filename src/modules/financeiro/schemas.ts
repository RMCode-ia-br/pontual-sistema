import { z } from "zod";

import { FORMAS_PAGAMENTO } from "@/lib/dominio/parcelas";
import { MAXIMO_CENTAVOS } from "@/lib/dominio/preco";
import { parseMoedaParaCentavos } from "@/lib/formatadores";
import { campoCaixa } from "@/lib/validadores/campos";

/** Campo ausente do FormData vira texto vazio. */
const bruto = (max: number) => z.preprocess((v) => (typeof v === "string" ? v : ""), z.string().trim().max(max, `Use no máximo ${max} caracteres.`));

const textoObrigatorio = (rotulo: string, min: number, max: number) =>
  bruto(max).refine((v) => v.length >= min, `${rotulo}: informe ao menos ${min} caracteres.`);

const textoOpcional = (max: number) => bruto(max).transform((v) => (v === "" ? null : v));

const idObrigatorio = (mensagem: string) => bruto(64).refine((v) => v.length > 0, mensagem);

const idOpcional = bruto(64).transform((v) => (v === "" ? null : v));

/** "aaaa-mm-dd" de um <input type="date">, conferindo que o dia existe. */
export function dataValida(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

const dataObrigatoria = (rotulo: string) => bruto(10).refine(dataValida, `${rotulo}: informe uma data válida.`);

/**
 * Valor em reais ("1.234,56") → centavos inteiros. Com `permitirNegativo`, aceita um "-" na frente (saldo
 * devedor de uma conta). Sem isso, exige valor maior que zero.
 */
function dinheiro(rotulo: string, opcoes: { permitirNegativo?: boolean; permitirZero?: boolean } = {}) {
  return bruto(24).transform((v, ctx): number => {
    const negativo = opcoes.permitirNegativo === true && v.startsWith("-");
    const centavos = parseMoedaParaCentavos(negativo ? v.slice(1) : v);
    if (centavos === null) {
      ctx.addIssue({ code: "custom", message: `${rotulo}: informe um valor em reais, ex.: 1.234,56.` });
      return z.NEVER;
    }
    if (centavos > MAXIMO_CENTAVOS) {
      ctx.addIssue({ code: "custom", message: `${rotulo}: o valor máximo aceito é R$ 21.474.836,47.` });
      return z.NEVER;
    }
    if (centavos === 0 && !opcoes.permitirZero) {
      ctx.addIssue({ code: "custom", message: `${rotulo}: informe um valor maior que zero.` });
      return z.NEVER;
    }
    return negativo ? -centavos : centavos;
  });
}

export const TIPOS_DE_CONTA = ["BANCO", "CAIXA", "OUTRA"] as const;
export const ROTULO_TIPO_DE_CONTA: Record<(typeof TIPOS_DE_CONTA)[number], string> = {
  BANCO: "Banco",
  CAIXA: "Caixa (espécie)",
  OUTRA: "Outra",
};

const forma = bruto(20).transform((v, ctx) => {
  if (v === "") return null;
  if (!(FORMAS_PAGAMENTO as readonly string[]).includes(v)) {
    ctx.addIssue({ code: "custom", message: "Escolha uma forma de pagamento da lista." });
    return z.NEVER;
  }
  return v as (typeof FORMAS_PAGAMENTO)[number];
});

// ---------- Contas financeiras ----------

/**
 * Conta financeira: nome, tipo, saldo inicial e a data do saldo. O saldo é opcional ("não informado"): nada é
 * inventado. Informado, vale no início do dia da data. Sem número de conta nem dado bancário.
 */
export const contaFinanceiraSchema = z
  .object({
    nome: textoObrigatorio("Nome", 2, 80),
    tipo: z.enum(TIPOS_DE_CONTA, { message: "Escolha o tipo da conta." }),
    saldoInformado: campoCaixa,
    saldoInicial: bruto(24),
    dataSaldoInicial: bruto(10),
    observacao: textoOpcional(300),
  })
  .transform((d, ctx) => {
    if (!d.saldoInformado) {
      return { nome: d.nome, tipo: d.tipo, saldoInformado: false as const, saldoInicialCentavos: 0, dataSaldoInicial: null, observacao: d.observacao };
    }
    const valor = dinheiro("Saldo inicial", { permitirNegativo: true, permitirZero: true }).safeParse(d.saldoInicial);
    if (!valor.success) {
      ctx.addIssue({ code: "custom", path: ["saldoInicial"], message: d.saldoInicial === "" ? "Informe o saldo (pode ser zero) ou desmarque “Informar o saldo agora”." : valor.error.issues[0].message });
    }
    if (!dataValida(d.dataSaldoInicial)) ctx.addIssue({ code: "custom", path: ["dataSaldoInicial"], message: "Informe a data a que o saldo se refere." });
    if (!valor.success || !dataValida(d.dataSaldoInicial)) return z.NEVER;
    return { nome: d.nome, tipo: d.tipo, saldoInformado: true as const, saldoInicialCentavos: valor.data, dataSaldoInicial: d.dataSaldoInicial, observacao: d.observacao };
  });

export type DadosDaConta = z.output<typeof contaFinanceiraSchema>;

export const contaIdSchema = z.object({ contaId: idObrigatorio("Conta inválida.") });

export const ativarContaSchema = z.object({
  contaId: idObrigatorio("Conta inválida."),
  ativo: z.boolean(),
});

// ---------- Lançamentos ----------

export const lancamentoSchema = z.object({
  tipo: z.enum(["ENTRADA", "SAIDA"], { message: "Escolha entrada ou saída." }),
  data: dataObrigatoria("Data"),
  valor: dinheiro("Valor"),
  contaFinanceiraId: idObrigatorio("Escolha a conta."),
  categoriaId: idObrigatorio("Escolha a categoria."),
  descricao: textoObrigatorio("Descrição", 2, 200),
  forma,
  comNotaFiscal: campoCaixa,
  fornecedorId: idOpcional,
  observacao: textoOpcional(500),
});

export type DadosDoLancamento = z.output<typeof lancamentoSchema>;

export const transferenciaSchema = z
  .object({
    contaOrigemId: idObrigatorio("Escolha a conta de origem."),
    contaDestinoId: idObrigatorio("Escolha a conta de destino."),
    data: dataObrigatoria("Data"),
    valor: dinheiro("Valor"),
    descricao: textoOpcional(200),
  })
  .refine((d) => d.contaOrigemId !== d.contaDestinoId, { path: ["contaDestinoId"], message: "A origem e o destino precisam ser contas diferentes." });

export type DadosDaTransferencia = z.output<typeof transferenciaSchema>;

export const estornoSchema = z.object({
  lancamentoId: idObrigatorio("Lançamento inválido."),
  motivo: textoObrigatorio("Motivo", 3, 300),
});

export const conciliarSchema = z.object({
  lancamentoId: idObrigatorio("Lançamento inválido."),
  conciliado: z.boolean(),
});

export const lancamentoIdSchema = z.object({ lancamentoId: idObrigatorio("Lançamento inválido.") });

// ---------- Filtros da tela de extrato ----------

export const periodoSchema = z.object({
  de: bruto(10).transform((v) => (dataValida(v) ? v : null)),
  ate: bruto(10).transform((v) => (dataValida(v) ? v : null)),
});

// ---------- Contas a receber ----------

/** Valor opcional: vazio = não mexer (null). */
function dinheiroOuVazio(rotulo: string) {
  return bruto(24).transform((v, ctx): number | null => {
    if (v === "") return null;
    const r = dinheiro(rotulo).safeParse(v);
    if (!r.success) {
      ctx.addIssue({ code: "custom", message: r.error.issues[0].message });
      return z.NEVER;
    }
    return r.data;
  });
}

export const contaReceberIdSchema = z.object({ contaReceberId: idObrigatorio("Conta inválida.") });

export const recebimentoSchema = z.object({
  contaReceberId: idObrigatorio("Conta inválida."),
  data: dataObrigatoria("Data do recebimento"),
  valor: dinheiro("Valor recebido"),
  contaFinanceiraId: idObrigatorio("Escolha a conta onde o dinheiro entrou."),
  categoriaId: idOpcional,
  forma,
  comNotaFiscal: campoCaixa,
  observacao: textoOpcional(500),
});

export type DadosDoRecebimento = z.output<typeof recebimentoSchema>;

export const ajusteDeContaSchema = z
  .object({
    contaReceberId: idObrigatorio("Conta inválida."),
    valor: dinheiroOuVazio("Novo valor"),
    vencimento: bruto(10).transform((v) => (v === "" ? null : v)),
    motivo: textoObrigatorio("Motivo", 3, 300),
  })
  .superRefine((d, ctx) => {
    if (d.vencimento !== null && !dataValida(d.vencimento)) ctx.addIssue({ code: "custom", path: ["vencimento"], message: "Novo vencimento: informe uma data válida." });
    if (d.valor === null && d.vencimento === null) ctx.addIssue({ code: "custom", path: ["valor"], message: "Informe o novo valor e/ou o novo vencimento." });
  });

export const cancelarContaSchema = z.object({
  contaReceberId: idObrigatorio("Conta inválida."),
  motivo: textoObrigatorio("Motivo", 3, 300),
});

export const liberarParcelaSchema = z.object({
  contaReceberId: idObrigatorio("Conta inválida."),
  vencimento: dataObrigatoria("Vencimento"),
});

// ---------- Contas a pagar ----------

export const MODOS_DE_LANCAMENTO = ["UNICA", "PARCELADA", "RECORRENTE"] as const;
export const ROTULO_MODO_DE_LANCAMENTO: Record<(typeof MODOS_DE_LANCAMENTO)[number], string> = {
  UNICA: "Única",
  PARCELADA: "Parcelada",
  RECORRENTE: "Recorrente (aluguel, energia, DAS, salário…)",
};

export const PERIODICIDADES = ["MENSAL", "TRIMESTRAL", "ANUAL"] as const;
export const ROTULO_PERIODICIDADE: Record<(typeof PERIODICIDADES)[number], string> = { MENSAL: "Todo mês", TRIMESTRAL: "A cada 3 meses", ANUAL: "Todo ano" };

const inteiroEntre = (rotulo: string, min: number, max: number, padrao: number) =>
  bruto(3).transform((v, ctx): number => {
    if (v === "") return padrao;
    const n = Number(v);
    if (!/^\d+$/.test(v) || n < min || n > max) {
      ctx.addIssue({ code: "custom", message: `${rotulo}: informe um número inteiro de ${min} a ${max}.` });
      return z.NEVER;
    }
    return n;
  });

const dataOpcional = (rotulo: string) =>
  bruto(10).transform((v, ctx): string | null => {
    if (v === "") return null;
    if (!dataValida(v)) {
      ctx.addIssue({ code: "custom", message: `${rotulo}: informe uma data válida.` });
      return z.NEVER;
    }
    return v;
  });

/** Conta a pagar: única, parcelada (valor total dividido) ou recorrente (valor de cada ocorrência). */
export const contaAPagarSchema = z
  .object({
    descricao: textoObrigatorio("Descrição", 2, 200),
    modo: z.enum(MODOS_DE_LANCAMENTO, { message: "Escolha como lançar." }),
    fornecedorId: idOpcional,
    funcionarioId: idOpcional,
    favorecido: textoOpcional(120),
    categoriaId: idObrigatorio("Escolha a categoria."),
    projetoId: idOpcional,
    valor: dinheiro("Valor"),
    vencimento: dataObrigatoria("Vencimento"),
    parcelas: inteiroEntre("Parcelas", 2, 60, 2),
    periodicidade: z.preprocess((v) => (v === "" || v === undefined ? "MENSAL" : v), z.enum(PERIODICIDADES, { message: "Escolha a periodicidade." })),
    fimRecorrencia: dataOpcional("Fim da recorrência"),
    forma,
    observacao: textoOpcional(500),
  })
  .superRefine((d, ctx) => {
    if (d.modo === "RECORRENTE" && d.fimRecorrencia !== null && d.fimRecorrencia < d.vencimento) {
      ctx.addIssue({ code: "custom", path: ["fimRecorrencia"], message: "O fim da recorrência não pode ser antes do primeiro vencimento." });
    }
    if (d.modo === "PARCELADA" && d.valor < d.parcelas) {
      ctx.addIssue({ code: "custom", path: ["valor"], message: "O valor é menor que o número de parcelas." });
    }
  });

export type DadosDaContaAPagar = z.output<typeof contaAPagarSchema>;

export const contaPagarIdSchema = z.object({ contaPagarId: idObrigatorio("Conta inválida.") });

export const pagamentoSchema = z.object({
  contaPagarId: idObrigatorio("Conta inválida."),
  data: dataObrigatoria("Data do pagamento"),
  valor: dinheiro("Valor pago"),
  contaFinanceiraId: idObrigatorio("Escolha a conta de onde saiu o dinheiro."),
  forma,
  comNotaFiscal: campoCaixa,
  observacao: textoOpcional(500),
});

export type DadosDoPagamento = z.output<typeof pagamentoSchema>;

export const ajusteDeContaPagarSchema = z
  .object({
    contaPagarId: idObrigatorio("Conta inválida."),
    valor: dinheiroOuVazio("Novo valor"),
    vencimento: dataOpcional("Novo vencimento"),
    motivo: textoObrigatorio("Motivo", 3, 300),
  })
  .superRefine((d, ctx) => {
    if (d.valor === null && d.vencimento === null) ctx.addIssue({ code: "custom", path: ["valor"], message: "Informe o novo valor e/ou o novo vencimento." });
  });

export const cancelarContaPagarSchema = z.object({
  contaPagarId: idObrigatorio("Conta inválida."),
  motivo: textoObrigatorio("Motivo", 3, 300),
});

/** Edição de uma recorrência: vale para as ocorrências FUTURAS em aberto; o que já venceu ou foi pago não muda. */
export const recorrenciaSchema = z.object({
  recorrenciaId: idObrigatorio("Recorrência inválida."),
  descricao: textoObrigatorio("Descrição", 2, 200),
  fornecedorId: idOpcional,
  funcionarioId: idOpcional,
  favorecido: textoOpcional(120),
  categoriaId: idObrigatorio("Escolha a categoria."),
  valor: dinheiro("Valor"),
  diaVencimento: inteiroEntre("Dia do vencimento", 1, 31, 1),
  fim: dataOpcional("Fim da recorrência"),
  forma,
  observacao: textoOpcional(500),
});

export type DadosDaRecorrencia = z.output<typeof recorrenciaSchema>;

export const encerrarRecorrenciaSchema = z.object({
  recorrenciaId: idObrigatorio("Recorrência inválida."),
});
