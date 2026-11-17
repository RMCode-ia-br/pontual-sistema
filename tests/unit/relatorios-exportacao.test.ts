import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Padrão da Fase 7B (Bloco 10): todo relatório exporta CSV TIPADO (`csvDoRelatorio`: data dd/mm/aaaa, dinheiro "1234,56" sem símbolo,
 * coluna interna só com permissão, aviso de truncamento) e tem impressão; todo relatório está no índice de /relatorios.
 */
const RAIZ = path.resolve(import.meta.dirname, "../..");
const ler = (p: string) => readFileSync(path.join(RAIZ, p), "utf8");
const pastas = (p: string) => readdirSync(path.join(RAIZ, p)).filter((n) => statSync(path.join(RAIZ, p, n)).isDirectory());

const ROTAS_DE_RELATORIO = [
  ...pastas("src/app/api/exportar/relatorios").map((n) => `src/app/api/exportar/relatorios/${n}/route.ts`),
  "src/app/api/exportar/financeiro/aging/route.ts",
  "src/app/api/exportar/financeiro/dre/route.ts",
  "src/app/api/exportar/financeiro/extrato/[id]/route.ts",
  "src/app/api/exportar/financeiro/pagar/route.ts",
  "src/app/api/exportar/financeiro/receber/route.ts",
  "src/app/api/exportar/financeiro/fluxo/route.ts",
  "src/app/api/exportar/financeiro/recebimentos/route.ts",
];

describe("exportações de relatório em CSV tipado", () => {
  it.each(ROTAS_DE_RELATORIO)("%s usa csvDoRelatorio, não monta dinheiro em texto com símbolo", (rota) => {
    const fonte = ler(rota);
    expect(fonte, "deve usar o CSV tipado").toContain("csvDoRelatorio");
    expect(fonte, "não pode usar gerarCsv direto").not.toMatch(/\bgerarCsv\(/);
    expect(fonte, "dinheiro em texto (R$ 1.234,56) o Excel não soma").not.toContain("formatarMoeda");
    expect(fonte, "relatório sempre exige sessão").toContain("sessaoParaApi");
  });
});

/** Pastas de /relatorios que são uma página de relatório (algumas só agrupam subpáginas). */
const paginasDeRelatorio = () => pastas("src/app/(app)/relatorios").filter((n) => existsSync(path.join(RAIZ, "src/app/(app)/relatorios", n, "page.tsx")));

describe("índice de relatórios", () => {
  const indice = ler("src/app/(app)/relatorios/page.tsx");
  // Relatórios que moram em /relatorios; os financeiros têm o próprio menu em /financeiro.
  it.each(paginasDeRelatorio())("/relatorios/%s está no índice", (pasta) => {
    expect(indice).toContain(`/relatorios/${pasta}`);
  });
});

describe("impressão", () => {
  it.each(paginasDeRelatorio())("/relatorios/%s tem o botão de imprimir (cabeçalho padrão ou o botão)", (pasta) => {
    const fonte = ler(`src/app/(app)/relatorios/${pasta}/page.tsx`);
    expect(fonte).toMatch(/CabecalhoDeRelatorio|BotaoImprimir/);
  });
});
