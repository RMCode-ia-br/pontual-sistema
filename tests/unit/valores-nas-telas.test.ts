import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { acoesPermitidas, permissoesDaLista } from "@/components/lista/acoes-permitidas";
import { permissoesEfetivas } from "@/lib/dominio/permissoes";
import { semValoresNosChamados, semValoresNosMateriais } from "@/modules/obras/sem-valores";
import { blocosDoPainel } from "@/modules/painel/acesso";
import { ACESSO_DOS_RELATORIOS, rotaLiberada } from "@/modules/relatorios/acesso";
import type { MateriaisDaObra } from "@/modules/obras/queries-materiais";

const RAIZ = path.resolve(__dirname, "../..");
const DONO = permissoesEfetivas("ADMIN");
const ESCRITORIO = permissoesEfetivas("ESCRITORIO");
const CAMPO = permissoesEfetivas("CAMPO");

describe("tabela de acesso dos relatórios bate com a página e com o CSV", () => {
  for (const [href, regra] of Object.entries(ACESSO_DOS_RELATORIOS)) {
    it(`${href}: o exigirModulo da página é o da tabela`, () => {
      const arquivo = path.join(RAIZ, "src/app/(app)", href.replace(/^\//, ""), "page.tsx");
      const texto = fs.readFileSync(arquivo, "utf8");
      const m = texto.match(/exigirModulo\(\s*(\[[^\]]*\]|"[A-Z_]+")\s*(?:,\s*\{([^}]*)\})?\s*\)/);
      expect(m, "chamada de exigirModulo").not.toBeNull();
      const modulos = [...m![1]!.matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]);
      expect(modulos.sort()).toEqual([...regra.modulos].sort());
      const exige = [...(m![2] ?? "").matchAll(/"(valores|custo)"/g)].map((x) => x[1]);
      expect(exige.sort()).toEqual([...regra.exige].sort());
    });
  }

  it("quem tem custo tem valores: o CSV de relatório que mostra dinheiro exige valores como a página", () => {
    for (const slug of ["vendas", "fechamento", "funil", "clientes", "produtos-e-precos", "obras", "faturamento"]) {
      const texto = fs.readFileSync(path.join(RAIZ, `src/app/api/exportar/relatorios/${slug}/route.ts`), "utf8");
      expect(texto, slug).toMatch(/saidaNegada\(usuario, \{[^}]*valores: true/);
    }
  });

  it("índice por perfil", () => {
    const abertos = (p: typeof DONO) => Object.keys(ACESSO_DOS_RELATORIOS).filter((h) => rotaLiberada(p, h)).sort();
    expect(abertos(DONO)).toEqual(Object.keys(ACESSO_DOS_RELATORIOS).sort());
    expect(abertos(ESCRITORIO)).toEqual(Object.keys(ACESSO_DOS_RELATORIOS).sort());
    expect(abertos(CAMPO)).toEqual([]);
    const semCusto = abertos(permissoesEfetivas("ADMIN", { verCustoMargem: false }));
    expect(semCusto).not.toContain("/relatorios/margem-obras");
    expect(semCusto).toContain("/relatorios/vendas");
    expect(abertos(permissoesEfetivas("ADMIN", { verValores: false }))).toEqual(["/relatorios/avaliacoes", "/relatorios/estoque", "/relatorios/producao"]);
    expect(rotaLiberada(DONO, "/relatorios/inexistente")).toBe(false);
  });
});

describe("blocos do painel", () => {
  it("Campo vê só agenda, obras e clientes, sem nenhum bloco de dinheiro, vendas ou custo", () => {
    expect(blocosDoPainel(CAMPO)).toEqual({ agenda: true, obras: true, clientes: true, estoque: false, comercial: false, vendas: false, financeiro: false, relObras: false, relEstoque: false, custo: false });
  });
  it("Escritório e Dono veem todos", () => {
    for (const p of [DONO, ESCRITORIO]) expect(Object.values(blocosDoPainel(p)).every(Boolean)).toBe(true);
  });
  it("sem 'ver valores' somem comercial, vendas e financeiro, e o custo", () => {
    const b = blocosDoPainel(permissoesEfetivas("ADMIN", { verValores: false }));
    expect([b.comercial, b.vendas, b.financeiro, b.custo]).toEqual([false, false, false, false]);
    expect([b.agenda, b.obras, b.estoque]).toEqual([true, true, true]);
  });
  it("ajuste inválido fecha o painel todo", () => {
    expect(Object.values(blocosDoPainel(permissoesEfetivas("CAMPO", { lixo: 1 }))).some(Boolean)).toBe(false);
  });
});

