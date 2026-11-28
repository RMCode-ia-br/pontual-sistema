import fs from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { RECURSO, decidir, permissoesEfetivas, podeVerModulo, type PermissoesEfetivas } from "@/lib/dominio/permissoes";

/**
 * MATRIZ GERADA DAS ROTAS (Fase 7C, camada 4): para CADA Route Handler de saída (CSV, PDF, .ics, ZIP) × CADA perfil, o
 * resultado esperado é DERIVADO do que a rota declara em \`saidaNegada(usuario, { recursos, algum, valores, custo })\`
 * (lido do código-fonte) e do mapeamento de permissões. A rota é CHAMADA de verdade, com banco falso que explode se for
 * tocado: negada = 403 sem tocar o banco; liberada = qualquer coisa menos 403.
 * Rota sem \`saidaNegada\` (e fora da lista de públicas) falha aqui.
 */

const estado = vi.hoisted(() => ({ sessao: null as unknown }));

vi.mock("@/lib/auth/sessao", () => ({
  exigirSessao: async () => estado.sessao,
  obterUsuarioAtual: async () => estado.sessao,
  sessaoParaApi: async () => estado.sessao,
}));
vi.mock("@/lib/db", () => {
  const bomba = (): unknown =>
    new Proxy(function () {}, {
      get: (_alvo, prop) => (prop === "then" ? undefined : bomba()),
      // Rejeição JÁ TRATADA: consultas disparadas em paralelo não viram "unhandled rejection" quando outra explode antes.
      apply: () => {
        const rejeitada = Promise.reject(new Error("BANCO_TOCADO"));
        rejeitada.catch(() => {});
        return rejeitada;
      },
    });
  return { prisma: bomba() };
});
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, updateTag: () => {}, unstable_cache: <T,>(fn: T) => fn }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

const RAIZ = path.resolve(__dirname, "../..");
const ROTAS = import.meta.glob<{ GET?: (r: unknown, c: unknown) => Promise<Response> }>("/src/app/api/**/route.ts");

/** Rotas que NÃO passam por `saidaNegada`, com o motivo e como se protegem. */
const ROTAS_FORA_DA_MATRIZ: Record<string, string> = {
  "/src/app/api/auth/[...nextauth]/route.ts": "Auth.js (login)",
  "/src/app/api/health/route.ts": "verificação de saúde, não expõe dados",
  "/src/app/api/cron/diario/route.ts": "protegida por CRON_SECRET",
  "/src/app/api/public/agenda/[token]/route.ts": "feed público por token; confere a Agenda do DONO do token (teste estático abaixo)",
};

// ---------------------------------------------------------------------------------------------------------------------

type Exigencia = { recursos: string[]; algum: string[]; valores: boolean; custo: boolean };

function exigenciaDe(texto: string): Exigencia[] {
  const saida: Exigencia[] = [];
  for (const m of texto.matchAll(/saidaNegada\(usuario,\s*\{([^}]*)\}\)/g)) {
    const corpo = m[1]!;
    const lista = (nome: string) => {
      const a = corpo.match(new RegExp(`${nome}:\\s*\\[([^\\]]*)\\]`));
      return a ? [...a[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!) : [];
    };
    saida.push({ recursos: lista("recursos"), algum: lista("algum"), valores: /valores:\s*true/.test(corpo), custo: /custo:\s*true/.test(corpo) });
  }
  return saida;
}

function liberada(e: Exigencia, p: PermissoesEfetivas): boolean {
  return (
    e.recursos.every((r) => decidir(p, "ver", r)) &&
    (e.algum.length === 0 || e.algum.some((r) => decidir(p, "ver", r))) &&
    (!e.valores || decidir(p, "ver", "valores")) &&
    (!e.custo || decidir(p, "ver", "custo"))
  );
}

const PERFIS: { nome: string; papel: string; permissoes: PermissoesEfetivas }[] = [
  { nome: "Dono/Gestão", papel: "ADMIN", permissoes: permissoesEfetivas("ADMIN") },
  { nome: "Escritório", papel: "ESCRITORIO", permissoes: permissoesEfetivas("ESCRITORIO") },
  { nome: "Campo", papel: "CAMPO", permissoes: permissoesEfetivas("CAMPO") },
  { nome: "Campo com ajuste inválido (fechado)", papel: "CAMPO", permissoes: permissoesEfetivas("CAMPO", { lixo: true }) },
  { nome: "Dono sem custo e margem", papel: "ADMIN", permissoes: permissoesEfetivas("ADMIN", { verCustoMargem: false }) },
  { nome: "Dono sem valores", papel: "ADMIN", permissoes: permissoesEfetivas("ADMIN", { verValores: false }) },
];

