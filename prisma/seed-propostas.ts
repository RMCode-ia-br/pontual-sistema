/**
 * Dados e semeadura da Fase 3 (Propostas): tipologias (seção 13, templates do Apêndice B) e condições de
 * pagamento. Sem preços e sem composições reais (nada é inventado): a única composição é a tipologia de
 * EXEMPLO, desativada. Idempotente: quem já existe (inclusive na lixeira) não é recriado nem alterado.
 */
import type { PrismaClient } from "../src/generated/prisma/client";

type TipologiaSeed = {
  nome: string;
  categoria: "JANELA" | "PORTA" | "BOX" | "GUARDA_CORPO" | "FECHAMENTO_SACADA" | "PORTAO" | "PERGOLADO" | "ESPELHO" | "OUTRO";
  tipoDesenho:
    | "JANELA_CORRER"
    | "PORTA_CORRER"
    | "BASCULA"
    | "PAINEL_FIXO"
    | "PORTA_GIRO"
    | "BOX_FRONTAL"
    | "GUARDA_CORPO"
    | "FECHAMENTO_SACADA"
    | "PORTAO"
    | "PERGOLADO"
    | "ESPELHO";
  opcoesFolhas: number[];
  templateDescricao: string;
  /** Sem template no Apêndice B: texto genérico no mesmo estilo, que o Marcelo precisa conferir. */
  revisarTexto: boolean;
  cobrancaPadrao: "POR_M2" | "POR_UNIDADE" | "POR_METRO_LINEAR";
  exigeEsquadria: boolean;
  /** Só o guarda-corpo vem como VIDRO_TEMPERADO (100%, informado pelo dono); as demais categorias aguardam confirmação. */
  categoriaMarkup?: "PADRAO" | "VIDRO_TEMPERADO";
};

const ACESSORIOS_PADRAO = "COMPLETA(S) E INSTALADA(S) COM TODOS OS ACESSÓRIOS PADRÃO PARA SEU FUNCIONAMENTO";
const ACESSORIOS_NECESSARIOS = "COMPLETA(S) E INSTALADA(S) COM TODOS OS ACESSÓRIOS NECESSÁRIOS PARA SEU FUNCIONAMENTO";

