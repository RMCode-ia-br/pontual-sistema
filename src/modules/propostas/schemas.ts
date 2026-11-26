import { z } from "zod";

import { AJUSTE_MAXIMO_PB, MAXIMO_FORMAS_PAGAMENTO } from "@/lib/dominio/alternativas-pagamento";
import { FORMAS_PAGAMENTO, GATILHOS, MAXIMO_PARCELAS_CARTAO, validarParcelas, type ParcelaPlanejada } from "@/lib/dominio/parcelas";
import { valorParaCentavos } from "@/lib/dominio/numeros";
import { MAXIMO_CENTAVOS, percentualParaPontosBase } from "@/lib/dominio/preco";
import { campoIdObrigatorio } from "@/lib/validadores/campos";
import { lerEscalado } from "@/lib/validadores/numero-br";
import { normalizarQuebrasDeLinha } from "@/lib/validadores/texto-multilinha";

export const MODOS_PRECO = ["MANUAL", "TABELA", "COMPOSICAO"] as const;
export const ROTULO_MODO_PRECO: Record<(typeof MODOS_PRECO)[number], string> = { MANUAL: "Valor manual", TABELA: "Tabela de preços", COMPOSICAO: "Composição (custo + markup)" };

export const STATUS_PROPOSTA = ["RASCUNHO", "ENVIADA", "APROVADA", "RECUSADA", "EXPIRADA", "SUBSTITUIDA", "CANCELADA"] as const;
export const ROTULO_STATUS_PROPOSTA: Record<(typeof STATUS_PROPOSTA)[number], string> = {
  RASCUNHO: "Rascunho",
  ENVIADA: "Enviada",
  APROVADA: "Aprovada",
  RECUSADA: "Recusada",
  EXPIRADA: "Expirada",
  SUBSTITUIDA: "Substituída",
  CANCELADA: "Cancelada",
};

const texto = (max: number) => z.string().trim().max(max, `Use no máximo ${max} caracteres.`);
/** Tamanho máximo dos dados para pagamento (várias linhas), na proposta e no padrão da empresa. */
export const LIMITE_DADOS_PAGAMENTO = 1000;
/** Só o modelo cinza do campo vazio (placeholder); nenhum dado real é gravado por ele. */
export const EXEMPLO_DADOS_PAGAMENTO = ["Favorecido: …", "Banco: …", "Agência: …", "Conta: …", "Chave Pix: …"].join("\n");
/** Dica sob o campo de dados para pagamento (proposta e Configurações). */
export const DICA_DADOS_PAGAMENTO = "Uma informação por linha, por exemplo: Favorecido, Banco, Agência, Conta, Chave Pix. As quebras de linha saem iguais no PDF.";
const textoEmLinhas = (max: number) => z.preprocess((v) => (typeof v === "string" ? normalizarQuebrasDeLinha(v) : v), texto(max).optional());
const idOpcional = z.string().trim().max(64).nullish().transform((v) => (v ? v : null));
const inteiroOpcional = (rotulo: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .max(8)
    .optional()
    .transform((v, ctx): number | null => {
      if (v === undefined || v === "") return null;
      const n = Number(v);
      if (!/^\d+$/.test(v) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message: `${rotulo}: informe um número inteiro de ${min} a ${max}.` });
        return z.NEVER;
      }
      return n;
    });
const dinheiroOpcional = (rotulo: string, max = 2_000_000_000) =>
  z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v, ctx): number | null => {
      if (v === undefined || v === "") return null;
      const c = valorParaCentavos(v);
      if (c === null || c > max) {
        ctx.addIssue({ code: "custom", message: `${rotulo}: informe um valor em reais, ex.: 1.250,00.` });
        return z.NEVER;
      }
      return c;
    });
const percentualOpcional = (rotulo: string, maxPb: number) =>
  z
    .string()
    .trim()
    .max(8)
    .optional()
    .transform((v, ctx): number | null => {
      if (v === undefined || v === "") return null;
      const pb = percentualParaPontosBase(v);
      if (pb === null || pb > maxPb) {
        ctx.addIssue({ code: "custom", message: `${rotulo}: informe um percentual de 0 a ${maxPb / 100}, com até 2 casas.` });
        return z.NEVER;
      }
      return pb;
    });

