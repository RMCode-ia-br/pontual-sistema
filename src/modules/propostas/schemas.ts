import { z } from "zod";

import { FORMAS_PAGAMENTO, GATILHOS, MAXIMO_PARCELAS_CARTAO, validarParcelas, type ParcelaPlanejada } from "@/lib/dominio/parcelas";
import { valorParaCentavos } from "@/lib/dominio/numeros";
import { percentualParaPontosBase } from "@/lib/dominio/preco";
import { campoIdObrigatorio } from "@/lib/validadores/campos";

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
  dadosPagamento: texto(500).optional(),
  notas: z.array(texto(1000).min(1)).max(40, "No máximo 40 notas."),
  exibirValorPorItem: z.boolean(),
  descricoesMaiusculas: z.boolean(),
  observacoesInternas: texto(2000).optional(),
  parcelas: z.array(parcelaPropostaSchema).max(24),
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

export const idsSchema = z.array(campoIdObrigatorio()).min(1).max(50);
