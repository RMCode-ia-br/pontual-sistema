/**
 * Extrai a identidade visual do site da empresa (tokens CSS e estilos computados) e grava a parte
 * "extraída" de `docs/IDENTIDADE_VISUAL.md`. Uso: `npm run identidade:extrair`.
 *
 * Só lê números de estilo (cores, fontes, raios, sombras). Não copia fotos, textos nem seções do site.
 * O site é a fonte; a seção "derivada" do documento (modo escuro, contrastes) é escrita à mão.
 */
import fs from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

const SITE = process.env.SITE_REFERENCIA || "https://pontual-mu.vercel.app/";
const SAIDA = path.join("docs", "IDENTIDADE_VISUAL.extraido.md");

type Estilo = { fonte: string; peso: string; tamanho: string; entrelinha: string; espacamento: string; cor: string };

async function main() {
  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage({ viewport: { width: 1366, height: 900 } });
    // O tsx (esbuild) injeta `__name` nas funções serializadas para o navegador; o shim evita o ReferenceError.
    await pagina.addInitScript("window.__name = (f) => f;");
    await pagina.goto(SITE,{ waitUntil: "networkidle", timeout: 60_000 });

    const dados = await pagina.evaluate(() => {
      const tokens: Record<string, string> = {};
      for (const folha of Array.from(document.styleSheets)) {
        let regras: CSSRuleList;
        try {
          regras = folha.cssRules;
        } catch {
          continue;
        }
        for (const regra of Array.from(regras)) {
          const r = regra as CSSStyleRule;
          if (r.selectorText !== ":root") continue;
          for (const nome of Array.from(r.style)) {
            if (nome.startsWith("--") && !nome.startsWith("--lightningcss")) tokens[nome] = r.style.getPropertyValue(nome).trim();
          }
        }
      }
      const ler = (seletor: string) => {
        const e = document.querySelector(seletor);
        if (!e) return null;
        const s = getComputedStyle(e);
        return { fonte: s.fontFamily.split(",")[0].replace(/"/g, ""), peso: s.fontWeight, tamanho: s.fontSize, entrelinha: s.lineHeight, espacamento: s.letterSpacing, cor: s.color };
      };
      const botao = Array.from(document.querySelectorAll("a,button")).find((e) => /Solicitar/.test(e.textContent ?? ""));
      const bs = botao ? getComputedStyle(botao) : null;
      const cartao = document.querySelector("[class*='rounded-xl'][class*='border-border'][class*='bg-card']");
      const cs = cartao ? getComputedStyle(cartao) : null;
      const cab = document.querySelector("header");
      const hs = cab ? getComputedStyle(cab) : null;
      const tem = {
        // Só conta se existir um bloco .dark que redefine os tokens (os utilitários dark: do Tailwind não contam).
        escuro: Array.from(document.styleSheets).some((f) => {
          try {
            return Array.from(f.cssRules).some((r) => {
              const regra = r as CSSStyleRule;
              return /dark/.test(regra.selectorText ?? "") && !!regra.style?.getPropertyValue("--background");
            });
          } catch {
            return false;
          }
        }),
      };
      return {
        tokens,
        tipos: { corpo: ler("body"), h1: ler("h1"), h2: ler("h2"), h3: ler("h3"), navegacao: ler("nav a"), rotulo: ler("header ~ * p, main p") },
        botao: bs && { raio: bs.borderRadius, peso: bs.fontWeight, tamanho: bs.fontSize, altura: bs.height, recuo: bs.paddingLeft },
        cartao: cs && { raio: cs.borderRadius, borda: cs.borderTopWidth, recuo: cs.paddingLeft, sombra: cs.boxShadow },
        cabecalho: hs && { altura: hs.height, posicao: hs.position, borda: hs.borderBottomWidth },
        tem,
      };
    });

    const linhasTokens = Object.entries(dados.tokens)
      .map(([k, v]) => `| \`${k}\` | \`${v}\` |`)
      .join("\n");
    const tipo = (n: string, e: Estilo | null) => (e ? `| ${n} | ${e.fonte} | ${e.peso} | ${e.tamanho} | ${e.entrelinha} | ${e.espacamento} |` : `| ${n} | - | - | - | - | - |`);

    const md = [
      `# Identidade visual extraída do site`,
      ``,
      `Fonte: ${SITE} (lido com o Playwright em ${new Date().toLocaleDateString("sv-SE")}). Só valores de estilo; nenhuma foto, texto ou seção do site foi copiada.`,
      ``,
      `Modo escuro no site: ${dados.tem.escuro ? "sim" : "**não existe** (o modo escuro do sistema é derivado)"}.`,
      ``,
      `## Tokens CSS (\`:root\`)`,
      ``,
      `| Token | Valor |`,
      `| --- | --- |`,
      linhasTokens,
      ``,
      `## Tipografia`,
      ``,
      `| Elemento | Família | Peso | Tamanho | Entrelinha | Espaçamento |`,
      `| --- | --- | --- | --- | --- | --- |`,
      tipo("Corpo", dados.tipos.corpo),
      tipo("h1", dados.tipos.h1),
      tipo("h2", dados.tipos.h2),
      tipo("h3", dados.tipos.h3),
      tipo("Navegação", dados.tipos.navegacao),
      tipo("Rótulo (mono)", dados.tipos.rotulo),
      ``,
      `## Componentes`,
      ``,
      `- Botão: ${JSON.stringify(dados.botao)}`,
      `- Cartão: ${JSON.stringify(dados.cartao)}`,
      `- Cabeçalho: ${JSON.stringify(dados.cabecalho)}`,
      ``,
    ].join("\n");

    fs.writeFileSync(SAIDA, md.replace(/\r?\n/g, "\r\n"), "utf8");
    console.log(`Extração gravada em ${SAIDA} (${Object.keys(dados.tokens).length} tokens).`);
  } finally {
    await navegador.close();
  }
}

main().catch((e: unknown) => {
  console.error("Falha na extração:", e instanceof Error ? e.message.split("\n")[0] : "erro");
  process.exit(1);
});
