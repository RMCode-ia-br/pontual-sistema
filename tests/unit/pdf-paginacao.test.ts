import { renderToBuffer } from "@react-pdf/renderer";
import sharp from "sharp";
import { createElement } from "react";
import { beforeAll, describe, expect, it } from "vitest";

import { processarImagemDeDesenho } from "@/lib/imagem/processar";
import type { ConteudoProposta } from "@/modules/propostas/conteudo";
import type { ImagensDoDesenho } from "@/modules/propostas/pdf/imagens";
import { ProducaoPdf } from "@/modules/propostas/pdf/producao-pdf";
import { PropostaPdf } from "@/modules/propostas/pdf/proposta-pdf";

import { conteudoDeExemplo } from "./fixtures-proposta";

/**
 * Fase 3.6b-3 (Bloco 5): paginação dos itens. O react-pdf empurra para a página seguinte um elemento que CABE quando o fim
 * dele mais a sua margem de baixo passa do limite da página ("presença" inclui a margem). O bloco da opção (itens + totais)
 * tinha `marginBottom`: quando terminava nos últimos pontos da página, TODOS os itens iam para a página 2 e a página 1 ficava só
 * com o cabeçalho. Agora o espaço é `paddingBottom` (mesmo espaço visual, mas dentro da caixa, que então é dividida).
 *
 * Nenhum teste fixa tamanho de caixa nem número exato de páginas (as caixas são provisórias): só propriedades que valem
 * para qualquer tamanho. A janela do defeito tem poucos pontos de altura, por isso a altura é varrida em duas direções
 * (linhas do título/nome do cliente × linhas de observação do item 1), que dão passos diferentes.
 */
type Documento = Parameters<typeof renderToBuffer>[0];
type Modo = "sem" | "NORMAL" | "GRANDE";

let imagens: ImagensDoDesenho;
let img: Awaited<ReturnType<typeof processarImagemDeDesenho>>;

beforeAll(async () => {
  img = await processarImagemDeDesenho(await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#3366cc" } }).png().toBuffer()); // 4:3
  imagens = { [img.sha256]: { data: img.bytes, format: img.formato } };
});

const lista = (n: number) => Array.from({ length: n }, (_, i) => ({ descricao: `JANELA DE CORRER LINHA SUPREMA ${i + 1}`, valorCentavos: 100_000 + (i + 1) * 111, tipoDesenho: "BOX_FRONTAL", grupo: null as string | null }));

function montar(n: number, modo: Modo, linhasDoCabecalho = 0, linhasDeObservacao = 0): ConteudoProposta {
  const c = conteudoDeExemplo(lista(n));
  c.tituloEscopo = "ESCOPO DO SERVIÇO" + " e mais algumas palavras para ocupar a linha toda do título".repeat(linhasDoCabecalho);
  c.cliente.nome = "Cliente de Teste" + " Sobrenome Comprido da Silva Pereira".repeat(linhasDoCabecalho);
  const itens = c.opcoes.flatMap((o) => o.secoes.flatMap((s) => s.itens));
  if (linhasDeObservacao > 0) itens[0].observacoes = "observação do item " + "com mais texto para quebrar a linha ".repeat(linhasDeObservacao * 2);
  if (modo !== "sem") {
    for (const i of itens) {
      i.desenhoImagem = { anexoId: "a", caminho: "x", sha256: img.sha256, mime: img.mime, larguraPx: img.larguraPx, alturaPx: img.alturaPx };
      if (modo === "GRANDE") i.tamanhoDesenho = "GRANDE";
    }
  }
  return c;
}

const proposta = (c: ConteudoProposta) => renderToBuffer(createElement(PropostaPdf, { c, logo: null, imagens }) as unknown as Documento);
const producao = (c: ConteudoProposta) => renderToBuffer(createElement(ProducaoPdf, { c, opcaoId: null, imagens }) as unknown as Documento);

/** Página (1, 2…) em que cada item aparece, lida do texto do PDF (sem programa externo). */
async function paginasDosItens(pdf: Buffer, n: number): Promise<{ paginas: number; itens: number[] }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, isEvalSupported: false }).promise;
  const itens: number[] = new Array(n).fill(0);
  for (let p = 1; p <= doc.numPages; p++) {
    const texto = (await (await doc.getPage(p)).getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join(" ");
    for (let k = 1; k <= n; k++) if (new RegExp(`SUPREMA ${k}(?!\\d)`).test(texto) && itens[k - 1] === 0) itens[k - 1] = p;
  }
  return { paginas: doc.numPages, itens };
}

