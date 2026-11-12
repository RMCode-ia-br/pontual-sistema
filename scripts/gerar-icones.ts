/**
 * Gera a logo circular e os ícones (favicon, apple-icon, PWA) a partir da logo original da empresa.
 * Uso: `npm run icones` (reexecutável: quando a logo modernizada chegar, troque o original e rode de novo).
 *
 * Entrada:  public/logo-pontual.png (na prática um JPEG, 713x714, canto branco fora do disco).
 * Saída:    public/marca/logo-pontual.png      logo completa, círculo com transparência fora do disco
 *           src/app/icon.png (32)              só o símbolo (prédio + meia-lua): o texto some em 32 px
 *           src/app/apple-icon.png (180)       logo completa em fundo opaco (iOS pinta o transparente de preto)
 *           src/app/favicon.ico (32+48)        o mesmo símbolo, para navegadores que pedem /favicon.ico
 *           public/icons/icone-{192,512}.png   PWA "any": logo completa, transparente fora do círculo
 *           public/icons/icone-maskable-{192,512}.png   PWA maskable: fundo opaco, logo na zona segura (80%)
 *
 * Os números de recorte (disco e símbolo) foram medidos na imagem atual; se a logo mudar, ajuste CONFIG.
 */
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

const CONFIG = {
  origem: "public/logo-pontual.png",
  /** Disco da logo dentro da imagem: centro e raio em pixels da imagem original. */
  disco: { cx: 355.5, cy: 356, raio: 355 },
  /** Símbolo (prédio + meia-lua): centro e lado do quadrado de recorte, sem pegar o texto "PONTUAL". */
  simbolo: { cx: 354, cy: 196, lado: 285 },
  /** Cor de fundo dos ícones opacos (amostrada da borda do disco). Fica fora do código da empresa: é da imagem. */
  fundoOpaco: { r: 230, g: 242, b: 251 },
};

const raiz = process.cwd();
const abs = (p: string) => path.join(raiz, p);

/** Máscara circular com borda suave (SVG), do tamanho `lado`. */
const mascara = (lado: number, folga = 0) =>
  Buffer.from(`<svg width="${lado}" height="${lado}"><circle cx="${lado / 2}" cy="${lado / 2}" r="${lado / 2 - folga}" fill="#fff"/></svg>`);

/** Recorta um quadrado da origem e aplica a máscara circular (transparente fora do círculo). */
async function recorteCircular(cx: number, cy: number, lado: number, saida: number): Promise<Buffer> {
  const esquerda = Math.round(cx - lado / 2);
  const topo = Math.round(cy - lado / 2);
  const quadrado = await sharp(abs(CONFIG.origem))
    .extract({ left: esquerda, top: topo, width: Math.round(lado), height: Math.round(lado) })
    .resize(saida, saida, { kernel: "lanczos3" })
    .toBuffer();
  return sharp(quadrado).ensureAlpha().composite([{ input: mascara(saida), blend: "dest-in" }]).png({ compressionLevel: 9 }).toBuffer();
}

const logoCompleta = (saida: number) => recorteCircular(CONFIG.disco.cx, CONFIG.disco.cy, CONFIG.disco.raio * 2, saida);
const soSimbolo = (saida: number) => recorteCircular(CONFIG.simbolo.cx, CONFIG.simbolo.cy, CONFIG.simbolo.lado, saida);

/** Coloca a logo (já circular) centralizada em um quadrado opaco; `proporcao` é a fração ocupada pela logo. */
async function emFundoOpaco(logo: Buffer, lado: number, proporcao: number, fundo: { r: number; g: number; b: number }): Promise<Buffer> {
  const miolo = Math.round(lado * proporcao);
  const redimensionada = await sharp(logo).resize(miolo, miolo).toBuffer();
  return sharp({ create: { width: lado, height: lado, channels: 3, background: fundo } })
    .composite([{ input: redimensionada, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** ICO com imagens PNG embutidas (formato aceito desde o Windows Vista e por todos os navegadores). */
function montarIco(imagens: Array<{ lado: number; png: Buffer }>): Buffer {
  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(0, 0);
  cabecalho.writeUInt16LE(1, 2);
  cabecalho.writeUInt16LE(imagens.length, 4);
  let deslocamento = 6 + 16 * imagens.length;
  const entradas = imagens.map(({ lado, png }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(lado >= 256 ? 0 : lado, 0);
    e.writeUInt8(lado >= 256 ? 0 : lado, 1);
    e.writeUInt16LE(1, 4); // planos
    e.writeUInt16LE(32, 6); // bits por pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(deslocamento, 12);
    deslocamento += png.length;
    return e;
  });
  return Buffer.concat([cabecalho, ...entradas, ...imagens.map((i) => i.png)]);
}

function gravar(destino: string, dados: Buffer) {
  fs.mkdirSync(path.dirname(abs(destino)), { recursive: true });
  fs.writeFileSync(abs(destino), dados);
  console.log(`  ${destino} (${(dados.length / 1024).toFixed(1)} KB)`);
}

async function main() {
  if (!fs.existsSync(abs(CONFIG.origem))) throw new Error(`Logo original não encontrada em ${CONFIG.origem}.`);
  console.log("Gerando logo e ícones a partir de", CONFIG.origem);

  // A logo completa em 512 px (é a que a seed envia ao Storage como logo padrão): basta para tela e PDF e pesa pouco.
  // Paleta de 256 cores (visualmente igual) corta o arquivo de ~250 KB para ~90 KB.
  gravar("public/marca/logo-pontual.png", await sharp(await logoCompleta(512)).png({ palette: true, quality: 90, effort: 10 }).toBuffer());

  // Favicon: só o símbolo, pois "PONTUAL" teria ~3 px de altura em 32 px.
  const s32 = await soSimbolo(32);
  const s48 = await soSimbolo(48);
  gravar("src/app/icon.png", s32);
  gravar("src/app/favicon.ico", montarIco([{ lado: 32, png: s32 }, { lado: 48, png: s48 }]));

  // iOS: ícone opaco (transparente vira preto), logo ocupando ~88% para a máscara arredondada do sistema.
  gravar("src/app/apple-icon.png", await emFundoOpaco(await logoCompleta(180), 180, 0.88, { r: 255, g: 255, b: 255 }));

  // PWA "any": logo completa, transparente fora do círculo.
  for (const lado of [192, 512]) gravar(`public/icons/icone-${lado}.png`, await logoCompleta(lado));
  // PWA maskable: o Android recorta o ícone (círculo, "squircle"...); a logo precisa caber nos 80% centrais.
  for (const lado of [192, 512]) gravar(`public/icons/icone-maskable-${lado}.png`, await emFundoOpaco(await logoCompleta(lado), lado, 0.8, CONFIG.fundoOpaco));
}

main().catch((e: unknown) => {
  console.error("Falha ao gerar os ícones:", e instanceof Error ? e.message.split("\n")[0] : "erro");
  process.exit(1);
});
