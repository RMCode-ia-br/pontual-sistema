import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NIVEL_DO_VERBO, RECURSO, decidir, permissoesEfetivas } from "@/lib/dominio/permissoes";
import { REGRA_DO_ANEXO } from "@/modules/anexos/permissao";
import { RECURSO_DA_LIXEIRA, TIPOS_DA_LIXEIRA } from "@/modules/lixeira/tipos";

/**
 * Varredura (Fase 7C): todo `can(sessao, "verbo", "recurso")` do código tem verbo e recurso mapeados.
 * Como a regra falha fechada, um par sem mapeamento negaria até o administrador: esta varredura impede que isso chegue ao ar.
 */

const RAIZ = join(process.cwd(), "src");

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (nome === "generated") continue;
    const s = statSync(caminho);
    if (s.isDirectory()) arquivos(caminho, saida);
    else if (/\.(ts|tsx)$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

/** Divide por vírgula só no nível de fora de parênteses e de aspas. */
function argumentos(texto: string): string[] {
  const partes: string[] = [];
  let nivel = 0;
  let aspas: string | null = null;
  let atual = "";
  for (const ch of texto) {
    if (aspas) {
      atual += ch;
      if (ch === aspas) aspas = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { aspas = ch; atual += ch; continue; }
    if (ch === "(" || ch === "[" || ch === "{") nivel++;
    if (ch === ")" || ch === "]" || ch === "}") nivel--;
    if (ch === "," && nivel === 0) { partes.push(atual.trim()); atual = ""; continue; }
    atual += ch;
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes;
}

type Uso = { arquivo: string; verbos: string[]; recursos: string[]; recursoDinamico: boolean };

function usosDeCan(): Uso[] {
  const usos: Uso[] = [];
  for (const arquivo of arquivos(RAIZ)) {
    if (arquivo.replace(/\\/g, "/").includes("/src/lib/permissoes/") || arquivo.replace(/\\/g, "/").endsWith("/src/lib/dominio/permissoes.ts")) continue;
    const texto = readFileSync(arquivo, "utf8");
    for (const m of texto.matchAll(/(?<![\w.])can\(/g)) {
      let i = (m.index ?? 0) + m[0].length;
      let nivel = 1;
      let aspas: string | null = null;
      const inicio = i;
      for (; i < texto.length && nivel > 0; i++) {
        const ch = texto[i];
        if (aspas) { if (ch === aspas) aspas = null; continue; }
        if (ch === '"' || ch === "'" || ch === "`") aspas = ch;
        else if (ch === "(") nivel++;
        else if (ch === ")") nivel--;
      }
      const args = argumentos(texto.slice(inicio, i - 1));
      if (args.length < 2) continue;
      const literais = (s: string) => [...s.matchAll(/"([^"]+)"/g)].map((x) => x[1]!);
      usos.push({
        arquivo: arquivo.replace(process.cwd(), "").replace(/\\/g, "/"),
        verbos: literais(args[1]!),
        recursos: args[2] ? literais(args[2]) : [],
        recursoDinamico: !!args[2] && literais(args[2]).length === 0,
      });
    }
  }
  return usos;
}

/**
 * Despachantes genéricos: chamam `can(usuario, verbo, recurso)` com verbo e/ou recurso vindos de VARIÁVEL, de propósito.
 * O que passa por eles é validado por outro caminho (dito ao lado), então a varredura de literais os ignora.
 */
const DESPACHANTES: Record<string, string> = {
  "/src/lib/csv/acesso.ts": "recursos das exigências de cada rota: conferidos por tests/unit/rotas-matriz.test.ts",
  "/src/modules/anexos/permissao.ts": "recursos de REGRA_DO_ANEXO: conferidos abaixo",
};

describe("varredura de can() no código", () => {
  const todosOsUsos = usosDeCan();
  const usos = todosOsUsos.filter((u) => !(u.arquivo in DESPACHANTES));

  it("os despachantes continuam existindo (a lista não apodrece)", () => {
    for (const arquivo of Object.keys(DESPACHANTES)) expect(todosOsUsos.some((u) => u.arquivo === arquivo), arquivo).toBe(true);
  });

  it("os recursos de anexo estão no mapeamento", () => {
    const desconhecidos = Object.entries(REGRA_DO_ANEXO).flatMap(([entidade, r]) => r.algum.filter((x) => !(x in RECURSO)).map((x) => `${entidade}: ${x}`));
    expect(desconhecidos).toEqual([]);
  });

  it("encontra os usos (a varredura não está vazia)", () => {
    expect(usos.length).toBeGreaterThan(100);
  });

  it("todo can() tem verbo literal (verbo vindo de variável escaparia da varredura)", () => {
    expect(usos.filter((u) => u.verbos.length === 0).map((u) => u.arquivo)).toEqual([]);
  });

  it("todo verbo usado tem nível", () => {
    const faltam = usos.flatMap((u) => u.verbos.filter((v) => !(v in NIVEL_DO_VERBO)).map((v) => `${u.arquivo}: verbo "${v}"`));
    expect(faltam).toEqual([]);
  });

  it("todo recurso usado tem módulo", () => {
    const faltam = usos.flatMap((u) => u.recursos.filter((r) => !(r in RECURSO)).map((r) => `${u.arquivo}: recurso "${r}"`));
    expect(faltam).toEqual([]);
  });

  it("recurso dinâmico só na lixeira (e os tipos que ela aceita estão mapeados)", () => {
    const dinamicos = usos.filter((u) => u.recursoDinamico).map((u) => u.arquivo);
    expect(dinamicos).toEqual(["/src/modules/lixeira/actions.ts"]);
    // O valor REAL usado pela lixeira é RECURSO_DA_LIXEIRA[tipo] (o tipo vem no plural: "clientes"): cada um tem de estar mapeado
    // e liberado para o administrador, senão a restauração ficaria negada para todo mundo (falha fechada).
    const admin = permissoesEfetivas("ADMIN");
    for (const tipo of TIPOS_DA_LIXEIRA) {
      const recurso = RECURSO_DA_LIXEIRA[tipo];
      expect(RECURSO[recurso], `${tipo} -> ${recurso}`).toBeDefined();
      expect(decidir(admin, "restaurar", recurso), tipo).toBe(true);
    }
  });
});
