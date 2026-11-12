import { z } from "zod";

import { faixasValidas } from "@/lib/dominio/porte";
import { MARKUP_MAXIMO_PB, percentualParaPontosBase, pontosBaseParaPercentual } from "@/lib/dominio/preco";
import { formatarTelefone, normalizarTelefone, parseMoedaParaCentavos } from "@/lib/formatadores";
import { emailValido, formatarCep, formatarCnpj, somenteDigitos, urlHttpValida, validarCnpj } from "@/lib/validadores";

/** Campo ausente do FormData vira texto vazio (ex.: caixa de seleção desmarcada). */
const campo = <T extends z.ZodType>(schema: T) => z.preprocess((v) => v ?? "", schema);

const texto = (max: number) =>
  campo(
    z
      .string()
      .trim()
      .max(max, `Use no máximo ${max} caracteres.`)
      .transform((v) => (v === "" ? null : v)),
  );

const url = campo(
  z
    .string()
    .trim()
    .max(300, "Link muito longo.")
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || urlHttpValida(v), "Informe um link começando com http:// ou https://"),
);

const email = campo(
  z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || emailValido(v), "E-mail inválido."),
);

const telefone = campo(
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const normalizado = normalizarTelefone(v);
      if (!normalizado) {
        ctx.addIssue({ code: "custom", message: "Telefone inválido. Use DDD + número, ex.: (22) 99999-9999." });
        return z.NEVER;
      }
      return normalizado;
    }),
);

const horario = campo(
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "Use o formato HH:mm, ex.: 08:00."),
);

/** "6,5" → "6.5" (texto para Decimal do banco). Vazio → null (não definido). */
const percentual = (rotulo: string) =>
  campo(
    z
      .string()
      .trim()
      .transform((v, ctx) => {
        if (v === "") return null;
        if (!/^\d{1,3}([.,]\d{1,2})?$/.test(v) || Number(v.replace(",", ".")) > 100) {
          ctx.addIssue({ code: "custom", message: `${rotulo}: informe um percentual entre 0 e 100, ex.: 6,5.` });
          return z.NEVER;
        }
        return v.replace(",", ".");
      }),
  );

/** Percentual digitado ("80", "5,5") → pontos-base inteiros (80% = 8000). Obrigatório, de 0 até o máximo informado. */
const percentualEmPontosBase = (rotulo: string, maximoPb: number) =>
  campo(
    z
      .string()
      .trim()
      .transform((v, ctx): number => {
        const pb = v === "" ? null : percentualParaPontosBase(v);
        if (pb === null || pb > maximoPb) {
          ctx.addIssue({ code: "custom", message: `${rotulo}: informe um percentual entre 0 e ${maximoPb / 100}, com até 2 casas, ex.: 80.` });
          return z.NEVER;
        }
        return pb;
      }),
  );

/** As colunas de dinheiro são Int de 32 bits (PostgreSQL): acima disso o banco recusa com erro genérico. */
const MAXIMO_CENTAVOS = 2_147_483_647;

function converterDinheiro(rotulo: string, v: string, ctx: z.RefinementCtx): number {
  const centavos = parseMoedaParaCentavos(v);
  if (centavos === null) {
    ctx.addIssue({ code: "custom", message: `${rotulo}: informe um valor em reais, ex.: 1.500,00.` });
    return z.NEVER;
  }
  if (centavos > MAXIMO_CENTAVOS) {
    ctx.addIssue({ code: "custom", message: `${rotulo}: o valor máximo aceito é R$ 21.474.836,47.` });
    return z.NEVER;
  }
  return centavos;
}

/** Valor em reais obrigatório → centavos (sempre number). */
const dinheiroObrigatorio = (rotulo: string) =>
  campo(
    z.string().trim().transform((v, ctx) => {
      if (v === "") {
        ctx.addIssue({ code: "custom", message: `${rotulo}: informe um valor.` });
        return z.NEVER;
      }
      return converterDinheiro(rotulo, v, ctx);
    }),
  );

/** Valor em reais opcional → centavos ou null. */
const dinheiroOpcional = (rotulo: string) =>
  campo(z.string().trim().transform((v, ctx): number | null => (v === "" ? null : converterDinheiro(rotulo, v, ctx))));

function converterInteiro(rotulo: string, v: string, min: number, max: number, ctx: z.RefinementCtx): number {
  const n = Number(v);
  if (!/^\d+$/.test(v) || n < min || n > max) {
    ctx.addIssue({ code: "custom", message: `${rotulo}: informe um número inteiro entre ${min} e ${max}.` });
    return z.NEVER;
  }
  return n;
}

/** Número inteiro obrigatório (sempre number). */
const inteiroObrigatorio = (rotulo: string, min: number, max: number) =>
  campo(
    z.string().trim().transform((v, ctx) => {
      if (v === "") {
        ctx.addIssue({ code: "custom", message: `${rotulo}: informe um número.` });
        return z.NEVER;
      }
      return converterInteiro(rotulo, v, min, max, ctx);
    }),
  );

