import fs from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { NIVEL_DO_VERBO, RECURSO, ROTULO_DO_MODULO, decidir, permissoesEfetivas, type PermissoesEfetivas } from "@/lib/dominio/permissoes";
import { RECURSO_DA_LIXEIRA, TIPOS_DA_LIXEIRA } from "@/modules/lixeira/tipos";

/**
 * MATRIZ GERADA (Fase 7C, camada 3): para CADA Server Action exportada × CADA perfil, o resultado esperado é DERIVADO do
 * mapeamento recurso → módulo → nível (`decidir`), lendo no código-fonte o(s) `can(sessao, verbo, recurso)` da ação.
 * Depois a ação é CHAMADA de verdade, com a sessão do perfil e com um banco que EXPLODE se for tocado:
 *  - esperado "negado": a ação tem de responder "Sem permissão" sem tocar o banco;
 *  - esperado "liberado": a ação NÃO pode responder "Sem permissão" (qualquer outro desfecho vale: os argumentos são lixo).
 * Ação sem `can(` ou com par sem mapeamento falha aqui (e nos guardas estáticos). Ação com decisão mista entre alternativas
 * de um verbo ternário (ex.: `ativo ? "reativar" : "inativar"`) fica de fora só para aquele perfil.
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
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
  unstable_cache: <T,>(fn: T) => fn,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

const RAIZ = path.resolve(__dirname, "../..");
const MODULOS_DE_ACOES = import.meta.glob<Record<string, unknown>>(["/src/modules/**/actions.ts", "/src/modules/**/actions/*.ts", "/src/modules/**/actions-rapido.ts"]);

// ---------------------------------------------------------------------------------------------------------------------
// Leitura estática: quais `can(` cada ação confere
// ---------------------------------------------------------------------------------------------------------------------

