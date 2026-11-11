import { z } from "zod";

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
        .refine((v) => v === null || /^#[0-9a-fA-F]{6}$/.test(v), "Cor inválida. Use o formato #1d4ed8."),
    ),

    horarioSemanaInicio: horario,
    horarioSemanaFim: horario,
    horarioSabadoInicio: horario,
    horarioSabadoFim: horario,
    visitaDuracaoMin: inteiroObrigatorio("Duração da visita", 15, 480),

    aliquotaImpostoPercentual: percentual("Alíquota de imposto"),
    margemPadraoPercentual: percentual("Margem padrão"),
    margemMinimaAlertaPercentual: percentual("Margem mínima"),
    metaFaturamentoMensalCentavos: dinheiroObrigatorio("Meta mensal"),
    capacidadeProducaoM2Mes: inteiroObrigatorio("Capacidade de produção", 1, 100000),
    garantiaRegulagemDias: inteiroObrigatorio("Garantia de regulagem", 0, 3650),
    retalhoMinimoMm: inteiroOpcional("Retalho mínimo", 0, 6000),
    custoMaoDeObraPorM2Centavos: dinheiroOpcional("Custo de mão de obra por m²"),
    tipoDias: campo(z.enum(["UTEIS", "CORRIDOS"], { message: "Escolha dias úteis ou corridos." })),
    diasFollowUpProposta: inteiroObrigatorio("Dias para acompanhar proposta", 0, 90),
    diasAlertaPrazoAmarelo: inteiroObrigatorio("Dias do alerta amarelo", 0, 30),
    limiteSimplesCentavos: dinheiroObrigatorio("Limite do Simples"),

    proximoNumeroProposta: inteiroOpcional("Próximo número de proposta", 1, 999999),
    reiniciaNumeracaoPorAno: marcado,
    consultorNome: texto(120),
    consultorCargo: texto(120),
    dadosPagamento: texto(500),
    pdfExibirValorPorItem: marcado,
    pdfDescricoesMaiusculas: marcado,
  })
  .superRefine((d, ctx) => {
    // R1: o divisor (1 − imposto% − margem%) precisa ser positivo.
    const imposto = d.aliquotaImpostoPercentual === null ? 0 : Number(d.aliquotaImpostoPercentual);
    const margem = d.margemPadraoPercentual === null ? 0 : Number(d.margemPadraoPercentual);
    if (imposto + margem >= 100) {
      ctx.addIssue({
        code: "custom",
        path: ["margemPadraoPercentual"],
        message: "Alíquota de imposto + margem padrão não podem chegar a 100%.",
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
    aliquotaImpostoPercentual: decimalParaTexto(c.aliquotaImpostoPercentual),
    margemPadraoPercentual: decimalParaTexto(c.margemPadraoPercentual),
    margemMinimaAlertaPercentual: decimalParaTexto(c.margemMinimaAlertaPercentual),
    metaFaturamentoMensalCentavos: moedaParaTexto(c.metaFaturamentoMensalCentavos),
    capacidadeProducaoM2Mes: n("capacidadeProducaoM2Mes"),
    garantiaRegulagemDias: n("garantiaRegulagemDias"),
    retalhoMinimoMm: n("retalhoMinimoMm"),
    custoMaoDeObraPorM2Centavos: moedaParaTexto(c.custoMaoDeObraPorM2Centavos),
    tipoDias: s("tipoDias") || "UTEIS",
    diasFollowUpProposta: n("diasFollowUpProposta"),
    diasAlertaPrazoAmarelo: n("diasAlertaPrazoAmarelo"),
    limiteSimplesCentavos: moedaParaTexto(c.limiteSimplesCentavos),
    proximoNumeroProposta: n("proximoNumeroProposta"),
    consultorNome: s("consultorNome"),
    consultorCargo: s("consultorCargo"),
    dadosPagamento: s("dadosPagamento"),
  };
}
