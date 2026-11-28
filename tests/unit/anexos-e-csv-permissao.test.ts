import { describe, expect, it } from "vitest";

import { acessoDoCsv, saidaNegada, semColunas } from "@/lib/csv/acesso";
import { permissoesEfetivas } from "@/lib/dominio/permissoes";
import { ENTIDADES_COM_ANEXO } from "@/lib/storage/regras";
import { REGRA_DO_ANEXO, podeNoAnexo } from "@/modules/anexos/permissao";

const u = (papel: string, ajustes?: unknown) => ({ id: "u", papel, permissoes: permissoesEfetivas(papel, ajustes) });
const DONO = u("ADMIN");
const ESCRITORIO = u("ESCRITORIO");
const CAMPO = u("CAMPO");

describe("anexo: a permissão é a do módulo da entidade dona do arquivo", () => {
  it("toda entidade que aceita anexo tem regra (e nenhuma regra sobra)", () => {
    expect(Object.keys(REGRA_DO_ANEXO).sort()).toEqual([...ENTIDADES_COM_ANEXO].sort());
  });

  it("entidade desconhecida é negada, até para o Dono (falha fechada)", () => {
    for (const op of ["ver", "criar", "excluir"] as const) expect(podeNoAnexo(DONO, op, "Tipologia")).toBe(false);
  });

  it("Dono/Gestão faz tudo com todo anexo", () => {
    for (const e of ENTIDADES_COM_ANEXO) for (const op of ["ver", "criar", "excluir"] as const) expect(podeNoAnexo(DONO, op, e), `${e} ${op}`).toBe(true);
  });

  it("Campo vê e anexa foto de visita, de medida, de obra e de assistência; não apaga", () => {
    for (const e of ["EventoAgenda", "MedidaRascunho", "Projeto", "Chamado", "Tarefa"]) {
      expect(podeNoAnexo(CAMPO, "ver", e), `${e} ver`).toBe(true);
      expect(podeNoAnexo(CAMPO, "criar", e), `${e} criar`).toBe(true);
      expect(podeNoAnexo(CAMPO, "excluir", e), `${e} excluir`).toBe(false);
    }
  });

  it("Campo não vê comprovante de lançamento, anexo de proposta, de fornecedor, de produto nem de funcionário", () => {
    for (const e of ["Lancamento", "Proposta", "Fornecedor", "Produto", "Funcionario", "ConfiguracaoEmpresa"]) {
      expect(podeNoAnexo(CAMPO, "ver", e), e).toBe(false);
      expect(podeNoAnexo(CAMPO, "criar", e), e).toBe(false);
    }
  });

  it("Campo só LÊ anexo de cliente", () => {
    expect(podeNoAnexo(CAMPO, "ver", "Cliente")).toBe(true);
    expect(podeNoAnexo(CAMPO, "criar", "Cliente")).toBe(false);
  });

  it("Escritório só APAGA anexo de Comercial, Obras e Financeiro", () => {
    const podeApagar = ENTIDADES_COM_ANEXO.filter((e) => podeNoAnexo(ESCRITORIO, "excluir", e)).sort();
    expect(podeApagar).toEqual(["Chamado", "Lancamento", "Projeto", "Proposta"]);
    for (const e of ENTIDADES_COM_ANEXO.filter((x) => x !== "ConfiguracaoEmpresa")) expect(podeNoAnexo(ESCRITORIO, "ver", e), `${e} ver`).toBe(true);
    expect(podeNoAnexo(ESCRITORIO, "ver", "ConfiguracaoEmpresa")).toBe(false);
  });

  it("anexo de proposta e de lançamento exige 'ver valores', mesmo com o módulo", () => {
    const semValores = u("ADMIN", { verValores: false });
    expect(podeNoAnexo(semValores, "ver", "Proposta")).toBe(false);
    expect(podeNoAnexo(semValores, "ver", "Lancamento")).toBe(false);
    expect(podeNoAnexo(semValores, "ver", "Cliente")).toBe(true);
  });

  it("ajuste inválido: Campo fechado não vê nem anexa nada", () => {
    const fechado = u("CAMPO", { lixo: true });
    for (const e of ENTIDADES_COM_ANEXO) for (const op of ["ver", "criar", "excluir"] as const) expect(podeNoAnexo(fechado, op, e), `${e} ${op}`).toBe(false);
  });
});

describe("saidaNegada: 403 por módulo e por acesso transversal", () => {
  const status = (usuario: ReturnType<typeof u>, e: Parameters<typeof saidaNegada>[1]) => saidaNegada(usuario, e)?.status ?? null;

  it("libera quem tem o módulo e os acessos pedidos", () => {
    expect(status(DONO, { recursos: ["proposta"], valores: true })).toBeNull();
    expect(status(ESCRITORIO, { recursos: ["relatorio", "obra"], custo: true })).toBeNull();
  });

  it("nega com 403 quando falta módulo, valores ou custo", () => {
    expect(status(CAMPO, { recursos: ["proposta"] })).toBe(403);
    expect(status(CAMPO, { recursos: ["relatorio", "obra"] })).toBe(403); // sem Relatórios
    expect(status(u("ADMIN", { verValores: false }), { recursos: ["proposta"], valores: true })).toBe(403);
    expect(status(u("ADMIN", { verCustoMargem: false }), { recursos: ["relatorio", "obra"], custo: true })).toBe(403);
  });

  it("'algum' libera com UM dos recursos (folha de produção: Obras ou Comercial)", () => {
    expect(status(CAMPO, { algum: ["obra", "proposta"] })).toBeNull();
    expect(status(u("CAMPO", { modulos: { OBRAS: { nivel: "SEM_ACESSO" } } }), { algum: ["obra", "proposta"] })).toBe(403);
  });

  it("a resposta 403 não vai para cache", async () => {
    const r = saidaNegada(CAMPO, { recursos: ["proposta"] })!;
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(await r.json()).toEqual({ erro: "Sem permissão para esta exportação." });
  });

  it("acessoDoCsv reflete valores e custo", () => {
    expect(acessoDoCsv(DONO)).toEqual({ podeVerInterno: true, podeVerValores: true });
    expect(acessoDoCsv(CAMPO)).toEqual({ podeVerInterno: false, podeVerValores: false });
    expect(acessoDoCsv(u("ADMIN", { verCustoMargem: false }))).toEqual({ podeVerInterno: false, podeVerValores: true });
  });
});

describe("semColunas: CSV montado à mão perde as colunas sem a permissão", () => {
  const cabecalho = ["Código", "Obra", "Valor fechado"];
  const linhas: unknown[][] = [
    ["1", "A", "10,00"],
    ["2", "B", "20,00"],
    ["AVISO: exportação limitada"],
  ];

  it("tira título e conteúdo da coluna, e deixa a linha de aviso intacta", () => {
    const r = semColunas(cabecalho, linhas, [2]);
    expect(r.cabecalho).toEqual(["Código", "Obra"]);
    expect(r.linhas).toEqual([["1", "A"], ["2", "B"], ["AVISO: exportação limitada"]]);
    expect(JSON.stringify(r)).not.toContain("10,00");
  });

  it("sem nada a remover, não muda nada", () => {
    expect(semColunas(cabecalho, linhas, [])).toEqual({ cabecalho, linhas });
  });
});