// ----- Item -----

export const medidaSchema = z.object({
  larguraMm: z.number().int("Largura: use milímetros inteiros.").min(1, "Largura: mínimo 1 mm.").max(20000, "Largura: máximo 20.000 mm."),
  alturaMm: z.number().int("Altura: use milímetros inteiros.").min(1, "Altura: mínimo 1 mm.").max(20000, "Altura: máximo 20.000 mm."),
  quantidade: z.number().int("Quantidade: use número inteiro.").min(1, "Quantidade: mínimo 1.").max(1000, "Quantidade: máximo 1.000."),
  local: texto(120).optional(),
});

export const itemSchema = z.object({
  id: idOpcional,
  propostaId: campoIdObrigatorio("Proposta inválida."),
  opcaoId: campoIdObrigatorio("Escolha a opção."),
  grupoId: idOpcional,
  tipologiaId: idOpcional,
  linhaId: idOpcional,
  acabamentoId: idOpcional,
  tipoVidroId: idOpcional,
  espessuraVidroMm: inteiroOpcional("Espessura", 1, 50),
  folhas: inteiroOpcional("Folhas", 1, 12),
  faces: inteiroOpcional("Faces", 1, 12),
  torresCm: inteiroOpcional("Torres", 1, 500),
  descricao: texto(1500).min(1, "A descrição do item não pode ficar vazia."),
  descricaoEditada: z.boolean(),
  local: texto(120).optional(),
  observacoes: texto(1000).optional(),
  modoPreco: z.enum(MODOS_PRECO, { message: "Escolha como calcular o preço." }),
  valorManual: dinheiroOpcional("Valor"),
  markup: percentualOpcional("Markup", 100000),
  medidas: z.array(medidaSchema).min(1, "Informe ao menos uma medida.").max(30, "No máximo 30 medidas por item."),
});
export type EntradaItem = z.input<typeof itemSchema>;

// ----- Opção e grupo -----

export const opcaoSchema = z.object({
  id: idOpcional,
  propostaId: campoIdObrigatorio("Proposta inválida."),
  nome: texto(80).min(1, "Dê um nome à opção."),
  desconto: dinheiroOpcional("Desconto"),
});

export const grupoSchema = z.object({ id: idOpcional, propostaId: campoIdObrigatorio("Proposta inválida."), nome: texto(80).min(1, "Dê um nome à seção.") });

export const duplicarOpcaoSchema = z.object({
  propostaId: campoIdObrigatorio("Proposta inválida."),
  opcaoId: campoIdObrigatorio("Opção inválida."),
  nome: texto(80).min(1, "Dê um nome à nova opção."),
  /** Trocas opcionais aplicadas a todos os itens copiados (que são recalculados). */
  linhaId: idOpcional,
  acabamentoId: idOpcional,
  tipoVidroId: idOpcional,
  espessuraVidroMm: inteiroOpcional("Espessura", 1, 50),
});
export type DuplicarOpcaoEntrada = z.infer<typeof duplicarOpcaoSchema>;

// ----- Proposta (cabeçalho, condições comerciais e cronograma) -----

const data = z
  .string()
  .trim()
  .max(10)
  .optional()
  .transform((v, ctx): string | null => {
    if (v === undefined || v === "") return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
      ctx.addIssue({ code: "custom", message: "Informe uma data válida." });
      return z.NEVER;
    }
    return v;
  });

export const parcelaPropostaSchema = z.object({
  descricao: texto(120).min(1, "Descreva a parcela."),
  percentual: texto(8),
  gatilho: z.enum(GATILHOS),
  forma: z.enum(FORMAS_PAGAMENTO).nullish().transform((v) => v ?? null),
  diasApos: texto(4).optional(),
  dataFixa: data,
  parcelasCartao: texto(2).optional(),
});