export const TIPOLOGIAS: TipologiaSeed[] = [
  {
    nome: "Janela de correr",
    categoria: "JANELA",
    tipoDesenho: "JANELA_CORRER",
    opcoesFolhas: [2, 3, 4],
    templateDescricao: `JANELA(S) DE CORRER COM {FOLHAS} FOLHAS EM ALUMÍNIO LINHA {LINHA}, COM VIDRO TEMPERADO {COR} DE {MM}MM, ${ACESSORIOS_PADRAO}, MED. {MEDIDAS}`,
    revisarTexto: false,
    cobrancaPadrao: "POR_M2",
    exigeEsquadria: true,
  },
  {
    nome: "Porta de correr",
    categoria: "PORTA",
    tipoDesenho: "PORTA_CORRER",
    opcoesFolhas: [2, 4],
    templateDescricao: `PORTA(S) DE CORRER COM {FOLHAS} FOLHAS EM ALUMÍNIO LINHA {LINHA}, COM VIDRO TEMPERADO {COR} DE {MM}MM, ${ACESSORIOS_PADRAO}, MED. {MEDIDAS}`,
    revisarTexto: false,
    cobrancaPadrao: "POR_M2",
    exigeEsquadria: true,
  },
  {
    nome: "Báscula",
    categoria: "JANELA",
    tipoDesenho: "BASCULA",
    opcoesFolhas: [],
    templateDescricao: `BÁSCULA(S) EM ALUMÍNIO {ACABAMENTO}, LINHA {LINHA}, COM {FACES}, COM VIDRO TEMPERADO {COR} DE {MM}MM, ${ACESSORIOS_NECESSARIOS}, MED. {MEDIDAS}`,
    revisarTexto: false,
    cobrancaPadrao: "POR_UNIDADE",
    exigeEsquadria: true,
  },
  {
    nome: "Painel fixo",
    categoria: "JANELA",
    tipoDesenho: "PAINEL_FIXO",
    opcoesFolhas: [],
    templateDescricao: "PAINEL(IS) FIXO(S) EM VIDRO TEMPERADO {COR} DE {MM}MM, COM PERFIS EM ALUMÍNIO (LINHA {LINHA}), MED. {MEDIDAS}",
    revisarTexto: false,
    cobrancaPadrao: "POR_M2",
    exigeEsquadria: true,
  },
  {
    nome: "Porta de giro",
    categoria: "PORTA",
    tipoDesenho: "PORTA_GIRO",
    opcoesFolhas: [1, 2],
    templateDescricao: `PORTA(S) DE GIRO EM ALUMÍNIO LINHA {LINHA}, COM VIDRO TEMPERADO {COR} DE {MM}MM, ${ACESSORIOS_NECESSARIOS}, MED. {MEDIDAS}`,
    revisarTexto: true,
    cobrancaPadrao: "POR_M2",
    exigeEsquadria: true,
  },
  {
    nome: "Box frontal de correr",
    categoria: "BOX",
    tipoDesenho: "BOX_FRONTAL",
    opcoesFolhas: [2, 3, 4],
    templateDescricao:
      "BOX FRONTAL EM VIDROS TEMPERADOS {COR} DE {MM}MM, DE CORRER COM {FOLHAS} FOLHAS, COMPLETO E INSTALADO COM PERFIS EM ALUMÍNIO {ACABAMENTO}, PUXADOR DE ALÇA COM 30CM E TODOS OS ACESSÓRIOS NECESSÁRIOS PARA SEU FUNCIONAMENTO, MED. {MEDIDAS}",
    revisarTexto: false,
    cobrancaPadrao: "POR_M2",
    exigeEsquadria: false,
  },
  {
    nome: "Guarda-corpo",
    categoria: "GUARDA_CORPO",
    tipoDesenho: "GUARDA_CORPO",
    opcoesFolhas: [],
    templateDescricao: "GUARDA CORPO EM VIDROS TEMPERADOS {COR} DE {MM}MM COM TORRES DE {TORRES_CM}CM EM INOX COM CONECTORES DE FIXAÇÃO.",
    revisarTexto: false,
    cobrancaPadrao: "POR_METRO_LINEAR",
    exigeEsquadria: false,
    categoriaMarkup: "VIDRO_TEMPERADO",
  },
  {
    nome: "Fechamento de sacada",
    categoria: "FECHAMENTO_SACADA",
    tipoDesenho: "FECHAMENTO_SACADA",
    opcoesFolhas: [],
    templateDescricao:
      "FECHAMENTO(S) DE SACADA EM ALUMÍNIO LINHA {LINHA}, COM VIDRO TEMPERADO {COR} DE {MM}MM, COMPLETO(S) E INSTALADO(S) COM TODOS OS ACESSÓRIOS NECESSÁRIOS PARA SEU FUNCIONAMENTO, MED. {MEDIDAS}",
    revisarTexto: true,
    cobrancaPadrao: "POR_M2",
    exigeEsquadria: true,
  },
  {
    nome: "Portão",
    categoria: "PORTAO",
    tipoDesenho: "PORTAO",
    opcoesFolhas: [],
    templateDescricao:
      "PORTÃO(ÕES) EM ALUMÍNIO {ACABAMENTO}, LINHA {LINHA}, COMPLETO(S) E INSTALADO(S) COM TODOS OS ACESSÓRIOS NECESSÁRIOS PARA SEU FUNCIONAMENTO, MED. {MEDIDAS}",
    revisarTexto: true,
    cobrancaPadrao: "POR_M2",
    exigeEsquadria: true,
  },
  {
    nome: "Pergolado",
    categoria: "PERGOLADO",
    tipoDesenho: "PERGOLADO",
    opcoesFolhas: [],
    templateDescricao: "PERGOLADO(S) EM ALUMÍNIO {ACABAMENTO}, LINHA {LINHA}, COMPLETO(S) E INSTALADO(S), MED. {MEDIDAS}",
    revisarTexto: true,
    cobrancaPadrao: "POR_M2",
    exigeEsquadria: true,
  },
  {
    nome: "Espelho sem moldura",
    categoria: "ESPELHO",
    tipoDesenho: "ESPELHO",
    opcoesFolhas: [],
    templateDescricao: "ESPELHO(S) SEM MOLDURA DE {MM}MM, COM FIXAÇÃO E INSTALAÇÃO INCLUSAS, MED. {MEDIDAS}",
    revisarTexto: true,
    cobrancaPadrao: "POR_M2",
    exigeEsquadria: false,
  },
];

/** Tipologia de EXEMPLO (R2): desativada, sem custos. As fórmulas são ilustrativas e precisam ser validadas. */
export const TIPOLOGIA_EXEMPLO = {
  nome: "EXEMPLO — Janela de correr 2 folhas (validar com o Marcelo)",
  insumos: [
    { descricao: "Perfil de alumínio (exemplo)", unidade: "M" as const, formulaQuantidade: "(L/1000)*2 + (A/1000)*2", perdaPb: 500 },
    { descricao: "Vidro (exemplo)", unidade: "M2" as const, formulaQuantidade: "(L/1000)*(A/1000)", perdaPb: 0 },
    { descricao: "Kit de acessórios (exemplo)", unidade: "CJ" as const, formulaQuantidade: "F/2", perdaPb: 0 },
  ],
  maoDeObra: [
    { papel: "FABRICA" as const, base: "HORAS_POR_M2" as const, horasCentesimos: 100 },
    { papel: "INSTALACAO" as const, base: "HORAS_POR_UNIDADE" as const, horasCentesimos: 200 },
  ],
};

