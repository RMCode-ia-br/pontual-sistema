import { describe, expect, it } from "vitest";
import { z } from "zod";

import { alternativaPropostaSchema, lerAlternativas, propostaSchema } from "@/modules/propostas/schemas";

type Entrada = z.input<typeof alternativaPropostaSchema>;
const parcela = (percentual: string, extra: Record<string, unknown> = {}) => ({ descricao: "Parcela", percentual, gatilho: "CONFIRMACAO" as const, ...extra });
const alt = (extra: Partial<Entrada> = {}): Entrada => ({
  nome: "10x no cartão",
  modoAjuste: "PERCENTUAL",
  repasseCartao: true,
  parcelas: [parcela("100", { forma: "CARTAO_CREDITO", parcelasCartao: "10" })],
  totais: [],
  ...extra,
});
const ler = (lista: Entrada[], principal = "Forma A") => lerAlternativas(z.array(alternativaPropostaSchema).parse(lista), principal);

describe("lerAlternativas", () => {
  it("lê cartão em 10x com acréscimo e a marca de repasse", () => {
    const r = ler([alt({ ajuste: "12,95" })]);
    expect(r).toMatchObject({ alternativas: [{ nome: "10x no cartão", modoAjuste: "PERCENTUAL", ajustePb: 1295, repasseCartao: true }] });
    expect("alternativas" in r && r.alternativas[0].parcelas[0]).toMatchObject({ percentualPb: 10000, forma: "CARTAO_CREDITO", parcelasCartao: 10 });
  });

  it("ajuste negativo (desconto), zero e vazio valem", () => {
    expect("alternativas" in ler([alt({ ajuste: "-5" })]) && (ler([alt({ ajuste: "-5" })]) as { alternativas: { ajustePb: number }[] }).alternativas[0].ajustePb).toBe(-500);
    for (const zero of ["0", "0,00", "", undefined]) {
      const r = ler([alt({ ajuste: zero })]);
      expect("alternativas" in r && r.alternativas[0].ajustePb, String(zero)).toBe(0);
    }
  });

  it("ajuste: ponto decimal e vírgula são lidos certo; lixo é recusado", () => {
    expect((ler([alt({ ajuste: "2.5" })]) as { alternativas: { ajustePb: number }[] }).alternativas[0].ajustePb).toBe(250);
    expect((ler([alt({ ajuste: "-2,5" })]) as { alternativas: { ajustePb: number }[] }).alternativas[0].ajustePb).toBe(-250);
    for (const ruim of ["abc", "5%", "1,234", "--5", "5,"]) expect("erro" in ler([alt({ ajuste: ruim })]), ruim).toBe(true);
  });

  it("ajuste de -50 a +50", () => {
    expect("erro" in ler([alt({ ajuste: "50" })])).toBe(false);
    expect("erro" in ler([alt({ ajuste: "-50" })])).toBe(false);
    expect("erro" in ler([alt({ ajuste: "50,01" })])).toBe(true);
    expect("erro" in ler([alt({ ajuste: "-50,01" })])).toBe(true);
  });

  it("modo total digitado: lê o dinheiro por opção e ignora o ajuste", () => {
    const r = ler([alt({ modoAjuste: "TOTAL_DIGITADO", ajuste: "99", totais: [{ opcaoId: "o1", total: "16.200,00" }, { opcaoId: "o2", total: "17350" }] })]);
    expect(r).toMatchObject({ alternativas: [{ ajustePb: 0, totais: [{ opcaoId: "o1", baseCentavos: 1_620_000 }, { opcaoId: "o2", baseCentavos: 1_735_000 }] }] });
  });

  it("total digitado zero ou ilegível é recusado", () => {
    for (const ruim of ["0,00", "abc", "-5"]) expect("erro" in ler([alt({ modoAjuste: "TOTAL_DIGITADO", totais: [{ opcaoId: "o1", total: ruim }] })]), ruim).toBe(true);
  });

  it("cartão de 1 a 12 parcelas", () => {
    expect("erro" in ler([alt({ parcelas: [parcela("100", { forma: "CARTAO_CREDITO", parcelasCartao: "12" })] })])).toBe(false);
    expect("erro" in ler([alt({ parcelas: [parcela("100", { forma: "CARTAO_CREDITO", parcelasCartao: "13" })] })])).toBe(true);
  });

  it("as parcelas precisam somar 100%, e a forma precisa de parcelas OU texto livre", () => {
    expect("erro" in ler([alt({ parcelas: [parcela("50"), parcela("40")] })])).toBe(true);
    expect("erro" in ler([alt({ parcelas: [] })])).toBe(true);
    expect("erro" in ler([alt({ parcelas: [], textoLivre: "A combinar" })])).toBe(false);
    expect("erro" in ler([alt({ textoLivre: "A combinar" })])).toBe(true);
  });

  it("à vista 50% + 50% (sinal e restante na instalação)", () => {
    const r = ler([alt({ nome: "À vista", repasseCartao: false, ajuste: "-5,2", parcelas: [parcela("50"), parcela("50", { gatilho: "ENTREGA_E_INSTALACAO" })] })]);
    expect(r).toMatchObject({ alternativas: [{ ajustePb: -520, repasseCartao: false }] });
  });

  it("nomes repetidos (inclusive o da forma principal) são recusados", () => {
    expect("erro" in ler([alt({ nome: "Cartão" }), alt({ nome: "cartão" })])).toBe(true);
    expect("erro" in ler([alt({ nome: "À vista" })], "à vista")).toBe(true);
    expect("erro" in ler([alt({ nome: "Cartão 3x" }), alt({ nome: "Cartão 6x" })], "À vista")).toBe(false);
  });
});

describe("propostaSchema: formas de pagamento", () => {
  const base = {
    id: "a".repeat(25),
    data: "2026-11-24",
    clienteNome: "Cliente",
    tituloEscopo: "Escopo",
    comNotaFiscal: false,
    modoPrazo: "NENHUM" as const,
    notas: [],
    exibirValorPorItem: true,
    descricoesMaiusculas: true,
    parcelas: [],
  };

  it("sem alternativas é o que sempre foi (padrão vazio)", () => {
    const r = propostaSchema.safeParse(base);
    expect(r.success && r.data.alternativas).toEqual([]);
  });

  it("no máximo 5 formas no total (4 extras)", () => {
    expect(propostaSchema.safeParse({ ...base, alternativas: [alt(), alt(), alt(), alt()] }).success).toBe(true);
    const r = propostaSchema.safeParse({ ...base, alternativas: [alt(), alt(), alt(), alt(), alt()] });
    expect(r.success).toBe(false);
  });
});