export const alternativaPropostaSchema = z.object({
  nome: texto(60).min(1, "Dê um nome à forma de pagamento."),
  condicaoId: idOpcional,
  textoLivre: texto(500).optional(),
  modoAjuste: z.enum(["PERCENTUAL", "TOTAL_DIGITADO"]),
  /** Percentual com sinal ("-5", "7,5"); vazio = zero. */
  ajuste: texto(8).optional(),
  repasseCartao: z.boolean(),
  parcelas: z.array(parcelaPropostaSchema).max(24),
  /** Modo TOTAL_DIGITADO: o total desta forma para cada opção de produto (antes da nota). */
  totais: z.array(z.object({ opcaoId: campoIdObrigatorio("Opção inválida."), total: texto(20) })).max(30),
});

export const propostaSchema = z.object({
  id: campoIdObrigatorio("Proposta inválida."),
  parte: texto(40).optional(),
  data: data.refine((v) => v !== null, "Informe a data da proposta."),
  consultorNome: texto(120).optional(),
  consultorCargo: texto(120).optional(),
  clienteNome: texto(160).min(1, "Informe o nome do cliente."),
  clienteDocumento: texto(30).optional(),
  clienteContato: texto(120).optional(),
  clienteTelefone: texto(30).optional(),
  clienteEmail: texto(160).optional(),
  enderecoObra: texto(300).optional(),
  tituloEscopo: texto(120).min(1, "Informe o título do escopo."),
  comNotaFiscal: z.boolean(),
  acrescimoNota: percentualOpcional("Acréscimo da nota", 10000),
  comissaoArquiteto: percentualOpcional("Comissão do arquiteto", 9999),
  comissaoIndicacao: percentualOpcional("Comissão de indicação", 9999),
  markup: percentualOpcional("Markup", 100000),
  modoPrazo: z.enum(["NENHUM", "TOTAL", "POR_ETAPA"]),
  prazoTotalMinDias: inteiroOpcional("Prazo mínimo", 1, 365),
  prazoTotalMaxDias: inteiroOpcional("Prazo máximo", 1, 365),
  prazoMaterialDias: inteiroOpcional("Prazo do material", 1, 365),
  prazoExecucaoDias: inteiroOpcional("Prazo da execução", 1, 365),
  prazoVidrosDias: inteiroOpcional("Prazo dos vidros e finalização", 1, 365),
  validadeTexto: texto(200).optional(),
  validadeAte: data,
  condicaoId: idOpcional,
  condicaoTextoLivre: texto(500).optional(),
  /** Várias linhas, uma informação por linha (favorecido, banco, agência, conta, Pix). */
  dadosPagamento: textoEmLinhas(LIMITE_DADOS_PAGAMENTO),
  notas: z.array(texto(1000).min(1)).max(40, "No máximo 40 notas."),
  exibirValorPorItem: z.boolean(),
  descricoesMaiusculas: z.boolean(),
  observacoesInternas: texto(2000).optional(),
  parcelas: z.array(parcelaPropostaSchema).max(24),
  /** Nome da forma principal quando há formas extras (ex.: "À vista"). */
  nomePagamentoPrincipal: texto(60).optional(),
  alternativas: z.array(alternativaPropostaSchema).max(MAXIMO_FORMAS_PAGAMENTO - 1, `No máximo ${MAXIMO_FORMAS_PAGAMENTO} formas de pagamento por proposta.`).default([]),
});
export type EntradaProposta = z.input<typeof propostaSchema>;

/** Valida o cronograma digitado (soma 100%, gatilhos, cartão) e o converte para o domínio. */
export function lerCronograma(parcelas: z.output<typeof parcelaPropostaSchema>[]): { parcelas: (ParcelaPlanejada & { ordem: number })[] } | { erro: string } {
  const lidas: (ParcelaPlanejada & { ordem: number })[] = [];
  for (const [i, p] of parcelas.entries()) {
    const percentualPb = percentualParaPontosBase(p.percentual);
    if (percentualPb === null || percentualPb <= 0 || percentualPb > 10000) return { erro: `Parcela ${i + 1}: informe o percentual entre 0,01 e 100.` };
    const dias = p.diasApos ? Number(p.diasApos) : null;
    if (p.diasApos && !/^\d{1,3}$/.test(p.diasApos)) return { erro: `Parcela ${i + 1}: informe os dias como número inteiro.` };
    const cartao = p.parcelasCartao ? Number(p.parcelasCartao) : null;
    if (p.parcelasCartao && (!/^\d{1,2}$/.test(p.parcelasCartao) || (cartao as number) > MAXIMO_PARCELAS_CARTAO)) {
      return { erro: `Parcela ${i + 1}: o cartão aceita de 1 a ${MAXIMO_PARCELAS_CARTAO} parcelas.` };
    }
    lidas.push({
      ordem: i + 1,
      descricao: p.descricao,
      percentualPb,
      gatilho: p.gatilho,
      forma: p.forma,
      diasApos: p.gatilho === "DIAS_APOS_APROVACAO" ? dias : null,
      dataFixa: p.gatilho === "DATA_FIXA" ? p.dataFixa : null,
      parcelasCartao: p.forma === "CARTAO_CREDITO" ? cartao : null,
    });
  }
  if (lidas.length === 0) return { parcelas: [] };
  const v = validarParcelas(lidas);
  return v.ok ? { parcelas: lidas } : { erro: v.erro };
}