/** Número inteiro opcional (number | null). */
const inteiroOpcional = (rotulo: string, min: number, max: number) =>
  campo(z.string().trim().transform((v, ctx): number | null => (v === "" ? null : converterInteiro(rotulo, v, min, max, ctx))));

const marcado = campo(z.string().transform((v) => v === "on" || v === "true"));

export const empresaSchema = z
  .object({
    razaoSocial: texto(120),
    nomeFantasia: texto(120),
    cnpj: campo(
      z
        .string()
        .trim()
        .transform((v, ctx) => {
          if (v === "") return null;
          if (!validarCnpj(v)) {
            ctx.addIssue({ code: "custom", message: "CNPJ inválido." });
            return z.NEVER;
          }
          return formatarCnpj(v);
        }),
    ),
    endereco: texto(200),
    cidade: texto(80),
    uf: campo(
      z
        .string()
        .trim()
        .toUpperCase()
        .transform((v) => (v === "" ? null : v))
        .refine((v) => v === null || /^[A-Z]{2}$/.test(v), "UF: use 2 letras, ex.: RJ."),
    ),
    cep: campo(
      z
        .string()
        .trim()
        .transform((v, ctx) => {
          if (v === "") return null;
          if (somenteDigitos(v).length !== 8) {
            ctx.addIssue({ code: "custom", message: "CEP inválido. Use 8 dígitos." });
            return z.NEVER;
          }
          return formatarCep(v);
        }),
    ),
    telefone,
    whatsapp: telefone,
    emailContato: email,
    emailPropostas: email,
    siteUrl: url,
    instagramUrl: url,
    googlePerfilUrl: url,
    linkAvaliacaoGoogle: url,
    corPrimaria: campo(
      z
        .string()
        .trim()
        .transform((v) => (v === "" ? null : v))
        .refine((v) => v === null || /^#[0-9a-fA-F]{6}$/.test(v), "Cor inválida. Use o formato #0064b5."),
    ),

    horarioSemanaInicio: horario,
    horarioSemanaFim: horario,
    horarioSabadoInicio: horario,
    horarioSabadoFim: horario,
    visitaDuracaoMin: inteiroObrigatorio("Duração da visita", 15, 480),

    // Regra do dono (2026-11-13): preço de composição = custo × (1 + markup); nota fiscal soma o acréscimo depois.
    markupPadraoPb: percentualEmPontosBase("Markup padrão", MARKUP_MAXIMO_PB),
    markupVidroTemperadoPb: percentualEmPontosBase("Markup de vidro temperado e guarda-corpo", MARKUP_MAXIMO_PB),
    acrescimoNotaPb: percentualEmPontosBase("Acréscimo da nota fiscal", 10000),
    margemMinimaAlertaPercentual: percentual("Margem mínima"),
    metaFaturamentoMensalCentavos: dinheiroObrigatorio("Meta mensal"),
    // Limite do acompanhamento "recebido com nota fiscal nos últimos 12 meses". Vazio (ou zero) = "limite não informado".
    limiteSimplesCentavos: dinheiroOpcional("Limite do faturamento com nota fiscal"),
    capacidadeProducaoM2Mes: inteiroObrigatorio("Capacidade de produção", 1, 100000),
    garantiaRegulagemDias: inteiroObrigatorio("Garantia de regulagem", 0, 3650),
    retalhoMinimoMm: inteiroOpcional("Retalho mínimo", 0, 6000),
    custoMaoDeObraPorM2Centavos: dinheiroOpcional("Custo de mão de obra por m²"),
    tipoDias: campo(z.enum(["UTEIS", "CORRIDOS"], { message: "Escolha dias úteis ou corridos." })),
    diasFollowUpProposta: inteiroObrigatorio("Dias para acompanhar proposta", 0, 90),
    diasSemRetornoProposta: inteiroObrigatorio("Dias para considerar a proposta sem retorno", 1, 365),
    diasPedidoAvaliacao: inteiroObrigatorio("Dias para pedir a avaliação", 0, 90),
    porteMedioMinimoCentavos: dinheiroOpcional("Valor a partir do qual o projeto é médio"),
    porteGrandeMinimoCentavos: dinheiroOpcional("Valor a partir do qual o projeto é grande"),
    diasAlertaPrazoAmarelo: inteiroObrigatorio("Dias do alerta amarelo", 0, 30),

    // Financeiro (Fase 5): parâmetros de cobrança e de recorrência, editáveis (nada fixo no código).
    categoriaReceitaPadraoId: campo(
      z
        .string()
        .trim()
        .max(64)
        .transform((v) => (v === "" ? null : v)),
    ),
    mesesRecorrenciaAFrente: inteiroObrigatorio("Meses à frente das recorrências", 1, 24),
    diasAlertaVencimento: inteiroObrigatorio("Dias do alerta de vencimento", 0, 90),
    diasLembreteCobranca: inteiroObrigatorio("Dias do lembrete de cobrança", 0, 60),

    proximoNumeroProposta: inteiroOpcional("Próximo número de proposta", 1, 999999),
    reiniciaNumeracaoPorAno: marcado,
    consultorNome: texto(120),
    consultorCargo: texto(120),
    dadosPagamento: texto(500),
    pdfExibirValorPorItem: marcado,
    pdfDescricoesMaiusculas: marcado,
  })
  .superRefine((d, ctx) => {
    // R10: o valor do porte grande precisa ser maior que o do médio.
    if (!faixasValidas({ medioMinimoCentavos: d.porteMedioMinimoCentavos, grandeMinimoCentavos: d.porteGrandeMinimoCentavos })) {
      ctx.addIssue({
        code: "custom",
        path: ["porteGrandeMinimoCentavos"],
        message: "O valor do projeto grande precisa ser maior que o do médio.",
      });
    }
  });

export type DadosEmpresa = z.output<typeof empresaSchema>;

type Registro = Record<string, unknown>;

const moedaParaTexto = (centavos: unknown): string =>
  typeof centavos === "number" ? (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";

const decimalParaTexto = (valor: unknown): string => (valor === null || valor === undefined ? "" : String(valor).replace(".", ","));

/** Valores do banco → textos iniciais do formulário (o inverso do schema). */
export function empresaParaFormulario(cfg: Registro | null): Record<string, string> {
  const c = cfg ?? {};
  const s = (k: string) => (typeof c[k] === "string" ? (c[k] as string) : "");
  const n = (k: string) => (typeof c[k] === "number" ? String(c[k]) : "");
  return {
    razaoSocial: s("razaoSocial"),
    nomeFantasia: s("nomeFantasia"),
    cnpj: s("cnpj"),
    endereco: s("endereco"),
    cidade: s("cidade"),
    uf: s("uf"),
    cep: s("cep"),
    telefone: formatarTelefone(s("telefone")),
    whatsapp: formatarTelefone(s("whatsapp")),
    emailContato: s("emailContato"),
    emailPropostas: s("emailPropostas"),
    siteUrl: s("siteUrl"),
    instagramUrl: s("instagramUrl"),
    googlePerfilUrl: s("googlePerfilUrl"),
    linkAvaliacaoGoogle: s("linkAvaliacaoGoogle"),
    corPrimaria: s("corPrimaria"),
    horarioSemanaInicio: s("horarioSemanaInicio"),
    horarioSemanaFim: s("horarioSemanaFim"),
    horarioSabadoInicio: s("horarioSabadoInicio"),
    horarioSabadoFim: s("horarioSabadoFim"),
    visitaDuracaoMin: n("visitaDuracaoMin"),
    markupPadraoPb: typeof c.markupPadraoPb === "number" ? pontosBaseParaPercentual(c.markupPadraoPb) : "",
    markupVidroTemperadoPb: typeof c.markupVidroTemperadoPb === "number" ? pontosBaseParaPercentual(c.markupVidroTemperadoPb) : "",
    acrescimoNotaPb: typeof c.acrescimoNotaPb === "number" ? pontosBaseParaPercentual(c.acrescimoNotaPb) : "",
    margemMinimaAlertaPercentual: decimalParaTexto(c.margemMinimaAlertaPercentual),
    metaFaturamentoMensalCentavos: moedaParaTexto(c.metaFaturamentoMensalCentavos),
    limiteSimplesCentavos: moedaParaTexto(c.limiteSimplesCentavos),
    capacidadeProducaoM2Mes: n("capacidadeProducaoM2Mes"),
    garantiaRegulagemDias: n("garantiaRegulagemDias"),
    retalhoMinimoMm: n("retalhoMinimoMm"),
    custoMaoDeObraPorM2Centavos: moedaParaTexto(c.custoMaoDeObraPorM2Centavos),
    tipoDias: s("tipoDias") || "UTEIS",
    diasFollowUpProposta: n("diasFollowUpProposta"),
    diasSemRetornoProposta: n("diasSemRetornoProposta"),
    diasPedidoAvaliacao: n("diasPedidoAvaliacao"),
    porteMedioMinimoCentavos: moedaParaTexto(c.porteMedioMinimoCentavos),
    porteGrandeMinimoCentavos: moedaParaTexto(c.porteGrandeMinimoCentavos),
    diasAlertaPrazoAmarelo: n("diasAlertaPrazoAmarelo"),
    categoriaReceitaPadraoId: s("categoriaReceitaPadraoId"),
    mesesRecorrenciaAFrente: n("mesesRecorrenciaAFrente"),
    diasAlertaVencimento: n("diasAlertaVencimento"),
    diasLembreteCobranca: n("diasLembreteCobranca"),
    proximoNumeroProposta: n("proximoNumeroProposta"),
    consultorNome: s("consultorNome"),
    consultorCargo: s("consultorCargo"),
    dadosPagamento: s("dadosPagamento"),
  };
}