export type CondicaoSeed = {
  nome: string;
  textoLivre?: string;
  parcelas: {
    descricao: string;
    percentualPb: number;
    gatilho: "CONFIRMACAO" | "ENTREGA_MATERIAL" | "ENTREGA_E_INSTALACAO" | "DATA_FIXA" | "DIAS_APOS_APROVACAO";
    forma?: "PIX" | "TRANSFERENCIA" | "ESPECIE" | "CARTAO_CREDITO" | "BOLETO";
    parcelasCartao?: number;
  }[];
};

/** Condições da seção 13. Percentuais em pontos-base (50% = 5000). */
export const CONDICOES_PAGAMENTO: CondicaoSeed[] = [
  {
    nome: "50% sinal + 25% entrega do material + 25% entrega dos vidros e instalação",
    parcelas: [
      { descricao: "Sinal na confirmação do pedido", percentualPb: 5000, gatilho: "CONFIRMACAO" },
      { descricao: "Na entrega do material (esquadrias)", percentualPb: 2500, gatilho: "ENTREGA_MATERIAL" },
      { descricao: "Na entrega dos vidros e instalação", percentualPb: 2500, gatilho: "ENTREGA_E_INSTALACAO" },
    ],
  },
  {
    nome: "50% sinal + 50% na entrega e instalação",
    parcelas: [
      { descricao: "Sinal na confirmação do pedido", percentualPb: 5000, gatilho: "CONFIRMACAO" },
      { descricao: "Na entrega e instalação", percentualPb: 5000, gatilho: "ENTREGA_E_INSTALACAO" },
    ],
  },
  {
    nome: "À vista (PIX, transferência ou espécie)",
    parcelas: [{ descricao: "À vista na confirmação do pedido", percentualPb: 10000, gatilho: "CONFIRMACAO" }],
  },
  {
    nome: "Cartão de crédito em até 12x",
    parcelas: [
      { descricao: "Cartão de crédito em até 12x, sem juros", percentualPb: 10000, gatilho: "CONFIRMACAO", forma: "CARTAO_CREDITO", parcelasCartao: 12 },
    ],
  },
  { nome: "A combinar", textoLivre: "Forma de pagamento a combinar com o cliente.", parcelas: [] },
];

export async function semearPropostas(prisma: PrismaClient): Promise<string> {
  const nomes = [...TIPOLOGIAS.map((t) => t.nome), TIPOLOGIA_EXEMPLO.nome];
  const existentes = await prisma.tipologia.findMany({ where: { nome: { in: nomes } }, select: { nome: true } });
  const jaTem = new Set(existentes.map((t) => t.nome.toLowerCase()));

  let tipologiasCriadas = 0;
  for (const [ordem, t] of TIPOLOGIAS.entries()) {
    if (jaTem.has(t.nome.toLowerCase())) continue;
    await prisma.tipologia.create({ data: { ...t, ordem } });
    tipologiasCriadas++;
  }
  if (!jaTem.has(TIPOLOGIA_EXEMPLO.nome.toLowerCase())) {
    await prisma.tipologia.create({
      data: {
        nome: TIPOLOGIA_EXEMPLO.nome,
        categoria: "JANELA",
        tipoDesenho: "JANELA_CORRER",
        opcoesFolhas: [2],
        templateDescricao: TIPOLOGIAS[0].templateDescricao,
        exemplo: true,
        ativo: false,
        ordem: 999,
        insumos: { create: TIPOLOGIA_EXEMPLO.insumos.map((i, ordem) => ({ ...i, ordem })) },
        maoDeObra: { create: TIPOLOGIA_EXEMPLO.maoDeObra.map((m, ordem) => ({ ...m, ordem })) },
      },
    });
    tipologiasCriadas++;
  }

  const condicoes = await prisma.condicaoPagamento.findMany({ select: { nome: true } });
  const condicoesExistentes = new Set(condicoes.map((c) => c.nome.toLowerCase()));
  let condicoesCriadas = 0;
  for (const [ordem, c] of CONDICOES_PAGAMENTO.entries()) {
    if (condicoesExistentes.has(c.nome.toLowerCase())) continue;
    await prisma.condicaoPagamento.create({
      data: {
        nome: c.nome,
        textoLivre: c.textoLivre,
        ordem,
        parcelas: { create: c.parcelas.map((p, i) => ({ ...p, ordem: i + 1 })) },
      },
    });
    condicoesCriadas++;
  }
  return `propostas: ${tipologiasCriadas} tipologia(s) e ${condicoesCriadas} condição(ões) de pagamento criada(s)`;
}