export type AlternativaLida = {
  nome: string;
  condicaoId: string | null;
  textoLivre: string | null;
  modoAjuste: "PERCENTUAL" | "TOTAL_DIGITADO";
  ajustePb: number;
  repasseCartao: boolean;
  parcelas: (ParcelaPlanejada & { ordem: number })[];
  totais: { opcaoId: string; baseCentavos: number }[];
};

/** Lê as formas de pagamento extras digitadas (cronograma, ajuste com sinal, totais por opção). Erros em português simples. */
export function lerAlternativas(lista: z.output<typeof alternativaPropostaSchema>[], nomePrincipal: string): { alternativas: AlternativaLida[] } | { erro: string } {
  const nomes = new Set<string>([nomePrincipal.trim().toLowerCase()]);
  const lidas: AlternativaLida[] = [];
  for (const a of lista) {
    const chave = a.nome.trim().toLowerCase();
    if (nomes.has(chave)) return { erro: `Há duas formas de pagamento com o nome "${a.nome}". Dê nomes diferentes.` };
    nomes.add(chave);
    const cron = lerCronograma(a.parcelas);
    if ("erro" in cron) return { erro: `Forma "${a.nome}": ${cron.erro}` };
    const livre = (a.textoLivre ?? "").trim();
    if (cron.parcelas.length > 0 && livre) return { erro: `Forma "${a.nome}": uma condição com texto livre não tem parcelas.` };
    if (cron.parcelas.length === 0 && !livre) return { erro: `Forma "${a.nome}": escolha as parcelas ou escreva o texto livre (ex.: a combinar).` };
    let ajustePb = 0;
    if (a.modoAjuste === "PERCENTUAL" && (a.ajuste ?? "") !== "") {
      const pb = lerEscalado(a.ajuste as string, { casas: 2, negativo: true });
      if (pb === null) return { erro: `Forma "${a.nome}": informe o ajuste em %, por exemplo -5 ou 7,5.` };
      if (Math.abs(pb) > AJUSTE_MAXIMO_PB) return { erro: `Forma "${a.nome}": o ajuste pode ir de -50% a +50%.` };
      ajustePb = pb;
    }
    const totais: { opcaoId: string; baseCentavos: number }[] = [];
    if (a.modoAjuste === "TOTAL_DIGITADO") {
      const vistas = new Set<string>();
      for (const t of a.totais) {
        if (vistas.has(t.opcaoId)) return { erro: `Forma "${a.nome}": o total da mesma opção foi informado mais de uma vez.` };
        vistas.add(t.opcaoId);
        const c = valorParaCentavos(t.total);
        if (c !== null && c > MAXIMO_CENTAVOS) return { erro: `Forma "${a.nome}": o total passa do limite que o sistema aceita.` };
        if (c === null || c <= 0) return { erro: `Forma "${a.nome}": informe o total em reais maior que zero, por exemplo 16.200,00.` };
        totais.push({ opcaoId: t.opcaoId, baseCentavos: c });
      }
    }
    lidas.push({ nome: a.nome, condicaoId: a.condicaoId, textoLivre: livre || null, modoAjuste: a.modoAjuste, ajustePb, repasseCartao: a.repasseCartao, parcelas: cron.parcelas, totais });
  }
  return { alternativas: lidas };
}

export const idsSchema = z.array(campoIdObrigatorio()).min(1).max(50);