describe("obra: valores removidos no servidor", () => {
  const m = {
    propostas: [],
    linhas: [{ chave: "a", produtoId: null, produto: "p", codigo: null, unidadeFormula: "M", unidadeProduto: null, necessario: 1, equivalencias: null, saldo: null, jaNaObra: 0, falta: null, semCusto: true }],
    semComposicao: [],
    vidros: [],
    compras: [{ id: "c", numero: "1", fornecedor: "f", tipo: "MATERIAL", status: "RECEBIDA", itens: 1, recebidoCentavos: 12345 }],
    retalhosGerados: [],
    retalhosUsados: [],
  } as unknown as MateriaisDaObra;

  it("sem valores a compra perde o recebido; sem custo o aviso 'sem custo' some", () => {
    const r = semValoresNosMateriais(m, { valores: false, custo: false });
    expect(r.compras[0]!.recebidoCentavos).toBeNull();
    expect(r.linhas[0]!.semCusto).toBe(false);
    expect(JSON.stringify(r)).not.toContain("12345");
  });
  it("com permissão nada muda", () => {
    expect(semValoresNosMateriais(m, { valores: true, custo: true })).toEqual(m);
  });
  it("chamado perde o valor da visita sem valores", () => {
    const linhas = [{ id: "1", valorCobradoCentavos: 5000 }];
    expect(semValoresNosChamados(linhas, false)).toEqual([{ id: "1", valorCobradoCentavos: null }]);
    expect(semValoresNosChamados(linhas, true)).toEqual(linhas);
  });
});

describe("ações em lote por permissão", () => {
  const acoes = [{ rotulo: "Inativar" }, { rotulo: "Reativar" }, { rotulo: "Enviar à lixeira" }, { rotulo: "Outra" }];
  const rotulos = (p: ReturnType<typeof permissoesDaLista>) => acoesPermitidas(acoes, p).map((a) => a.rotulo);
  const de = (papel: "ADMIN" | "ESCRITORIO" | "CAMPO", recurso: string) => permissoesDaLista({ id: "u", papel }, recurso);

  it("Dono usa todas; ação de rótulo desconhecido nunca aparece", () => {
    expect(rotulos(de("ADMIN", "cliente"))).toEqual(["Inativar", "Reativar", "Enviar à lixeira"]);
  });
  it("Escritório só reativa em Clientes, Cadastros e Estoque; inativa e exclui em Comercial", () => {
    for (const r of ["cliente", "fornecedor", "funcionario", "produto"]) expect(rotulos(de("ESCRITORIO", r)), r).toEqual(["Reativar"]);
    expect(rotulos(de("ESCRITORIO", "projeto"))).toEqual(["Inativar", "Reativar", "Enviar à lixeira"]);
  });
  it("Campo não usa nenhuma", () => {
    expect(rotulos(de("CAMPO", "cliente"))).toEqual([]);
  });
  it("o CSV de clientes (CPF, e-mail) só sai para quem edita Clientes; os demais CSV, para quem vê o módulo", () => {
    expect(de("CAMPO", "cliente").exportar).toBe(false);
    expect(de("ESCRITORIO", "cliente").exportar).toBe(true);
    expect(de("ADMIN", "cliente").exportar).toBe(true);
    expect(de("CAMPO", "fornecedor").exportar).toBe(false); // Campo não tem Cadastros
    expect(de("ESCRITORIO", "fornecedor").exportar).toBe(true);
  });
});
