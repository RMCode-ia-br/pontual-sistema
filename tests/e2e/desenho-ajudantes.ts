import { type Locator } from "@playwright/test";
import sharp from "sharp";

/** Desenho de teste: fundo branco e um retângulo colorido (a cor muda para cada arquivo ficar distinto). */
export async function desenho(largura: number, altura: number, cor: string): Promise<Buffer> {
  const retangulo = await sharp({ create: { width: Math.round(largura * 0.8), height: Math.round(altura * 0.8), channels: 3, background: cor } }).png().toBuffer();
  return sharp({ create: { width: largura, height: altura, channels: 3, background: "#ffffff" } })
    .composite([{ input: retangulo, gravity: "center" }])
    .png()
    .toBuffer();
}

/** Dispara um evento de colar (Ctrl+V) ou de soltar arquivo, com um arquivo dentro de um DataTransfer, no elemento. */
export async function disparar(alvo: Locator, tipoDeEvento: "paste" | "drop", arquivo: { buffer: Buffer; nome: string; mime: string } | null, texto?: string) {
  await alvo.evaluate(
    (el, p) => {
      const dt = new DataTransfer();
      if (p.base64) {
        const bytes = Uint8Array.from(atob(p.base64), (c) => c.charCodeAt(0));
        dt.items.add(new File([bytes], p.nome, { type: p.mime }));
      }
      if (p.texto) dt.setData("text/plain", p.texto);
      const evento = p.tipo === "paste" ? new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }) : new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true });
      el.dispatchEvent(evento);
    },
    { tipo: tipoDeEvento, base64: arquivo?.buffer.toString("base64") ?? "", nome: arquivo?.nome ?? "", mime: arquivo?.mime ?? "", texto: texto ?? "" },
  );
}

export type ImagemNoPdf = { pagina: number; larguraPx: number; alturaPx: number; larguraPt: number; alturaPt: number; x: number; y: number };

type Matriz = [number, number, number, number, number, number];
const multiplicar = (m: Matriz, n: Matriz): Matriz => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];

/**
 * Lê o PDF com o pdfjs (sem renderizar) e devolve cada imagem desenhada: tamanho original em pixels e tamanho e
 * posição na página em pontos (a matriz de transformação acumulada). Serve para conferir que a imagem está dentro da
 * caixa do item e sem esticar.
 */
export async function imagensDoPdf(pdf: Buffer): Promise<ImagemNoPdf[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const documento = await pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, isEvalSupported: false }).promise;
  const { OPS } = pdfjs;
  const imagens: ImagemNoPdf[] = [];
  for (let p = 1; p <= documento.numPages; p++) {
    const operacoes = await (await documento.getPage(p)).getOperatorList();
    let ctm: Matriz = [1, 0, 0, 1, 0, 0];
    const pilha: Matriz[] = [];
    operacoes.fnArray.forEach((fn, i) => {
      const a = operacoes.argsArray[i] as unknown[];
      if (fn === OPS.save) pilha.push(ctm);
      else if (fn === OPS.restore) ctm = pilha.pop() ?? ctm;
      else if (fn === OPS.transform) ctm = multiplicar(ctm, a as unknown as Matriz);
      else if (fn === OPS.paintImageXObject) {
        imagens.push({ pagina: p, larguraPx: Number(a[1]), alturaPx: Number(a[2]), larguraPt: Math.hypot(ctm[0], ctm[1]), alturaPt: Math.hypot(ctm[2], ctm[3]), x: ctm[4], y: ctm[5] });
      }
    });
  }
  return imagens;
}

/** Altura (y, em pontos; cresce para CIMA) do primeiro trecho de texto que contém `trecho` na página; falha se não achar. */
export async function yDoTextoNoPdf(pdf: Buffer, pagina: number, trecho: string): Promise<number> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const documento = await pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, isEvalSupported: false }).promise;
  const conteudo = await (await documento.getPage(pagina)).getTextContent();
  for (const t of conteudo.items) {
    if ("str" in t && t.str.includes(trecho)) return t.transform[5];
  }
  throw new Error(`texto "${trecho}" não encontrado na página ${pagina}`);
}