describe("de 1 a 10 itens, sem imagem, Normal e Grande: todos aparecem, em ordem, e o item 1 fica na página 1", () => {
  it.each([["sem" as Modo], ["NORMAL" as Modo], ["GRANDE" as Modo]])("%s", async (modo) => {
    for (const n of [1, 2, 3, 4, 5, 6, 8, 10]) {
      for (const [nome, gerar] of [["proposta", proposta], ["produção", producao]] as const) {
        const r = await paginasDosItens(await gerar(montar(n, modo)), n);
        const rotulo = `${modo} · ${nome} · ${n} itens`;
        expect(r.itens.every((p) => p >= 1), `${rotulo}: todos os itens aparecem`).toBe(true);
        expect(r.itens[0], `${rotulo}: o item 1 cabe na página 1`).toBe(1);
        expect([...r.itens].sort((a, b) => a - b), `${rotulo}: os itens seguem em ordem de página`).toEqual(r.itens);
        expect(r.paginas, `${rotulo}: nunca mais páginas do que itens + 2`).toBeLessThanOrEqual(n + 2);
      }
    }
  }, 180_000);
});

describe("a página 1 nunca fica só com o cabeçalho quando o item 1 cabe (cabeçalho e item 1 com alturas variadas)", () => {
  it("proposta, 3 itens com imagem Normal (o caso da pendência) e sem imagem", async () => {
    const ruins: string[] = [];
    for (const modo of ["NORMAL", "sem"] as const) {
      for (let titulo = 0; titulo <= 14; titulo++) {
        for (let obs = 0; obs <= 1; obs++) {
          const r = await paginasDosItens(await proposta(montar(3, modo, titulo, obs)), 3);
          if (r.itens[0] !== 1) ruins.push(`${modo} título=${titulo} obs=${obs} → itens nas páginas [${r.itens}]`);
        }
      }
    }
    expect(ruins, ruins.join("\n")).toEqual([]);
  }, 300_000);

  it("folha de produção, 4 itens com imagem Normal e sem imagem", async () => {
    const ruins: string[] = [];
    for (const modo of ["NORMAL", "sem"] as const) {
      for (let cabecalho = 0; cabecalho <= 14; cabecalho++) {
        for (let obs = 0; obs <= 1; obs++) {
          const r = await paginasDosItens(await producao(montar(4, modo, cabecalho, obs)), 4);
          if (r.itens[0] !== 1) ruins.push(`${modo} cabeçalho=${cabecalho} obs=${obs} → itens nas páginas [${r.itens}]`);
        }
      }
    }
    expect(ruins, ruins.join("\n")).toEqual([]);
  }, 300_000);
});

/** A última página da folha de produção tem pelo menos um item (nunca uma página só com o rodapé). */
async function ultimaPaginaTemItem(pdf: Buffer, n: number): Promise<{ paginas: number; temItem: boolean }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, isEvalSupported: false }).promise;
  const texto = (await (await doc.getPage(doc.numPages)).getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join(" ");
  let temItem = false;
  for (let k = 1; k <= n; k++) if (new RegExp(`SUPREMA ${k}(?!\\d)`).test(texto)) temItem = true;
  return { paginas: doc.numPages, temItem };
}

describe("folha de produção: nunca termina numa página vazia (só com o rodapé)", () => {
  it("o último bloco da opção não tem espaço depois dele (o espaço sozinho criava uma página a mais), com altura do cabeçalho variada", async () => {
    const ruins: string[] = [];
    for (const modo of ["NORMAL", "sem"] as const) {
      for (const n of [3, 4]) {
        for (let cabecalho = 0; cabecalho <= 14; cabecalho++) {
          for (let obs = 0; obs <= 1; obs++) {
            const r = await ultimaPaginaTemItem(await producao(montar(n, modo, cabecalho, obs)), n);
            if (!r.temItem) ruins.push(`${modo} n=${n} cabeçalho=${cabecalho} obs=${obs} → ${r.paginas} páginas, a última sem item`);
          }
        }
      }
    }
    expect(ruins, ruins.join("\n")).toEqual([]);
  }, 300_000);

  it("com várias opções o espaço entre elas continua (só o último bloco fica sem espaço) e todas as opções aparecem", async () => {
    const c = conteudoDeExemplo(lista(4), [{ nome: "Linha Suprema" }, { nome: "Linha Gold" }, { nome: "Linha Classic" }]);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await producao(c)), useSystemFonts: true, isEvalSupported: false }).promise;
    let texto = "";
    for (let p = 1; p <= doc.numPages; p++) texto += (await (await doc.getPage(p)).getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join(" ") + " ";
    for (const nome of ["LINHA SUPREMA", "LINHA GOLD", "LINHA CLASSIC"]) expect(texto, nome).toContain(nome);
  });
});
