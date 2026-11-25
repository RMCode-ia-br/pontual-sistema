import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { montarFormasDePagamento } from "@/lib/dominio/alternativas-pagamento";
import { PropostaPdf } from "@/modules/propostas/pdf/proposta-pdf";
import type { ConteudoProposta } from "@/modules/propostas/conteudo";

import { conteudoDeExemplo } from "./fixtures-proposta";

type Documento = Parameters<typeof renderToBuffer>[0];
const pdftotext = ["pdftotext", "C:/Program Files/Git/ucrt64/bin/pdftotext.exe"].find((c) => spawnSync(c, ["-v"], { stdio: "ignore" }).error === undefined);
const GOLDEN = join(__dirname, "golden");

/** Texto do PDF (uma linha do papel por linha; "\f" separa as páginas), como `pdftotext` o extrai. */
async function textoDoPdf(c: ConteudoProposta): Promise<string> {
  const pdf = await renderToBuffer(createElement(PropostaPdf, { c, logo: null }) as unknown as Documento);
  const dir = mkdtempSync(join(tmpdir(), "pdf-formas-"));
  try {
    const arquivo = join(dir, "proposta.pdf");
    writeFileSync(arquivo, pdf);
    return execFileSync(pdftotext!, ["-raw", "-enc", "UTF-8", arquivo, "-"], { encoding: "utf8" }).replace(/\r\n/g, "\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Compara com o texto gravado ANTES da Fase 3.6a (`GRAVAR_GOLDEN=1` regrava; só use isso numa versão sem formas extras). */
function conferirComGolden(nome: string, texto: string) {
  const arquivo = join(GOLDEN, `${nome}.txt`);
  if (process.env.GRAVAR_GOLDEN) {
    mkdirSync(GOLDEN, { recursive: true });
    writeFileSync(arquivo, texto, "utf8");
    return;
  }
  expect(existsSync(arquivo), `falta o texto gravado ${nome}.txt`).toBe(true);
  expect(texto).toBe(readFileSync(arquivo, "utf8"));
}

/** Propostas "antigas" (sem formas extras), cobrindo cada ramo do bloco de pagamento de hoje. */
const CASOS: Record<string, () => ConteudoProposta> = {
  "uma-opcao-50-25-25": () =>
    conteudoDeExemplo([
      { descricao: "BOX FRONTAL EM VIDROS TEMPERADOS INCOLOR DE 8MM", valorCentavos: 413000, tipoDesenho: "BOX_FRONTAL", grupo: "BOX" },
      { descricao: "GUARDA CORPO EM VIDROS TEMPERADOS INCOLOR DE 10MM", valorCentavos: 270000, tipoDesenho: "GUARDA_CORPO", grupo: "GUARDA CORPO" },
    ]),
  "duas-opcoes-com-nota-e-desconto": () => conteudoDeExemplo([{ descricao: "PORTA", valorCentavos: 100000 }], [{ nome: "Linha Suprema" }, { nome: "Linha Gold", descontoCentavos: 5000 }], { comNotaFiscal: true }),
  "texto-livre-a-combinar": () => {
    const c = conteudoDeExemplo([{ descricao: "JANELA", valorCentavos: 250000 }]);
    c.pagamento = { ...c.pagamento, condicaoNome: "A combinar", textoLivre: "A combinar", parcelas: [] };
    return c;
  },
  "cartao-ate-12x": () => {
    const c = conteudoDeExemplo([{ descricao: "JANELA", valorCentavos: 250000 }]);
    c.pagamento = { ...c.pagamento, condicaoNome: "Cartão", parcelas: [{ descricao: "No cartão", percentualPb: 10000, gatilho: "CONFIRMACAO", forma: "CARTAO_CREDITO", diasApos: null, dataFixa: null, parcelasCartao: 12 }] };
    return c;
  },
};

describe.skipIf(pdftotext === undefined)("PDF sem formas extras é IDÊNTICO ao de antes da Fase 3.6a (texto extraído igual)", () => {
  for (const [nome, montar] of Object.entries(CASOS)) {
    it(nome, async () => {
      conferirComGolden(nome, await textoDoPdf(montar()));
    }, 60_000);
  }

  it("snapshot antigo (sem o campo novo) e snapshot com a lista vazia saem iguais", async () => {
    for (const [nome, montar] of Object.entries(CASOS)) {
      const antigo = montar();
      expect("formasPagamento" in antigo, nome).toBe(false);
      const vazio = { ...montar(), formasPagamento: [] } as ConteudoProposta;
      expect(await textoDoPdf(vazio), nome).toBe(await textoDoPdf(antigo));
    }
  }, 120_000);
});

// ----- Com formas extras: quadros verticais em no máximo duas colunas, com quebra de página -----

type Palavra = { pagina: number; x: number; y: number; texto: string };

/**
 * Palavras do PDF com a posição aproximada: `pdftotext -layout` mantém as colunas lado a lado, então o deslocamento da palavra na
 * linha (x), o número da linha (y) e a página (quebra de pagina separa) dizem em que coluna e página cada uma caiu, sem olhar o desenho.
 */
function palavrasDoPdf(pdf: Buffer): Palavra[] {
  const dir = mkdtempSync(join(tmpdir(), "pdf-layout-"));
  try {
    const arquivo = join(dir, "proposta.pdf");
    writeFileSync(arquivo, pdf);
    const texto = execFileSync(pdftotext!, ["-layout", "-enc", "UTF-8", arquivo, "-"], { encoding: "utf8" }).replace(/\r\n/g, "\n");
    const palavras: Palavra[] = [];
    texto.split("\f").forEach((pagina, p) => {
      pagina.split("\n").forEach((linha, y) => {
        for (const m of linha.matchAll(/\S+/g)) palavras.push({ pagina: p + 1, x: m.index ?? 0, y, texto: m[0] });
      });
    });
    return palavras;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Agrupa posições próximas (até 8 caracteres de diferença) em colunas. */
function colunasDe(xs: number[]): number[][] {
  const ordenadas = [...xs].sort((a, b) => a - b);
  const grupos: number[][] = [];
  for (const x of ordenadas) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && x - ultimo[ultimo.length - 1] <= 8) ultimo.push(x);
    else grupos.push([x]);
  }
  return grupos;
}

const FORMAS_5 = [
  // Primeira palavra do nome de cada forma, como o PDF a escreve (maiúsculas).
  { nome: "À vista", marca: "VISTA" },
  { nome: "Transferência", marca: "TRANSFERÊNCIA" },
  { nome: "Cartão-3x", marca: "CARTÃO-3X" },
  { nome: "Cartão-10x", marca: "CARTÃO-10X" },
  { nome: "Boleto", marca: "BOLETO" },
];

/** 2 opções de produto (A: R$ 15.360,00; B: R$ 15.000,00 com desconto) e 5 formas de pagamento, com `itens` itens no escopo. */
function propostaCom5Formas(itens: number): ConteudoProposta {
  const lista = Array.from({ length: itens }, (_, i) => ({ descricao: `JANELA DE CORRER COM 02 FOLHAS EM ALUMÍNIO LINHA SUPREMA ${i + 1}`, valorCentavos: i === 0 ? 1_536_000 : 0, grupo: null as string | null }));
  const c = conteudoDeExemplo(lista, [{ nome: "Linha Suprema" }, { nome: "Linha Gold", descontoCentavos: 36_000 }]);
  const bases = c.opcoes.map((o) => ({ id: o.id, nome: o.nome, baseCentavos: o.totais.itensCentavos - o.totais.descontoCentavos, acrescimoNotaCentavos: 0, totalCentavos: o.totais.totalCentavos }));
  const cartao = (n: number) => [{ descricao: "No cartão", percentualPb: 10000, gatilho: "CONFIRMACAO", forma: "CARTAO_CREDITO", diasApos: null, dataFixa: null, parcelasCartao: n }];
  const digitados = (porcentagem: number) => bases.map((b) => ({ opcaoId: b.id, baseCentavos: Math.round((b.baseCentavos * (100 + porcentagem)) / 100) }));
  const r = montarFormasDePagamento({
    nomePrincipal: "À vista",
    principal: { textoLivre: null, parcelas: c.pagamento.parcelas.slice(0, 1).map((p) => ({ ...p, percentualPb: 5000 })).concat([{ ...c.pagamento.parcelas[2], percentualPb: 5000 }]) },
    extras: [
      { nome: "Transferência", modoAjuste: "PERCENTUAL", ajustePb: -500, repasseCartao: false, textoLivre: null, parcelas: [{ descricao: "No Pix", percentualPb: 10000, gatilho: "CONFIRMACAO", forma: "PIX", diasApos: null, dataFixa: null, parcelasCartao: null }], totais: [] },
      { nome: "Cartão-3x", modoAjuste: "TOTAL_DIGITADO", ajustePb: 0, repasseCartao: true, textoLivre: null, parcelas: cartao(3), totais: digitados(5) },
      { nome: "Cartão-10x", modoAjuste: "TOTAL_DIGITADO", ajustePb: 0, repasseCartao: true, textoLivre: null, parcelas: cartao(10), totais: digitados(13) },
      { nome: "Boleto", modoAjuste: "PERCENTUAL", ajustePb: 0, repasseCartao: false, textoLivre: "A combinar com o consultor", parcelas: [], totais: [] },
    ],
    opcoes: bases,
    comNotaFiscal: false,
    acrescimoNotaPb: 500,
  });
  if (!r.ok) throw new Error(r.problemas.join(" "));
  c.formasPagamento = r.formas;
  return c;
}

describe.skipIf(pdftotext === undefined)("PDF com 5 formas de pagamento e 2 opções de produto", () => {
  it("quadros em no máximo DUAS colunas, cada forma nas duas opções, valores certos e nenhum quadro partido entre páginas", async () => {
    const pdf = await renderToBuffer(createElement(PropostaPdf, { c: propostaCom5Formas(3), logo: null }) as unknown as Documento);
    if (process.env.SALVAR_PDF) writeFileSync(join(process.cwd(), "test-results", "pdf-formas-5x2.pdf"), pdf);
    const palavras = palavrasDoPdf(pdf);
    const texto = palavras.map((p) => p.texto).join(" ");

    // Cada forma aparece uma vez por opção de produto (2x), e "VALOR TOTAL" 10 vezes (5 formas × 2 opções).
    for (const f of FORMAS_5) expect(palavras.filter((p) => p.texto === f.marca), f.nome).toHaveLength(2);
    expect(palavras.filter((p) => p.texto === "VALOR")).toHaveLength(10);

    // No máximo duas colunas: a posição horizontal dos nomes das formas forma no máximo 2 grupos (nunca 3).
    const colunas = colunasDe(FORMAS_5.flatMap((f) => palavras.filter((p) => p.texto === f.marca).map((p) => p.x)));
    expect(colunas.length).toBeLessThanOrEqual(2);
    expect(colunas.length).toBe(2);

    // Valores: cartões da opção A (R$ 15.360,00): 3x +5% = 16.128,00 → 03X de 5.376,00; 10x +13% = 17.356,80 → 10X de 1.735,68.
    expect(texto).toContain("03X R$ 5.376,00 CARTÃO");
    expect(texto).toContain("10X R$ 1.735,68 CARTÃO");
    expect(texto).toContain("A COMBINAR COM O CONSULTOR");
    expect(texto).toContain("TOTAL R$ 14.592,00"); // Pix −5% sobre 15.360,00
  }, 60_000);

  it("com muitos itens o escopo empurra as formas para a quebra de página: nenhum quadro se parte (nome e valor na mesma página)", async () => {
    let achou = false;
    for (let itens = 6; itens <= 20 && !achou; itens++) {
      const pdf = await renderToBuffer(createElement(PropostaPdf, { c: propostaCom5Formas(itens), logo: null }) as unknown as Documento);
      const palavras = palavrasDoPdf(pdf);
      const paginasDasFormas = new Set(FORMAS_5.flatMap((f) => palavras.filter((p) => p.texto === f.marca).map((p) => p.pagina)));
      // Mesmo quando passa de uma página, cada nome de forma é seguido de "VALOR" na MESMA página.
      for (const f of FORMAS_5) {
        for (const nome of palavras.filter((p) => p.texto === f.marca)) {
          const seguinte = palavras.find((p) => p.texto === "VALOR" && (p.pagina > nome.pagina || (p.pagina === nome.pagina && p.y > nome.y)));
          expect(seguinte?.pagina, `${f.nome} com ${itens} itens`).toBe(nome.pagina);
        }
      }
      if (paginasDasFormas.size >= 2) {
        achou = true;
        if (process.env.SALVAR_PDF) writeFileSync(join(process.cwd(), "test-results", "pdf-formas-5x2-quebra.pdf"), pdf);
      }
    }
    expect(achou, "nenhuma quantidade de itens fez as formas atravessarem a quebra de página").toBe(true);
  }, 120_000);

  it("dados para pagamento e chave Pix continuam em peso normal e copiáveis, também com formas extras", async () => {
    const c = propostaCom5Formas(3);
    c.pagamento.dadosPagamento = "Favorecido: Pontual Soluções\nChave Pix: exemplo@pontual.com.br";
    const pdf = await renderToBuffer(createElement(PropostaPdf, { c, logo: null }) as unknown as Documento);
    const palavras = palavrasDoPdf(pdf).map((p) => p.texto);
    expect(palavras).toContain("exemplo@pontual.com.br");
    expect(palavras).toContain("Favorecido:");
  }, 60_000);
});

// ----- Casos reais do Marcelo: o PDF do sistema diz o que o PDF dele diz, sem diferença de centavo -----

describe.skipIf(pdftotext === undefined)("PDF das propostas 1260-26 e 1261-26: os mesmos valores do PDF do Marcelo", () => {
  const sinal = (percentualPb: number, gatilho: string) => ({ descricao: gatilho === "CONFIRMACAO" ? "Sinal na confirmação" : "Restante na instalação", percentualPb, gatilho, forma: null, diasApos: null, dataFixa: null, parcelasCartao: null });
  const cartao = (n: number) => [{ descricao: "No cartão", percentualPb: 10000, gatilho: "CONFIRMACAO", forma: "CARTAO_CREDITO", diasApos: null, dataFixa: null, parcelasCartao: n }];

  async function pdfDoCaso(itens: number[], cartoes: { n: number; total: number }[]) {
    const c = conteudoDeExemplo(itens.map((valorCentavos, i) => ({ descricao: `ITEM ${i + 1}`, valorCentavos, grupo: null })));
    const op = c.opcoes[0];
    const r = montarFormasDePagamento({
      nomePrincipal: "À vista",
      principal: { textoLivre: null, parcelas: [sinal(5000, "CONFIRMACAO"), sinal(5000, "ENTREGA_E_INSTALACAO")] },
      extras: cartoes.map((k) => ({ nome: `Cartão ${k.n}x`, modoAjuste: "TOTAL_DIGITADO" as const, ajustePb: 0, repasseCartao: true, textoLivre: null, parcelas: cartao(k.n), totais: [{ opcaoId: op.id, baseCentavos: k.total }] })),
      opcoes: [{ id: op.id, nome: op.nome, baseCentavos: op.totais.itensCentavos - op.totais.descontoCentavos, acrescimoNotaCentavos: 0, totalCentavos: op.totais.totalCentavos }],
      comNotaFiscal: false,
      acrescimoNotaPb: 500,
    });
    if (!r.ok) throw new Error(r.problemas.join(" "));
    c.formasPagamento = r.formas;
    return (await textoDoPdf(c)).replace(/\s/g, " ");
  }

  it("1260-26: valor total R$ 16.200,00 em 3x de 5.400,00, 6x de 2.775,00, 10x de 1.735,00 e à vista R$ 15.360,00 com sinal de 50%", async () => {
    const t = await pdfDoCaso([12 * 98_000, 255_000, 105_000], [{ n: 3, total: 1_620_000 }, { n: 6, total: 1_665_000 }, { n: 10, total: 1_735_000 }]);
    for (const esperado of ["VALOR TOTAL R$ 16.200,00", "03X R$ 5.400,00 CARTÃO", "06X R$ 2.775,00 CARTÃO", "10X R$ 1.735,00 CARTÃO", "VALOR TOTAL R$ 15.360,00", "50% (R$ 7.680,00)"]) expect(t, esperado).toContain(esperado);
    expect(t).not.toContain("(última"); // as parcelas do Marcelo são exatas: nenhuma diferença de centavo para a última
    expect(t.match(/50% \(R\$ 7\.680,00\)/g)).toHaveLength(2); // sinal e restante
  }, 60_000);

  it("1261-26: valor total R$ 10.620,00 em 3x de 3.540,00, 6x de 1.815,00, 10x de 1.135,00 e à vista R$ 10.050,00 com sinal de 50%", async () => {
    const t = await pdfDoCaso([465_000, 430_000, 110_000], [{ n: 3, total: 1_062_000 }, { n: 6, total: 1_089_000 }, { n: 10, total: 1_135_000 }]);
    for (const esperado of ["VALOR TOTAL R$ 10.620,00", "03X R$ 3.540,00 CARTÃO", "06X R$ 1.815,00 CARTÃO", "10X R$ 1.135,00 CARTÃO", "VALOR TOTAL R$ 10.050,00", "50% (R$ 5.025,00)"]) expect(t, esperado).toContain(esperado);
    expect(t).not.toContain("(última");
    expect(t.match(/50% \(R\$ 5\.025,00\)/g)).toHaveLength(2);
  }, 60_000);
});