const itens = Object.keys(ROTAS)
  .sort()
  .filter((c) => !(c in ROTAS_FORA_DA_MATRIZ))
  .map((caminho) => ({ caminho, texto: fs.readFileSync(path.join(RAIZ, caminho), "utf8") }))
  .map((i) => ({ ...i, exigencias: exigenciaDe(i.texto) }));

describe("matriz gerada das rotas de saída: cada rota × cada perfil", () => {
  beforeEach(() => {
    estado.sessao = null;
  });

  it("encontra as rotas (a matriz não está vazia)", () => {
    expect(itens.length).toBeGreaterThanOrEqual(30);
  });

  it("toda rota de saída declara saidaNegada (rota nova sem guarda falha)", () => {
    expect(itens.filter((i) => i.exigencias.length === 0).map((i) => i.caminho)).toEqual([]);
  });

  it("todo recurso declarado nas rotas existe no mapeamento de permissões", () => {
    const desconhecidos = itens.flatMap((i) => i.exigencias.flatMap((e) => [...e.recursos, ...e.algum]).filter((r) => !(r in RECURSO)).map((r) => `${i.caminho}: ${r}`));
    expect(desconhecidos).toEqual([]);
  });

  it("as exceções continuam existindo (a lista não apodrece)", () => {
    for (const caminho of Object.keys(ROTAS_FORA_DA_MATRIZ)) expect(Object.keys(ROTAS), caminho).toContain(caminho);
  });

  it("o feed .ics público confere a Agenda do dono do token", () => {
    const texto = fs.readFileSync(path.join(RAIZ, "src/app/api/public/agenda/[token]/route.ts"), "utf8");
    expect(texto).toContain("podeVerModulo(");
    expect(texto).toMatch(/"AGENDA"/);
  });

  for (const item of itens) {
    it(`${item.caminho.replace("/src/app/api/", "")}`, async () => {
      const modulo = await ROTAS[item.caminho]!();
      const GET = modulo.GET;
      expect(typeof GET, "a rota exporta GET").toBe("function");

      const falhas: string[] = [];
      for (const perfil of PERFIS) {
        // várias exigências na mesma rota (ex.: visões do estoque): a rota só é 100% negada se TODAS negarem
        const respostas = item.exigencias.map((e) => liberada(e, perfil.permissoes));
        const esperadoNegado = respostas.every((r) => !r);
        const esperadoLiberado = respostas.every(Boolean);
        if (!esperadoNegado && !esperadoLiberado) continue; // misto: a rota decide por visão; coberto pelo perfil que nega todas
        estado.sessao = { id: "u-matriz", nome: "Teste", login: "teste", email: null, papel: perfil.papel, permissoes: perfil.permissoes, precisaTrocarSenha: false };

        let resposta: Response | undefined;
        let erro: unknown;
        try {
          const { NextRequest } = await import("next/server");
          const requisicao = new NextRequest("http://localhost/api/teste?visao=posicao");
          resposta = await GET!(requisicao, { params: Promise.resolve({ id: "x1", token: "x" }) });
        } catch (e) {
          erro = e;
        }
        const negou = resposta instanceof Response && resposta.status === 403;
        if (esperadoNegado && !negou) {
          const detalhe = erro instanceof Error ? `lançou "${erro.message}"` : `respondeu ${resposta?.status}`;
          falhas.push(`${perfil.nome}: esperado 403, mas ${detalhe}`);
        }
        if (esperadoLiberado && negou) falhas.push(`${perfil.nome}: esperado LIBERADO, mas deu 403`);
      }
      expect(falhas).toEqual([]);
    });
  }

  it("quem não vê Agenda não recebe o feed (checagem pura usada pela rota)", () => {
    expect(podeVerModulo(permissoesEfetivas("CAMPO", { modulos: { AGENDA: { nivel: "SEM_ACESSO" } } }), "AGENDA")).toBe(false);
    expect(podeVerModulo(permissoesEfetivas("CAMPO"), "AGENDA")).toBe(true);
  });
});