function funcoesExportadas(texto: string): { nome: string; corpo: string }[] {
  const achados = [...texto.matchAll(/^export async function (\w+)\(/gm)];
  return achados.map((m, i) => ({ nome: m[1]!, corpo: texto.slice(m.index, i + 1 < achados.length ? achados[i + 1]!.index : undefined) }));
}

function corpoLocal(texto: string, nome: string): string | null {
  const m = new RegExp(`(?:async )?function ${nome}\\(`).exec(texto);
  if (!m) return null;
  const resto = texto.slice(m.index + 1);
  const proximo = resto.search(/\n(?:export )?(?:async )?function \w+\(/);
  return texto.slice(m.index, proximo === -1 ? undefined : m.index + 1 + proximo);
}

function argumentos(texto: string): string[] {
  const partes: string[] = [];
  let nivel = 0;
  let aspas: string | null = null;
  let atual = "";
  for (const ch of texto) {
    if (aspas) { atual += ch; if (ch === aspas) aspas = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { aspas = ch; atual += ch; continue; }
    if (ch === "(" || ch === "[" || ch === "{") nivel++;
    if (ch === ")" || ch === "]" || ch === "}") nivel--;
    if (ch === "," && nivel === 0) { partes.push(atual.trim()); atual = ""; continue; }
    atual += ch;
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes;
}

type ChamadaCan = { verbos: string[]; recursos: string[] | "dinamico" };

function chamadasDeCan(corpo: string): ChamadaCan[] {
  const todas = lerChamadas(corpo);
  // Guarda = `!can(...)`. Um `can(` que só decide um detalhe (ex.: gravar ou não o investimento) não é guarda; sem nenhuma guarda
  // (ex.: a busca global, que filtra), vale o conjunto todo.
  const guardas = todas.filter((c) => c.guarda);
  return (guardas.length > 0 ? guardas : todas).map(({ verbos, recursos }) => ({ verbos, recursos }));
}

function lerChamadas(corpo: string): (ChamadaCan & { guarda: boolean })[] {
  const saida: (ChamadaCan & { guarda: boolean })[] = [];
  for (const m of corpo.matchAll(/(?<![\w.])can\(/g)) {
    let i = (m.index ?? 0) + m[0].length;
    const inicio = i;
    let nivel = 1;
    let aspas: string | null = null;
    for (; i < corpo.length && nivel > 0; i++) {
      const ch = corpo[i];
      if (aspas) { if (ch === aspas) aspas = null; continue; }
      if (ch === '"' || ch === "'" || ch === "`") aspas = ch;
      else if (ch === "(") nivel++;
      else if (ch === ")") nivel--;
    }
    const args = argumentos(corpo.slice(inicio, i - 1));
    const literais = (s: string | undefined) => [...(s ?? "").matchAll(/"([^"]+)"/g)].map((x) => x[1]!);
    const recursos = literais(args[2]);
    saida.push({ verbos: literais(args[1]), recursos: recursos.length > 0 ? recursos : "dinamico", guarda: corpo[(m.index ?? 0) - 1] === "!" });
  }
  return saida;
}

/** Chamadas de `can(` que decidem a ação: as do próprio corpo; se não houver, as da primeira função local chamada que tenha. */
function chamadasDaAcao(texto: string, corpo: string, vistos = new Set<string>(), nivel = 0): ChamadaCan[] {
  const proprias = chamadasDeCan(corpo);
  if (proprias.length > 0 || nivel >= 3) return proprias;
  for (const chamada of corpo.matchAll(/\b(\w+)\(/g)) {
    const nome = chamada[1]!;
    if (vistos.has(nome)) continue;
    vistos.add(nome);
    const alvo = corpoLocal(texto, nome);
    if (!alvo || alvo === corpo) continue;
    const achadas = chamadasDaAcao(texto, alvo, vistos, nivel + 1);
    if (achadas.length > 0) return achadas;
  }
  return [];
}

// ---------------------------------------------------------------------------------------------------------------------
// Perfis
// ---------------------------------------------------------------------------------------------------------------------

type PerfilDeTeste = { nome: string; papel: string; permissoes: PermissoesEfetivas };
const PERFIS: PerfilDeTeste[] = [
  { nome: "Dono/Gestão", papel: "ADMIN", permissoes: permissoesEfetivas("ADMIN") },
  { nome: "Escritório", papel: "ESCRITORIO", permissoes: permissoesEfetivas("ESCRITORIO") },
  { nome: "Campo", papel: "CAMPO", permissoes: permissoesEfetivas("CAMPO") },
  { nome: "Campo com ajuste inválido (fechado)", papel: "CAMPO", permissoes: permissoesEfetivas("CAMPO", { lixo: true }) },
  { nome: "Dono sem custo e margem", papel: "ADMIN", permissoes: permissoesEfetivas("ADMIN", { verCustoMargem: false }) },
  { nome: "Dono sem valores", papel: "ADMIN", permissoes: permissoesEfetivas("ADMIN", { verValores: false }) },
];

function sessaoDe(p: PerfilDeTeste) {
  return { id: "u-matriz", nome: "Teste", login: "teste", email: null, papel: p.papel, permissoes: p.permissoes, precisaTrocarSenha: false };
}

function ehNegacao(resultado: unknown, erro: unknown): boolean {
  const r = resultado as { ok?: boolean; erro?: string } | null | undefined;
  if (r && typeof r === "object" && r.ok === false && /permiss/i.test(r.erro ?? "")) return true;
  return erro instanceof Error && /permiss/i.test(erro.message);
}

type Esperado = "negado" | "liberado" | "misto";

/** Recursos de uma chamada; o dinâmico da lixeira vem do tipo no nome da ação (restaurarClientes → clientes). */
function recursosDe(c: ChamadaCan, nomeDaAcao: string): string[] {
  if (c.recursos !== "dinamico") return c.recursos;
  const sufixo = nomeDaAcao.replace(/^restaurar/, "").toLowerCase();
  const tipo = TIPOS_DA_LIXEIRA.find((x) => x === sufixo);
  return tipo ? [RECURSO_DA_LIXEIRA[tipo]] : [];
}

function esperadoPara(chamadas: ChamadaCan[], nomeDaAcao: string, p: PermissoesEfetivas): Esperado {
  const vereditos: Esperado[] = chamadas.map((c) => {
    const recursos = recursosDe(c, nomeDaAcao);
    const respostas = c.verbos.flatMap((v) => recursos.map((r) => decidir(p, v, r)));
    if (respostas.length === 0) return "misto";
    if (respostas.every(Boolean)) return "liberado";
    if (respostas.every((x) => !x)) return "negado";
    return "misto";
  });
  if (vereditos.includes("negado")) return "negado";
  if (vereditos.every((v) => v === "liberado")) return "liberado";
  return "misto";
}

// ---------------------------------------------------------------------------------------------------------------------

const ACOES_FORA_DA_MATRIZ: Record<string, string> = {
  entrar: "login: ainda não há usuário",
  sair: "encerra a sessão do próprio usuário",
  trocarSenha: "o usuário troca a PRÓPRIA senha",
  listarNotificacoes: "notificações do próprio usuário, sem módulo",
  marcarNotificacoesComoLidas: "notificações do próprio usuário, sem módulo",
};

/** Ações que FILTRAM o que devolvem por módulo em vez de responder "Sem permissão" (testadas à parte, abaixo). */
const ACOES_QUE_FILTRAM = new Set(["buscaGlobal"]);

type Item = { arquivo: string; nome: string; chamadas: ChamadaCan[] };

const itens: Item[] = [];
for (const caminho of Object.keys(MODULOS_DE_ACOES).sort()) {
  const texto = fs.readFileSync(path.join(RAIZ, caminho), "utf8");
  if (!/^\s*["']use server["']/.test(texto)) continue;
  for (const f of funcoesExportadas(texto)) {
    if (ACOES_FORA_DA_MATRIZ[f.nome]) continue;
    itens.push({ arquivo: caminho, nome: f.nome, chamadas: chamadasDaAcao(texto, f.corpo) });
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Classificação por módulo e relatório (gerado da própria matriz)
// ---------------------------------------------------------------------------------------------------------------------

const TRANSVERSAL = "Transversal (anexos e filtros salvos)";

/** Rótulos dos módulos que a ação toca (o do recurso e os de `tambem`). */
function modulosDaAcao(item: Item): string[] {
  const rotulos = new Set<string>();
  for (const c of item.chamadas) {
    for (const r of recursosDe(c, item.nome)) {
      const regra = RECURSO[r];
      if (!regra) continue;
      if (regra.modulo === "QUALQUER") rotulos.add(TRANSVERSAL);
      else if (regra.modulo === null) rotulos.add("Transversal (valores e custo)");
      else for (const m of [regra.modulo, ...(regra.tambem ?? [])]) rotulos.add(ROTULO_DO_MODULO[m]);
    }
  }
  return [...rotulos].sort();
}

function ehDestrutiva(item: Item): boolean {
  return item.chamadas.some((c) => c.verbos.some((v) => NIVEL_DO_VERBO[v] === "DESTRUTIVO"));
}

function agrupar(lista: Item[]): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const i of lista) {
    const chave = modulosDaAcao(i).join(" + ") || "(sem módulo)";
    mapa.set(chave, [...(mapa.get(chave) ?? []), i.nome]);
  }
  return new Map([...mapa.entries()].sort(([a], [b]) => a.localeCompare(b, "pt")));
}

function emMarkdown(titulo: string, lista: Item[]): string {
  if (lista.length === 0) return `#### ${titulo} (0)\n\n_nenhuma_\n`;
  const linhas = [...agrupar(lista)].map(([modulo, nomes]) => `- **${modulo}** (${nomes.length}): ${nomes.join(", ")}`);
  return `#### ${titulo} (${lista.length})\n\n${linhas.join("\n")}\n`;
}

const ESCRITORIO = PERFIS.find((p) => p.papel === "ESCRITORIO")!.permissoes;
const CAMPO = PERFIS.find((p) => p.nome === "Campo")!.permissoes;
const pesquisaveis = itens.filter((i) => !ACOES_QUE_FILTRAM.has(i.nome));
const veredito = (i: Item, p: PermissoesEfetivas) => esperadoPara(i.chamadas, i.nome, p);

const campoPermitidas = pesquisaveis.filter((i) => veredito(i, CAMPO) === "liberado");
const escritorioNegadas = pesquisaveis.filter((i) => veredito(i, ESCRITORIO) === "negado");
const escritorioDestrutivasPermitidas = pesquisaveis.filter((i) => ehDestrutiva(i) && veredito(i, ESCRITORIO) === "liberado");

/** O que o Campo pode fazer (decisão 177): agenda e tarefas, visita, etapa, foto, nota de campo; o resto de Clientes é só leitura. */
const MODULOS_DO_CAMPO = new Set(["Agenda e tarefas", "Obras", "Clientes", TRANSVERSAL]);
const MODULOS_COM_DESTRUTIVA_DO_ESCRITORIO = new Set(["Comercial", "Obras", "Financeiro"]);

describe("matriz gerada: cada Server Action × cada perfil", () => {
  beforeEach(() => {
    estado.sessao = null;
  });

  it("encontra as ações (a matriz não está vazia)", () => {
    expect(itens.length).toBeGreaterThan(200);
  });

  it("toda ação tem pelo menos um can() lido (ação sem mapeamento falha)", () => {
    expect(itens.filter((i) => i.chamadas.length === 0).map((i) => `${i.arquivo}: ${i.nome}`)).toEqual([]);
  });

  for (const item of itens.filter((i) => !ACOES_QUE_FILTRAM.has(i.nome))) {
    it(`${item.arquivo.replace("/src/modules/", "")} › ${item.nome}`, async () => {
      const modulo = await MODULOS_DE_ACOES[item.arquivo]!();
      const acao = modulo[item.nome] as (...args: unknown[]) => Promise<unknown>;
      expect(typeof acao, `${item.nome} exportada`).toBe("function");

      const falhas: string[] = [];
      for (const perfil of PERFIS) {
        const esperado = esperadoPara(item.chamadas, item.nome, perfil.permissoes);
        if (esperado === "misto") continue;
        estado.sessao = sessaoDe(perfil);
        let resultado: unknown;
        let erro: unknown;
        try {
          resultado = await acao(...Array.from({ length: Math.max(acao.length, 1) }, () => new FormData()));
        } catch (e) {
          erro = e;
        }
        const negou = ehNegacao(resultado, erro);
        if (esperado === "negado" && !negou) {
          const detalhe = erro instanceof Error ? `lançou "${erro.message}"` : `respondeu ${JSON.stringify(resultado)?.slice(0, 120)}`;
          falhas.push(`${perfil.nome}: esperado NEGADO, mas ${detalhe}`);
        }
        if (esperado === "liberado" && negou) falhas.push(`${perfil.nome}: esperado LIBERADO, mas foi negado`);
      }
      expect(falhas).toEqual([]);
    });
  }

  describe("invariantes dos perfis, lidas da própria matriz", () => {
    it("o Campo só consegue agir em Agenda e tarefas, Obras (e anexos); em Clientes só LÊ", () => {
      const fora = campoPermitidas.filter((i) => modulosDaAcao(i).some((m) => !MODULOS_DO_CAMPO.has(m))).map((i) => `${i.nome} (${modulosDaAcao(i).join(" + ")})`);
      expect(fora).toEqual([]);
      const alteraCliente = campoPermitidas.filter((i) => modulosDaAcao(i).includes("Clientes") && i.chamadas.some((c) => c.verbos.some((v) => NIVEL_DO_VERBO[v] !== "VER"))).map((i) => i.nome);
      expect(alteraCliente).toEqual([]);
    });

    it("o Campo não executa nenhuma ação destrutiva, nem lê valores ou custo", () => {
      expect(campoPermitidas.filter(ehDestrutiva).map((i) => i.nome)).toEqual([]);
      const comTransversal = campoPermitidas.filter((i) => modulosDaAcao(i).includes("Transversal (valores e custo)")).map((i) => i.nome);
      expect(comTransversal).toEqual([]);
    });

    it("o Escritório só tem ação destrutiva em Comercial, Obras e Financeiro", () => {
      const fora = escritorioDestrutivasPermitidas
        .filter((i) => modulosDaAcao(i).some((m) => !MODULOS_COM_DESTRUTIVA_DO_ESCRITORIO.has(m) && m !== TRANSVERSAL))
        .map((i) => `${i.nome} (${modulosDaAcao(i).join(" + ")})`);
      expect(fora).toEqual([]);
    });

    it("gera o relatório em Markdown quando GERAR_RELATORIO_MATRIZ aponta para um arquivo", () => {
      const destino = process.env.GERAR_RELATORIO_MATRIZ;
      if (!destino) return;
      const texto = [
        `Gerado da matriz (${itens.length} ações; a \`buscaGlobal\` filtra por módulo em vez de negar e fica fora das listas).`,
        "",
        "### Campo",
        "",
        emMarkdown("Ações permitidas", campoPermitidas),
        "### Escritório",
        "",
        emMarkdown("Ações negadas", escritorioNegadas),
        emMarkdown("Ações destrutivas permitidas", escritorioDestrutivasPermitidas),
      ].join("\n");
      fs.writeFileSync(destino, texto, "utf8");
    });
  });

  describe("buscaGlobal filtra por módulo (não nega)", () => {
    const VAZIO = { clientes: [], projetos: [], propostas: [], fornecedores: [], produtos: [], funcionarios: [], tarefas: [], usuarios: [] };

    async function buscar(permissoes: PermissoesEfetivas, papel = "CAMPO") {
      estado.sessao = sessaoDe({ nome: "x", papel, permissoes });
      const modulo = (await MODULOS_DE_ACOES["/src/modules/busca/actions.ts"]!()) as { buscaGlobal: (t: string) => Promise<unknown> };
      return modulo.buscaGlobal("ab");
    }

    it("quem não vê nenhum módulo pesquisável recebe tudo vazio e o banco nem é tocado", async () => {
      await expect(buscar(permissoesEfetivas("CAMPO", { lixo: true }))).resolves.toEqual(VAZIO);
      const soFinanceiro = permissoesEfetivas("CAMPO", { modulos: { FINANCEIRO: { nivel: "VER" }, AGENDA: { nivel: "SEM_ACESSO" }, CLIENTES: { nivel: "SEM_ACESSO" }, OBRAS: { nivel: "SEM_ACESSO" } } });
      await expect(buscar(soFinanceiro)).resolves.toEqual(VAZIO);
    });

    it("quem vê Clientes ou Agenda e tarefas tem esses grupos consultados (o banco falso explode)", async () => {
      await expect(buscar(permissoesEfetivas("CAMPO"))).rejects.toThrow("BANCO_TOCADO");
      await expect(buscar(permissoesEfetivas("ADMIN"), "ADMIN")).rejects.toThrow("BANCO_TOCADO");
    });
  });
});
