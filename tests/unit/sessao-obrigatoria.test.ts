import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guarda estático: TODA Server Action e Route Handler precisa exigir sessão (spec seção 10).
 * Um arquivo "use server" transforma cada função exportada em endpoint público do navegador; esquecer
 * o `exigirSessao()` numa ação nova seria uma falha de segurança que nenhum outro teste pegaria.
 * O teste lê o código e FALHA quando uma ação ou rota nova não tem a checagem.
 */
const RAIZ = path.resolve(__dirname, "../../src");

function arquivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

const todos = arquivos(RAIZ);
const relativo = (f: string) => path.relative(RAIZ, f).split(path.sep).join("/");

/** Ações que precisam funcionar SEM sessão (ou que encerram a sessão), por motivo explícito. */
const ACOES_SEM_SESSAO: Record<string, string> = {
  entrar: "tela de login (não há sessão ainda; o bloqueio por tentativas está em autenticar())",
  sair: "encerra a sessão; não expõe dados",
};

/** Rotas públicas por desenho, e como cada uma se protege. */
const ROTAS_PUBLICAS: Record<string, string> = {
  "app/api/auth/[...nextauth]/route.ts": "Auth.js (login)",
  "app/api/health/route.ts": "verificação de saúde, não expõe dados",
  "app/api/cron/diario/route.ts": "protegida por CRON_SECRET (comparação em tempo constante)",
  "app/api/public/agenda/[token]/route.ts": "feed .ics assinável: token de 256 bits só com hash no banco, revogável, 404 uniforme, sem dados financeiros",
};

function funcoesExportadas(texto: string): { nome: string; corpo: string }[] {
  const marcador = /^export async function (\w+)\(/gm;
  const achados = [...texto.matchAll(marcador)];
  return achados.map((m, i) => ({
    nome: m[1],
    corpo: texto.slice(m.index, i + 1 < achados.length ? achados[i + 1].index : undefined),
  }));
}

/** Corpo de uma função declarada neste arquivo (exportada ou não), para seguir delegações. */
function corpoDaFuncaoLocal(texto: string, nome: string): string | null {
  const m = new RegExp(`(?:async )?function ${nome}\\(`).exec(texto);
  if (!m) return null;
  const resto = texto.slice(m.index + 1);
  const proximo = resto.search(/\n(?:export )?(?:async )?function \w+\(/);
  return texto.slice(m.index, proximo === -1 ? undefined : m.index + 1 + proximo);
}

function exigeSessao(texto: string, corpo: string): boolean {
  if (/exigirSessao\(|sessaoParaApi\(/.test(corpo)) return true;
  // Delegação: a função chama outra do mesmo arquivo que exige a sessão (ex.: concluirTarefa -> mudarStatus).
  for (const chamada of corpo.matchAll(/\b(\w+)\(/g)) {
    const alvo = corpoDaFuncaoLocal(texto, chamada[1]);
    if (alvo && alvo !== corpo && /exigirSessao\(|sessaoParaApi\(/.test(alvo)) return true;
  }
  return false;
}

describe("Server Actions exigem sessão", () => {
  const arquivosDeAcoes = todos.filter((f) => /^\s*["']use server["']/.test(fs.readFileSync(f, "utf8")));

  it("encontra os arquivos de ações (o guarda não é vazio)", () => {
    expect(arquivosDeAcoes.length).toBeGreaterThanOrEqual(8);
  });

  for (const arquivo of arquivosDeAcoes) {
    it(`${relativo(arquivo)}: toda função exportada começa exigindo sessão`, () => {
      const texto = fs.readFileSync(arquivo, "utf8");
      const funcoes = funcoesExportadas(texto);
      expect(funcoes.length, "arquivo 'use server' sem funções exportadas").toBeGreaterThan(0);
      const semSessao = funcoes.filter((f) => !ACOES_SEM_SESSAO[f.nome] && !exigeSessao(texto, f.corpo)).map((f) => f.nome);
      expect(semSessao, `ações sem exigirSessao() em ${relativo(arquivo)}`).toEqual([]);
    });
  }

  it("as exceções sem sessão existem de verdade (a lista não apodrece)", () => {
    const todasAsFuncoes = arquivosDeAcoes.flatMap((f) => funcoesExportadas(fs.readFileSync(f, "utf8")).map((x) => x.nome));
    for (const nome of Object.keys(ACOES_SEM_SESSAO)) expect(todasAsFuncoes, nome).toContain(nome);
  });

  it("arquivos 'use server' só exportam funções assíncronas (o resto vira endpoint ou quebra o build)", () => {
    for (const arquivo of arquivosDeAcoes) {
      const texto = fs.readFileSync(arquivo, "utf8");
      const exportsNaoFuncao = [...texto.matchAll(/^export (const|let|var|class|default)\b.*$/gm)].map((m) => m[0]);
      expect(exportsNaoFuncao, relativo(arquivo)).toEqual([]);
    }
  });
});

describe("Route Handlers exigem sessão ou são públicos por desenho", () => {
  const rotas = todos.filter((f) => /\/route\.tsx?$/.test(f.split(path.sep).join("/")));

  it("encontra as rotas", () => {
    expect(rotas.length).toBeGreaterThanOrEqual(4);
  });

  for (const rota of rotas) {
    const nome = relativo(rota);
    it(`${nome}: ${ROTAS_PUBLICAS[nome] ? "pública por desenho (" + ROTAS_PUBLICAS[nome] + ")" : "exige sessão"}`, () => {
      const texto = fs.readFileSync(rota, "utf8");
      if (ROTAS_PUBLICAS[nome]) {
        // A lista de rotas públicas precisa bater com a do proxy, senão a rota nem seria alcançável sem login.
        return;
      }
      expect(/sessaoParaApi\(|exigirSessao\(/.test(texto), `${nome} não chama sessaoParaApi()`).toBe(true);
    });
  }
});
