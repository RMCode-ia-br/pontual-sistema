import { mkdirSync, writeFileSync } from "node:fs";

import { test, type Page } from "@playwright/test";

import { entrarEEsperarPainel } from "./ajudantes";
import { prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

/**
 * Capturas de tela e verificação de contraste da Fase 7 (material para a revisão visual; não afirma nada). Só roda com
 * CAPTURAS_FASE7 definido. Salva `<tela>-<desktop|celular>-<claro|escuro>.png` (página inteira) e um `contraste-<projeto>.json`
 * com os textos abaixo do mínimo WCAG AA (4,5:1 no texto normal; 3:1 no texto grande: 24 px, ou 18,66 px em negrito).
 * As telas mostram o estado real do banco (poucos dados); nada é criado além do usuário de teste.
 */
const ATIVO = Boolean(process.env.CAPTURAS_FASE7);
const PASTA = process.env.CAPTURAS_FASE7_PASTA ?? "test-results/capturas-fase7";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(114) } });

const TELAS = [
  { nome: "painel", url: "/" },
  { nome: "vendas", url: "/relatorios/vendas" },
  { nome: "producao", url: "/relatorios/producao" },
  { nome: "faturamento", url: "/relatorios/faturamento" },
  { nome: "estoque", url: "/relatorios/estoque" },
] as const;
const TEMAS = [
  { nome: "claro", esquema: "light" },
  { nome: "escuro", esquema: "dark" },
] as const;

type Violacao = { tela: string; tema: string; seletor: string; texto: string; razao: number; minimo: number; cor: string; fundo: string; tamanhoPx: number; peso: number };

/** Calcula, no navegador, o contraste WCAG de todo texto visível contra o fundo efetivo (composição das camadas de fundo). */
async function medirContraste(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    // Qualquer sintaxe de cor do CSS (oklch, color-mix, lab...) vira sRGB pelo próprio navegador.
    const rgba = (css: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const luz = (c: number[]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const razao = (a: number[], b: number[]) => {
      const [x, y] = [luz(a), luz(b)].sort((m, n) => n - m);
      return (x + 0.05) / (y + 0.05);
    };
    const sobre = (fg: [number, number, number, number], bg: number[]) => [fg[0] * fg[3] + bg[0] * (1 - fg[3]), fg[1] * fg[3] + bg[1] * (1 - fg[3]), fg[2] * fg[3] + bg[2] * (1 - fg[3])];
    const hex = (c: number[]) => `rgb(${c.map((v) => Math.round(v)).join(",")})`;
    const descrever = (el: Element): string => {
      const partes: string[] = [];
      let atual: Element | null = el;
      for (let i = 0; i < 4 && atual && atual !== document.body; i++) {
        const cls = typeof atual.className === "string" ? atual.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".") : "";
        partes.unshift(`${atual.tagName.toLowerCase()}${atual.id ? `#${atual.id}` : ""}${cls ? `.${cls}` : ""}`);
        atual = atual.parentElement;
      }
      return partes.join(" > ");
    };

    const achados: { seletor: string; texto: string; razao: number; minimo: number; cor: string; fundo: string; tamanhoPx: number; peso: number }[] = [];
    let verificados = 0;
    // Prova de que a medição funciona: o texto de MENOR contraste de cada tela (mesmo acima do mínimo).
    let pior: { seletor: string; texto: string; razao: number; minimo: number } | null = null;
    let semFundoConhecido = 0;

    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(el.tagName)) continue;
      const texto = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (!texto) continue;
      const estilo = getComputedStyle(el);
      if (estilo.display === "none" || estilo.visibility === "hidden") continue;
      const retangulos = el.getClientRects();
      if (retangulos.length === 0) continue;
      const r = retangulos[0];
      if (r.width < 2 || r.height < 2) continue; // texto só para leitor de tela (sr-only)
      if (el.closest("[hidden], [inert], [aria-hidden='true']") && !el.closest("svg")) continue;
      if (el.closest(":disabled, [aria-disabled='true']")) continue; // componente inativo é isento no WCAG

      // Cor do texto (em SVG, o preenchimento) e opacidade acumulada dos ancestrais.
      const ehSvg = el instanceof SVGElement;
      let alfaAcumulado = 1;
      for (let a: Element | null = el; a; a = a.parentElement) alfaAcumulado *= Number(getComputedStyle(a).opacity);
      if (alfaAcumulado <= 0.01) continue;
      const fg = rgba(ehSvg ? estilo.fill : estilo.color);
      fg[3] *= alfaAcumulado;
      if (fg[3] <= 0.01) continue;

      // Fundo efetivo: camadas de fundo dos ancestrais, da mais externa para a mais interna.
      const camadas: [number, number, number, number][] = [];
      let incerto = false;
      for (let a: Element | null = el; a; a = a.parentElement) {
        const e = getComputedStyle(a);
        if (e.backgroundImage !== "none") {
          incerto = true;
          break;
        }
        const c = rgba(e.backgroundColor);
        if (c[3] > 0) {
          camadas.unshift(c);
          if (c[3] >= 0.999) break;
        }
      }
      if (incerto) {
        semFundoConhecido++;
        continue;
      }
      let fundo: number[] = [255, 255, 255];
      for (const c of camadas) fundo = sobre(c, fundo);
      const cor = sobre(fg, fundo);

      const tamanho = parseFloat(estilo.fontSize);
      const peso = Number(estilo.fontWeight) || 400;
      const grande = tamanho >= 24 || (tamanho >= 18.66 && peso >= 700);
      const minimo = grande ? 3 : 4.5;
      verificados++;
      const rz = razao(cor, fundo);
      if (!pior || rz < pior.razao) pior = { seletor: descrever(el), texto: texto.slice(0, 40), razao: Math.round(rz * 100) / 100, minimo };
      if (rz < minimo) achados.push({ seletor: descrever(el), texto: texto.slice(0, 60), razao: Math.round(rz * 100) / 100, minimo, cor: hex(cor), fundo: hex(fundo), tamanhoPx: tamanho, peso });
    }
    return { achados, verificados, semFundoConhecido, pior };
  });
}

