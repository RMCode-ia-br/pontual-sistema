import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { MENU, menuCelularVisivel, menuVisivel, paginasDisponiveis } from "@/components/layout/menu";
import { permissoesEfetivas } from "@/lib/dominio/permissoes";

const RAIZ = join(process.cwd(), "src", "app", "(app)");

function paginas(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) paginas(caminho, saida);
    else if (nome === "page.tsx") saida.push(caminho);
  }
  return saida;
}

/** Páginas que NÃO chamam exigirModulo, com o motivo. */
const EXCECOES: Record<string, string> = {
  "sem-acesso": "destino do redirecionamento: só pede sessão (senão haveria laço)",
  configuracoes: "só redireciona para /configuracoes/empresa, que é protegida",
};

function rotaDe(arquivo: string): string {
  return relative(RAIZ, arquivo).split(sep).join("/").replace(/\/?page\.tsx$/, "");
}

function modulosDaPagina(texto: string): string[] {
  const m = texto.match(/exigirModulo\(\s*(\[[^\]]*\]|"[A-Z_]+")/);
  if (!m) return [];
  return [...m[1]!.matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]!);
}

describe("camada 2: toda página da área logada exige módulo", () => {
  const todas = paginas(RAIZ);

  it("encontra as páginas", () => expect(todas.length).toBeGreaterThan(85));

  it("cada página chama exigirModulo (ou está nas exceções com motivo)", () => {
    const semGuarda = todas
      .filter((a) => !readFileSync(a, "utf8").includes("exigirModulo("))
      .map(rotaDe)
      .filter((r) => !(r in EXCECOES));
    expect(semGuarda).toEqual([]);
  });

  it("nenhuma página usa só exigirSessao (fora das exceções)", () => {
    const soSessao = todas.filter((a) => /exigirSessao\(/.test(readFileSync(a, "utf8")) && !(rotaDe(a) in EXCECOES)).map(rotaDe);
    expect(soSessao).toEqual([]);
  });

  it("as exceções continuam existindo (não ficam obsoletas)", () => {
    for (const rota of Object.keys(EXCECOES)) expect(existsSync(join(RAIZ, rota, "page.tsx")), rota).toBe(true);
  });
});

describe("menu e páginas concordam no módulo", () => {
  const itens = MENU.flatMap((g) => [g, ...(g.itens ?? [])]).filter((i) => i.href && "modulo" in i && i.modulo);

  it("há itens com módulo para conferir", () => expect(itens.length).toBeGreaterThan(30));

  for (const item of itens) {
    it(`${item.titulo} (${item.href}) → página exige o módulo ${item.modulo}`, () => {
      const rota = item.href === "/" ? "" : item.href!.replace(/^\//, "");
      const arquivo = join(RAIZ, rota, "page.tsx");
      expect(existsSync(arquivo), `página de ${item.href}`).toBe(true);
      expect(modulosDaPagina(readFileSync(arquivo, "utf8"))).toContain(item.modulo);
    });
  }
});

describe("menu por perfil", () => {
  const titulos = (papel: string, ajustes?: unknown) => menuVisivel(permissoesEfetivas(papel, ajustes)).map((g) => g.titulo);

  it("Dono/Gestão vê tudo", () => {
    expect(titulos("ADMIN")).toEqual(MENU.map((g) => g.titulo));
  });

  it("Escritório vê tudo menos Configurações e Ajuda", () => {
    expect(titulos("ESCRITORIO")).toEqual(MENU.map((g) => g.titulo).filter((t) => t !== "Configurações" && t !== "Ajuda"));
  });

  it("Campo vê só Painel, Agenda e tarefas, Clientes e Obras", () => {
    expect(titulos("CAMPO")).toEqual(["Painel", "Agenda e tarefas", "Clientes", "Obras"]);
  });

  it("Campo não vê item de dinheiro nem de custo em lugar nenhum", () => {
    const p = permissoesEfetivas("CAMPO");
    const hrefs = paginasDisponiveis(p).map((x) => x.href);
    for (const proibido of ["/propostas", "/funil", "/financeiro", "/financeiro/receber", "/compras", "/produtos", "/estoque/preco-do-kg", "/relatorios", "/configuracoes/usuarios", "/lixeira"]) {
      expect(hrefs, proibido).not.toContain(proibido);
    }
    for (const permitido of ["/", "/agenda", "/tarefas", "/clientes", "/obras", "/obras/assistencia", "/trocar-senha"]) expect(hrefs, permitido).toContain(permitido);
  });

  it("Preço do kg some sem 'ver custo e margem', mesmo com Estoque", () => {
    const sem = paginasDisponiveis(permissoesEfetivas("ESCRITORIO", { verCustoMargem: false })).map((x) => x.href);
    expect(sem).not.toContain("/estoque/preco-do-kg");
    expect(sem).toContain("/produtos");
  });

  it("ajuste por módulo concede o item", () => {
    expect(titulos("CAMPO", { modulos: { FINANCEIRO: { nivel: "VER" } } })).toContain("Financeiro");
  });

  it("ajuste inválido: Campo fica só com o que não tem módulo (nada)", () => {
    expect(titulos("CAMPO", { lixo: true })).toEqual([]);
  });

  it("barra do celular: 4 atalhos para quem vê tudo, Obras entra para o Campo", () => {
    expect(menuCelularVisivel(permissoesEfetivas("ADMIN")).map((x) => x.titulo)).toEqual(["Painel", "Funil", "Agenda", "Tarefas"]);
    expect(menuCelularVisivel(permissoesEfetivas("CAMPO")).map((x) => x.titulo)).toEqual(["Painel", "Agenda", "Tarefas", "Obras"]);
  });
});
