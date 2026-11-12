/**
 * Casos reais da Pontual (propostas 1127-26 e 1157-26, a "1257-26" no nome do arquivo), transcritos dos PDFs
 * originais: tipologia, medidas, quantidades e PREÇOS de cada item. Ficam de fora, de propósito, nome, telefone,
 * e-mail e endereço do cliente, e os nomes de ambientes da casa (o "local" aqui é neutro).
 *
 * Observações sobre os originais (não "corrigidas" aqui, só registradas):
 * - 1127-26: o PDF imprime total R$ 89.145,00 por erro de soma manual; os itens somam R$ 89.725,00.
 * - 1127-26: a numeração impressa repete 19 e 20 (os itens são 22); o sistema numera sozinho de 1 a 22.
 * - 1157-26: guarda-corpo lista "altura X comprimento" (1050 X 2200); aqui o comprimento vai em `larguraMm`
 *   (cobrança por metro linear = largura × quantidade) e a altura em `alturaMm`.
 */

export type MedidaReal = { larguraMm: number; alturaMm: number; quantidade: number; local?: string };

export type ItemReal = {
  grupo: string | null;
  tipo: "JANELA" | "PORTA" | "BASCULA" | "PAINEL" | "BOX" | "GUARDA_CORPO";
  folhas?: number;
  faces?: number;
  acabamento?: string;
  torresCm?: number;
  cor: string;
  mm: number;
  medidas: MedidaReal[];
  valorCentavos: number;
  observacoes?: string;
};

const incolor = "INCOLOR";
const sup = (tipo: ItemReal["tipo"], medidas: MedidaReal[], valorCentavos: number, extra: Partial<ItemReal> = {}, mm = 6): ItemReal => ({
  grupo: null,
  tipo,
  cor: incolor,
  mm,
  medidas,
  valorCentavos,
  ...extra,
});

const m = (larguraMm: number, alturaMm: number, quantidade = 1, local?: string): MedidaReal => ({ larguraMm, alturaMm, quantidade, local });
const bascula = (l: number, a: number, grupo: string) => sup("BASCULA", [m(l, a)], 58000, { grupo, faces: 1, acabamento: "ANODIZADO PRETO" });

/** Proposta 1127-26 (Parte 01, esquadrias): 22 itens, soma R$ 89.725,00, pagamento 50% + 25% + 25%. */
export const ITENS_1127: ItemReal[] = [
  sup("JANELA", [m(1000, 1000, 2)], 198000, { grupo: "PARTE SUPERIOR", folhas: 2 }),
  sup("PORTA", [m(2100, 2200)], 410000, { grupo: "PARTE SUPERIOR", folhas: 2 }),
  sup("PORTA", [m(2100, 2200)], 410000, { grupo: "PARTE SUPERIOR", folhas: 2 }),
  bascula(700, 700, "PARTE SUPERIOR"),
  sup("JANELA", [m(1300, 1750)], 216000, { grupo: "PARTE SUPERIOR", folhas: 2 }),
  bascula(700, 700, "PARTE SUPERIOR"),
  sup("PORTA", [m(2100, 2200)], 410000, { grupo: "PARTE SUPERIOR", folhas: 2 }),
  bascula(700, 700, "PARTE SUPERIOR"),
  sup("PAINEL", [m(2000, 1500)], 242000, { grupo: "ESCADA" }, 8),
  sup("JANELA", [m(2000, 2000)], 380000, { grupo: "PARTE INFERIOR", folhas: 2 }),
  bascula(850, 400, "PARTE INFERIOR"),
  sup("JANELA", [m(1300, 2000)], 247000, { grupo: "PARTE INFERIOR", folhas: 2 }),
  bascula(700, 700, "PARTE INFERIOR"),
  sup("JANELA", [m(1300, 1800)], 222500, { grupo: "PARTE INFERIOR", folhas: 2 }),
  bascula(600, 600, "PARTE INFERIOR"),
  sup("JANELA", [m(1300, 1800)], 222500, { grupo: "PARTE INFERIOR", folhas: 2 }),
  bascula(600, 600, "PARTE INFERIOR"),
  sup("PAINEL", [m(1500, 3600), m(1500, 2600)], 753500, { grupo: "SALA FRENTE", observacoes: "O PAINEL LATERAL SERÁ DE 02 FOLHAS" }, 8),
  sup("JANELA", [m(2000, 3600), m(2000, 2600)], 1120000, { grupo: "SALA FRENTE", folhas: 3, observacoes: "A JANELA LATERAL SERÁ DE 02 FOLHAS" }),
  sup("JANELA", [m(2000, 1800, 2), m(2000, 2150)], 1090000, { grupo: "SALA FRENTE", folhas: 2 }),
  sup("PORTA", [m(2500, 5800), m(2500, 2900)], 2480000, { grupo: "SALA FRENTE", folhas: 4 }),
  sup("JANELA", [m(1100, 1500)], 165000, { grupo: "SALA FRENTE", folhas: 2 }),
];

/** Proposta 1157-26 (Parte 02, boxes e guarda-corpo): 3 itens, soma R$ 19.830,00, pagamento 50% + 50%. */
export const ITENS_1157: ItemReal[] = [
  {
    grupo: null,
    tipo: "BOX",
    folhas: 3,
    acabamento: "PRETO",
    cor: incolor,
    mm: 8,
    medidas: [m(2100, 2470, 1, "(A) PRETO"), m(2100, 1740, 1, "(B) BRILHANTE")],
    valorCentavos: 413000,
  },
  { grupo: null, tipo: "BOX", folhas: 2, acabamento: "BRILHANTE", cor: incolor, mm: 8, medidas: [m(2100, 1400, 7)], valorCentavos: 905000 },
  {
    grupo: null,
    tipo: "GUARDA_CORPO",
    torresCm: 40,
    cor: incolor,
    mm: 10,
    // Corredor: 1 peça de 2.200 e 2 de 2.000; escada: 1 de 3.300 (altura 1.050 em todas).
    medidas: [m(2200, 1050, 1, "CORREDOR"), m(2000, 1050, 2, "CORREDOR"), m(3300, 1050, 1, "ESCADA")],
    valorCentavos: 665000,
    observacoes: "GUARDA CORPO DA ESCADA VIA MOLDE.",
  },
];

export const TOTAL_1127_CENTAVOS = 8972500;
export const TOTAL_IMPRESSO_ERRADO_1127_CENTAVOS = 8914500;
export const TOTAL_1157_CENTAVOS = 1983000;
