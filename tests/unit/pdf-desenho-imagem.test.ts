import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { renderToBuffer } from "@react-pdf/renderer";
import sharp from "sharp";
import { createElement } from "react";
import { beforeAll, describe, expect, it } from "vitest";

import { montarFormasDePagamento } from "@/lib/dominio/alternativas-pagamento";
import { processarImagemDeDesenho } from "@/lib/imagem/processar";
import type { ConteudoProposta } from "@/modules/propostas/conteudo";
import { CAIXAS_DA_IMAGEM, CAIXAS_DO_DESENHO_AUTOMATICO, ErroDesenhoIndisponivel, imagemParaPdf, type ImagensDoDesenho } from "@/modules/propostas/pdf/imagens";
import { ProducaoPdf } from "@/modules/propostas/pdf/producao-pdf";
import { PropostaPdf } from "@/modules/propostas/pdf/proposta-pdf";

import { imagensDoPdf, yDoTextoNoPdf } from "../e2e/desenho-ajudantes";
import { conteudoDeExemplo } from "./fixtures-proposta";

type Documento = Parameters<typeof renderToBuffer>[0];
const pdftotext = ["pdftotext", "C:/Program Files/Git/ucrt64/bin/pdftotext.exe"].find((c) => spawnSync(c, ["-v"], { stdio: "ignore" }).error === undefined);