async function abrirTodasAsDefinicoes(page: Page) {
  await page.evaluate(() => {
    for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("button[aria-expanded='false'][aria-controls]"))) b.click();
  });
}

test.describe("capturas e contraste da Fase 7", () => {
  test.skip(!ATIVO, "defina CAPTURAS_FASE7=1 para gerar as capturas e a verificação de contraste");

  test.beforeAll(async () => {
    mkdirSync(PASTA, { recursive: true });
    await prepararUsuarioE2E({ senhaDefinitiva: true });
  });

  test("capturas e contraste nas cinco telas, nos dois temas", async ({ page }) => {
    test.setTimeout(300_000);
    const projeto = test.info().project.name;
    const violacoes: Violacao[] = [];
    const resumo: Record<string, { verificados: number; semFundoConhecido: number; pior: unknown }> = {};

    await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
    for (const tema of TEMAS) {
      await page.emulateMedia({ colorScheme: tema.esquema });
      for (const tela of TELAS) {
        await page.goto(tela.url);
        await page.waitForLoadState("networkidle");
        // Confere que o tema pedido foi mesmo aplicado (next-themes segue o esquema do sistema).
        const escuro = await page.evaluate(() => document.documentElement.classList.contains("dark"));
        if (escuro !== (tema.esquema === "dark")) throw new Error(`O tema ${tema.nome} não foi aplicado em ${tela.url} (classe dark = ${escuro}).`);
        await page.screenshot({ path: `${PASTA}\\${tela.nome}-${projeto}-${tema.nome}.png`, fullPage: true });

        // No painel, abre as definições ("Como é calculado") antes de medir: o texto delas também precisa de contraste.
        if (tela.nome === "painel") await abrirTodasAsDefinicoes(page);
        const r = await medirContraste(page);
        resumo[`${tela.nome}-${tema.nome}`] = { verificados: r.verificados, semFundoConhecido: r.semFundoConhecido, pior: r.pior };
        for (const a of r.achados) violacoes.push({ tela: tela.nome, tema: tema.nome, ...a });
      }
    }

    writeFileSync(`${PASTA}\\contraste-${projeto}.json`, JSON.stringify({ projeto, resumo, violacoes }, null, 2), "utf8");
    console.log(`CONTRASTE ${projeto}: ${violacoes.length} violação(ões) em ${Object.values(resumo).reduce((s, r) => s + r.verificados, 0)} textos verificados`);
  });
});