/** Texto do PDF: `layout` mantém colunas e linhas do papel; "\f" separa as páginas. */
function textoDo(pdf: Buffer, modo: "-layout" | "-raw"): string {
  const dir = mkdtempSync(join(tmpdir(), "pdf-img-"));
  try {
    const arquivo = join(dir, "x.pdf");
    writeFileSync(arquivo, pdf);
    return execFileSync(pdftotext!, [modo, "-enc", "UTF-8", arquivo, "-"], { encoding: "utf8" }).replace(/\r\n/g, "\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const desenhoPng = async (l: number, a: number, cor: string) =>
  processarImagemDeDesenho(await sharp({ create: { width: l, height: a, channels: 3, background: cor } }).png().toBuffer());
type Proc = Awaited<ReturnType<typeof desenhoPng>>;

let horizontal: Proc;
let vertical: Proc;
let quadrado: Proc;
let imagens: ImagensDoDesenho;

beforeAll(async () => {
  horizontal = await desenhoPng(2000, 700, "#3366cc");
  vertical = await desenhoPng(600, 1900, "#cc6633");
  quadrado = await desenhoPng(900, 900, "#33aa66");
  imagens = Object.fromEntries([horizontal, vertical, quadrado].map((i) => [i.sha256, { data: i.bytes, format: i.formato }]));
});

function ligar(c: ConteudoProposta, formas: Proc[]) {
  let k = 0;
  for (const o of c.opcoes)
    for (const s of o.secoes)
      for (const i of s.itens) {
        const f = formas[k++ % formas.length];
        i.desenhoImagem = { anexoId: `a-${k}`, caminho: `Int/${f.sha256}`, sha256: f.sha256, mime: f.mime, larguraPx: f.larguraPx, alturaPx: f.alturaPx };
      }
  return c;
}

const lista = (n: number) => Array.from({ length: n }, (_, i) => ({ descricao: `JANELA DE CORRER LINHA SUPREMA ${i + 1}`, valorCentavos: 100_000 + (i + 1) * 111, tipoDesenho: "BOX_FRONTAL", grupo: null as string | null }));

function comFormas(c: ConteudoProposta): ConteudoProposta {
  const bases = c.opcoes.map((o) => ({ id: o.id, nome: o.nome, baseCentavos: o.totais.itensCentavos - o.totais.descontoCentavos, acrescimoNotaCentavos: 0, totalCentavos: o.totais.totalCentavos }));
  const cartao = (n: number) => [{ descricao: "No cartão", percentualPb: 10000, gatilho: "CONFIRMACAO", forma: "CARTAO_CREDITO", diasApos: null, dataFixa: null, parcelasCartao: n }];
  const dig = (p: number) => bases.map((b) => ({ opcaoId: b.id, baseCentavos: Math.round((b.baseCentavos * (100 + p)) / 100) }));
  const r = montarFormasDePagamento({
    nomePrincipal: "À vista",
    principal: { textoLivre: null, parcelas: c.pagamento.parcelas.slice(0, 1).map((p) => ({ ...p, percentualPb: 5000 })).concat([{ ...c.pagamento.parcelas[2], percentualPb: 5000 }]) },
    extras: [
      { nome: "Transferência", modoAjuste: "PERCENTUAL", ajustePb: -500, repasseCartao: false, textoLivre: null, parcelas: [{ descricao: "No Pix", percentualPb: 10000, gatilho: "CONFIRMACAO", forma: "PIX", diasApos: null, dataFixa: null, parcelasCartao: null }], totais: [] },
      { nome: "Cartão-3x", modoAjuste: "TOTAL_DIGITADO", ajustePb: 0, repasseCartao: true, textoLivre: null, parcelas: cartao(3), totais: dig(5) },
      { nome: "Cartão-10x", modoAjuste: "TOTAL_DIGITADO", ajustePb: 0, repasseCartao: true, textoLivre: null, parcelas: cartao(10), totais: dig(13) },
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

const proposta = (c: ConteudoProposta, extra: Record<string, unknown> = {}) => renderToBuffer(createElement(PropostaPdf, { c, logo: null, imagens, ...extra }) as unknown as Documento);
const producao = (c: ConteudoProposta, extra: Record<string, unknown> = {}) => renderToBuffer(createElement(ProducaoPdf, { c, opcaoId: null, imagens, ...extra }) as unknown as Documento);
/** Texto sem espaços repetidos e sem o rodapé (que se repete a cada página: o número de páginas muda com a imagem). */
const semEspaco = (t: string) =>
  t
    .replace(/Rua de Teste[^\n]*\n?/g, "")
    .replace(/Página \d+ de \d+/g, "")
    .replace(/[\s\f]+/g, " ")
    .trim();

describe("falha segura: nunca cai no desenho automático em silêncio", () => {
  it("imagemParaPdf sem a imagem carregada lança o erro com o número do item", () => {
    expect(() => imagemParaPdf({}, { anexoId: "a", caminho: "x", sha256: "abc", mime: "image/png", larguraPx: 1, alturaPx: 1 }, 7)).toThrow(ErroDesenhoIndisponivel);
    try {
      imagemParaPdf({}, { anexoId: "a", caminho: "x", sha256: "abc", mime: "image/png", larguraPx: 1, alturaPx: 1 }, 7);
    } catch (e) {
      expect((e as Error).message).toBe("Não foi possível carregar o desenho do item 7; tente de novo.");
    }
  });
  it("renderizar a proposta e a folha de produção com imagem citada e não carregada FALHA (não gera PDF com o automático)", async () => {
    const c = ligar(conteudoDeExemplo(lista(2)), [horizontal]);
    // A mensagem legível vem do carregador (gerar.tsx), antes do render; aqui basta provar que NÃO sai PDF.
    await expect(proposta(c, { imagens: {} })).rejects.toThrow();
    await expect(producao(c, { imagens: {} })).rejects.toThrow();
  });
});

describe.skipIf(pdftotext === undefined)("PDF com imagem: layout e texto", () => {
  it("o texto extraído é IGUAL com e sem imagem (a imagem só ocupa a caixa do desenho; nada some nem muda)", async () => {
    const base = comFormas(conteudoDeExemplo(lista(6), [{ nome: "Linha Suprema" }, { nome: "Linha Gold", descontoCentavos: 36_000 }]));
    const semImagem = await proposta(base);
    const comImagem = await proposta(ligar(structuredClone(base), [horizontal, vertical, quadrado]));
    expect(semEspaco(textoDo(comImagem, "-raw"))).toBe(semEspaco(textoDo(semImagem, "-raw"))); // mesmo conteúdo; só a paginação pode mudar
  });

  it("20 itens com imagem + 5 formas em duas opções: item e valor na mesma página, nenhum título órfão, nenhuma forma partida", async () => {
    const c = ligar(comFormas(conteudoDeExemplo(lista(20), [{ nome: "Linha Suprema" }, { nome: "Linha Gold", descontoCentavos: 36_000 }])), [horizontal, vertical, quadrado]);
    const pdf = await proposta(c);
    const paginas = textoDo(pdf, "-layout").split("\f").filter((p) => p.trim() !== "");
    expect(paginas.length).toBeGreaterThan(8); // as imagens ocupam espaço: o PDF tem várias páginas

    // Cada item (descrição + valor distinto) cai inteiro na mesma página.
    for (let k = 1; k <= 20; k++) {
      const valor = `R$ ${(((100_000 + k * 111) / 100)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
      const doItem = paginas.map((p, i) => ({ i, tem: p.includes(`SUPREMA ${k}`) && p.includes(valor) })).filter((x) => x.tem);
      expect(doItem.length, `item ${k} e o valor ${valor} devem estar juntos em alguma página`).toBeGreaterThan(0);
    }

    // Títulos nunca ficam sozinhos no fim da página (sem contar o rodapé).
    const titulos = ["ESCOPO DO SERVIÇO", "NOTAS IMPORTANTES", "TERMOS COMERCIAIS", "1.0 FORMA DE PAGAMENTO:", "• LINHA SUPREMA:", "• LINHA GOLD:", "LINHA SUPREMA", "LINHA GOLD"];
    for (const [n, pagina] of paginas.entries()) {
      const linhas = pagina.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !/^Página \d+ de \d+$/.test(l) && !/CNPJ|Tel:/.test(l));
      const ultima = linhas[linhas.length - 1] ?? "";
      expect(titulos.includes(ultima), `página ${n + 1} termina no título "${ultima}"`).toBe(false);
    }

    // Cada forma de pagamento: o título "VALOR TOTAL" e a linha seguinte na mesma página (quadro não partido).
    for (const pagina of paginas) {
      const ls = pagina.split("\n").map((l) => l.trim()).filter(Boolean);
      ls.forEach((l, k) => {
        if (/^(À VISTA|TRANSFERÊNCIA|CARTÃO-3X|CARTÃO-10X|BOLETO)\b/.test(l) && !/VALOR TOTAL/.test(l)) expect(ls.slice(k + 1, k + 4).some((x) => /VALOR TOTAL/.test(x)), `forma "${l}" sem o valor na mesma página`).toBe(true);
      });
    }
  }, 120_000);

  it("a folha de produção com imagem não traz valor nenhum e mantém todos os itens", async () => {
    const c = ligar(conteudoDeExemplo(lista(8)), [horizontal, vertical, quadrado]);
    const texto = textoDo(await producao(c), "-raw");
    expect(texto).not.toMatch(/R\$/);
    for (let k = 1; k <= 8; k++) expect(texto).toContain(`SUPREMA ${k}`);
  });

  it("caixa maior (só para item com imagem) não altera o texto nem o desenho automático dos outros itens", async () => {
    const c = conteudoDeExemplo(lista(3));
    ligar(c, [horizontal]);
    delete c.opcoes[0].secoes[0].itens[1].desenhoImagem; // o item 2 segue automático
    const a = await proposta(c);
    // Outra caixa qualquer, derivada da constante (o teste não fixa o tamanho da caixa da imagem): o texto não muda.
    const base = CAIXAS_DA_IMAGEM.NORMAL;
    const maior = { ...CAIXAS_DA_IMAGEM, NORMAL: { proposta: { largura: base.proposta.largura * 1.2, altura: base.proposta.altura * 1.2 }, producao: base.producao } };
    const b = await proposta(c, { caixas: maior });
    expect(semEspaco(textoDo(b, "-raw"))).toBe(semEspaco(textoDo(a, "-raw")));
  });

  it("a caixa do DESENHO AUTOMÁTICO é a de sempre (a da imagem é outra constante e pode mudar)", () => {
    expect(CAIXAS_DO_DESENHO_AUTOMATICO).toEqual({ proposta: { largura: 170, altura: 127.5 }, producao: { largura: 110, altura: 82.5 } });
  });
});

// ----- Bloco 5: tamanho Normal/Grande por item e assinatura junto dos termos -----

function ligarTamanho(c: ConteudoProposta, f: Proc, tamanho: "NORMAL" | "GRANDE") {
  ligar(c, [f]);
  for (const o of c.opcoes) for (const s of o.secoes) for (const i of s.itens) if (tamanho === "GRANDE") i.tamanhoDesenho = "GRANDE";
}

function dentroDaCaixa(i: { larguraPt: number; alturaPt: number; larguraPx: number; alturaPx: number }, caixa: { largura: number; altura: number }) {
  const folga = 0.6;
  expect(i.larguraPt).toBeLessThanOrEqual(caixa.largura + folga);
  expect(i.alturaPt).toBeLessThanOrEqual(caixa.altura + folga);
  expect(Math.abs(i.larguraPt - caixa.largura) < folga || Math.abs(i.alturaPt - caixa.altura) < folga, "encosta numa dimensão da caixa").toBe(true);
  expect(Math.abs(i.larguraPt / i.alturaPt - i.larguraPx / i.alturaPx) / (i.larguraPx / i.alturaPx)).toBeLessThan(0.01); // sem esticar
}

describe("tamanho do desenho por item (caixas lidas das constantes)", () => {
  it("proposta: Normal cabe na caixa Normal e Grande na Grande (maior que a Normal), sem esticar", async () => {
    const normal = conteudoDeExemplo(lista(1));
    ligarTamanho(normal, horizontal, "NORMAL");
    const grande = conteudoDeExemplo(lista(1));
    ligarTamanho(grande, horizontal, "GRANDE");
    const [n] = await imagensDoPdf(await proposta(normal));
    const [g] = await imagensDoPdf(await proposta(grande));
    dentroDaCaixa(n, CAIXAS_DA_IMAGEM.NORMAL.proposta);
    dentroDaCaixa(g, CAIXAS_DA_IMAGEM.GRANDE.proposta);
    expect(g.larguraPt).toBeGreaterThan(n.larguraPt);
  });

  it("proposta com imagem vertical e quadrada nos dois tamanhos: sempre dentro da caixa do tamanho", async () => {
    for (const tamanho of ["NORMAL", "GRANDE"] as const) {
      for (const f of [vertical, quadrado]) {
        const c = conteudoDeExemplo(lista(1));
        ligarTamanho(c, f, tamanho);
        const [i] = await imagensDoPdf(await proposta(c));
        dentroDaCaixa(i, CAIXAS_DA_IMAGEM[tamanho].proposta);
      }
    }
  });

  it("folha de produção: Normal ao lado do texto; Grande ABAIXO do texto, dentro da caixa Grande", async () => {
    const normal = conteudoDeExemplo(lista(1));
    ligarTamanho(normal, horizontal, "NORMAL");
    const grande = conteudoDeExemplo(lista(1));
    ligarTamanho(grande, horizontal, "GRANDE");
    const [n] = await imagensDoPdf(await producao(normal));
    const [g] = await imagensDoPdf(await producao(grande));
    dentroDaCaixa(n, CAIXAS_DA_IMAGEM.NORMAL.producao);
    dentroDaCaixa(g, CAIXAS_DA_IMAGEM.GRANDE.producao);
    expect(g.larguraPt).toBeGreaterThan(n.larguraPt);
    // Em pontos de PDF o y cresce para CIMA. Grande fica ABAIXO do texto do item (o topo da imagem está abaixo do texto);
    // Normal fica AO LADO (o topo da imagem não está abaixo da linha do texto: a coluna do desenho começa junto com o texto).
    const yDoTexto = await yDoTextoNoPdf(await producao(grande), g.pagina, "SUPREMA 1");
    expect(g.y + g.alturaPt, "o topo da imagem Grande fica abaixo do texto do item").toBeLessThan(yDoTexto);
    const yDoTextoNormal = await yDoTextoNoPdf(await producao(normal), n.pagina, "SUPREMA 1");
    // A imagem fica centralizada na caixa: o topo da CAIXA (não o da imagem) é que acompanha o texto.
    const topoDaCaixaNormal = n.y + n.alturaPt + (CAIXAS_DA_IMAGEM.NORMAL.producao.altura - n.alturaPt) / 2;
    expect(topoDaCaixaNormal, "a caixa da imagem Normal começa na altura do texto").toBeGreaterThan(yDoTextoNormal - 20);
    // Grande fica na coluna do texto (não encostada na margem direita como a Normal).
    expect(g.x + g.larguraPt).toBeLessThan(n.x + n.larguraPt + 0.6);
  });

  it.skipIf(pdftotext === undefined)("itens Grandes continuam indivisíveis: o texto de cada item e a sua imagem ficam na MESMA página, nas duas folhas", async () => {
    const c = conteudoDeExemplo(lista(9));
    ligarTamanho(c, horizontal, "GRANDE");
    for (const [rotulo, gerar] of [["proposta", proposta], ["produção", producao]] as const) {
      const pdf = await gerar(c);
      const imagens = (await imagensDoPdf(pdf)).sort((a, b) => a.pagina - b.pagina);
      expect(imagens).toHaveLength(9);
      const paginas = textoDo(pdf, "-layout").split("\f");
      for (let k = 1; k <= 9; k++) {
        const paginaDoTexto = paginas.findIndex((p) => new RegExp(`SUPREMA ${k}\\b`).test(p)) + 1;
        expect(imagens[k - 1].pagina, `${rotulo}: item ${k}`).toBe(paginaDoTexto);
      }
      expect(new Set(imagens.map((i) => i.pagina)).size, `${rotulo}: itens grandes ocupam várias páginas`).toBeGreaterThan(1);
    }
  });
});

describe.skipIf(pdftotext === undefined)("a assinatura acompanha os termos comerciais (nunca sozinha numa página)", () => {
  /** Páginas do PDF com texto (a última página vazia do pdftotext não conta). */
  const paginasDe = (pdf: Buffer) => textoDo(pdf, "-layout").split("\f").filter((p) => p.trim() !== "");

  function conferirAssinatura(pdf: Buffer, rotulo: string) {
    const paginas = paginasDe(pdf);
    const comAssinatura = paginas.filter((p) => p.includes("Att,"));
    expect(comAssinatura, `${rotulo}: a assinatura aparece uma vez`).toHaveLength(1);
    // Na mesma página da assinatura há texto dos termos (a validade é o último bloco, a assinatura vai junto dele).
    expect(comAssinatura[0], `${rotulo}: assinatura sem a validade dos termos na mesma página`).toContain("Validade da proposta");
  }

  it("sem imagem, com 1 a 40 itens (varre as quantidades em que a assinatura costumava sobrar sozinha)", async () => {
    for (let n = 1; n <= 40; n++) conferirAssinatura(await proposta(conteudoDeExemplo(lista(n))), `${n} itens`);
  }, 300_000);

  it("com imagem Normal e Grande, de 1 a 12 itens", async () => {
    for (const tamanho of ["NORMAL", "GRANDE"] as const) {
      for (let n = 1; n <= 12; n++) {
        const c = conteudoDeExemplo(lista(n));
        ligarTamanho(c, horizontal, tamanho);
        conferirAssinatura(await proposta(c), `${tamanho}, ${n} itens`);
      }
    }
  }, 300_000);

  it("com formas de pagamento em duas colunas (termos soltos na página), com e sem imagem", async () => {
    for (const n of [1, 3, 6, 9, 12, 18]) {
      const semImagem = comFormas(conteudoDeExemplo(lista(n), [{ nome: "Linha Suprema" }, { nome: "Linha Gold", descontoCentavos: 36_000 }]));
      conferirAssinatura(await proposta(semImagem), `formas, ${n} itens, sem imagem`);
      const comImagem = comFormas(conteudoDeExemplo(lista(n), [{ nome: "Linha Suprema" }, { nome: "Linha Gold", descontoCentavos: 36_000 }]));
      ligarTamanho(comImagem, horizontal, "GRANDE");
      conferirAssinatura(await proposta(comImagem), `formas, ${n} itens, Grande`);
    }
  }, 300_000);
});
