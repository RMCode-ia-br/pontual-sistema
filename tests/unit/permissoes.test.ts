import { describe, expect, it } from "vitest";
import {
  MODULOS,
  NIVEL_DO_VERBO,
  RECURSO,
  decidir,
  ehAdministrador,
  permissoesEfetivas,
  podeAlterarModulo,
  podeDestruirNoModulo,
  podeVerModulo,
  type Modulo,
  type Papel,
} from "@/lib/dominio/permissoes";
import { can } from "@/lib/permissoes";

/**
 * Tabela ESPERADA, escrita à mão e independente do código (decisão 177).
 * V = pode ver · A = pode alterar · D = alterar + excluir e desfazer · - = sem acesso.
 */
const ESPERADO: Record<Papel, Record<Modulo, "-" | "V" | "A" | "D">> = {
  ADMIN: { PAINEL: "V", AGENDA: "D", COMERCIAL: "D", CLIENTES: "D", OBRAS: "D", FINANCEIRO: "D", ESTOQUE: "D", CADASTROS: "D", RELATORIOS: "V", CONFIGURACOES: "D" },
  ESCRITORIO: { PAINEL: "V", AGENDA: "A", COMERCIAL: "D", CLIENTES: "A", OBRAS: "D", FINANCEIRO: "D", ESTOQUE: "A", CADASTROS: "A", RELATORIOS: "V", CONFIGURACOES: "-" },
  CAMPO: { PAINEL: "V", AGENDA: "A", COMERCIAL: "-", CLIENTES: "V", OBRAS: "A", FINANCEIRO: "-", ESTOQUE: "-", CADASTROS: "-", RELATORIOS: "-", CONFIGURACOES: "-" },
};
const TRANSVERSAIS: Record<Papel, { valores: boolean; custo: boolean }> = {
  ADMIN: { valores: true, custo: true },
  ESCRITORIO: { valores: true, custo: true },
  CAMPO: { valores: false, custo: false },
};

describe("perfis prontos: papel × módulo × nível", () => {
  for (const papel of Object.keys(ESPERADO) as Papel[]) {
    for (const modulo of MODULOS) {
      const e = ESPERADO[papel][modulo];
      it(`${papel} em ${modulo} = ${e}`, () => {
        const p = permissoesEfetivas(papel);
        expect(podeVerModulo(p, modulo)).toBe(e !== "-");
        expect(podeAlterarModulo(p, modulo)).toBe(e === "A" || e === "D");
        expect(podeDestruirNoModulo(p, modulo)).toBe(e === "D");
      });
    }
    it(`${papel}: acessos transversais`, () => {
      const p = permissoesEfetivas(papel);
      expect(p.verValores).toBe(TRANSVERSAIS[papel].valores);
      expect(p.verCustoMargem).toBe(TRANSVERSAIS[papel].custo);
      expect(p.ajustesInvalidos).toBe(false);
    });
  }

  it("só o Dono/Gestão é administrador (altera Configurações)", () => {
    expect(ehAdministrador(permissoesEfetivas("ADMIN"))).toBe(true);
    expect(ehAdministrador(permissoesEfetivas("ESCRITORIO"))).toBe(false);
    expect(ehAdministrador(permissoesEfetivas("CAMPO"))).toBe(false);
  });
});

describe("decidir: verbo × recurso × perfil", () => {
  const casos: [Papel, string, string, boolean][] = [
    ["ADMIN", "editar", "proposta", true],
    ["ESCRITORIO", "excluir", "proposta", true],
    ["ESCRITORIO", "desfazer", "aprovacao", true],
    ["ESCRITORIO", "estornar", "lancamento", true],
    ["ESCRITORIO", "excluir", "cliente", false],
    ["ESCRITORIO", "excluir", "fornecedor", false],
    ["ESCRITORIO", "editar", "fornecedor", true],
    ["ESCRITORIO", "editar", "usuario", false],
    ["ESCRITORIO", "ver", "custo", true],
    ["CAMPO", "editar", "obra", true],
    ["CAMPO", "excluir", "obra", false],
    ["CAMPO", "editar", "evento", true],
    ["CAMPO", "excluir", "evento", false],
    ["CAMPO", "ver", "cliente", true],
    ["CAMPO", "editar", "cliente", false],
    ["CAMPO", "criar", "cliente", false],
    ["CAMPO", "ver", "proposta", false],
    ["CAMPO", "ver", "lancamento", false],
    ["CAMPO", "ver", "custo", false],
    ["CAMPO", "ver", "valores", false],
    ["CAMPO", "ver", "produto", false],
    ["CAMPO", "criar", "anexo", true], // alguma área onde altera (foto de visita e de obra)
  ];
  for (const [papel, acao, recurso, esperado] of casos) {
    it(`${papel} ${acao} ${recurso} = ${esperado}`, () => {
      expect(decidir(permissoesEfetivas(papel), acao, recurso)).toBe(esperado);
    });
  }

  it("recurso com dois módulos exige os dois", () => {
    const ambos = permissoesEfetivas("ESCRITORIO");
    expect(decidir(ambos, "excluir", "tipologia-de-proposta")).toBe(false); // Escritório destrói em Comercial, mas em Cadastros só altera
    expect(decidir(ambos, "criar", "tipologia-de-proposta")).toBe(true);
    const semCadastros = permissoesEfetivas("ADMIN", { modulos: { CADASTROS: { nivel: "VER" } } });
    expect(decidir(semCadastros, "editar", "tipologia-de-proposta")).toBe(false);
  });

  it("'ou': a nota do diário da obra serve a Obras OU a Comercial (nota de campo)", () => {
    expect(decidir(permissoesEfetivas("CAMPO"), "criar", "interacao-projeto")).toBe(true); // Campo altera Obras
    expect(decidir(permissoesEfetivas("CAMPO"), "excluir", "interacao-projeto")).toBe(false); // e não apaga
    const soComercial = permissoesEfetivas("CAMPO", { modulos: { OBRAS: { nivel: "SEM_ACESSO" }, COMERCIAL: { nivel: "ALTERAR" } } });
    expect(decidir(soComercial, "criar", "interacao-projeto")).toBe(true);
    const nenhum = permissoesEfetivas("CAMPO", { modulos: { OBRAS: { nivel: "VER" } } });
    expect(decidir(nenhum, "criar", "interacao-projeto")).toBe(false);
    expect(decidir(permissoesEfetivas("ESCRITORIO"), "excluir", "interacao-projeto")).toBe(true);
  });

  it("recurso que exige custo some sem 'ver custo e margem' mesmo com o módulo", () => {
    const semCusto = permissoesEfetivas("ADMIN", { verCustoMargem: false });
    expect(decidir(semCusto, "editar", "precoKg")).toBe(false);
    expect(decidir(semCusto, "ver", "custo")).toBe(false);
    expect(decidir(semCusto, "editar", "produto")).toBe(true);
  });
});

describe("ajuste por módulo", () => {
  it("concede acima do perfil", () => {
    const p = permissoesEfetivas("CAMPO", { modulos: { FINANCEIRO: { nivel: "VER" }, ESTOQUE: { nivel: "ALTERAR", destrutivo: true } } });
    expect(podeVerModulo(p, "FINANCEIRO")).toBe(true);
    expect(podeAlterarModulo(p, "FINANCEIRO")).toBe(false);
    expect(podeDestruirNoModulo(p, "ESTOQUE")).toBe(true);
    expect(decidir(p, "ver", "lancamento")).toBe(true);
    expect(decidir(p, "ver", "valores")).toBe(false); // transversal continua separado
  });

  it("retira abaixo do perfil", () => {
    const p = permissoesEfetivas("ESCRITORIO", { modulos: { COMERCIAL: { nivel: "VER" }, OBRAS: { nivel: "SEM_ACESSO" } } });
    expect(decidir(p, "editar", "proposta")).toBe(false);
    expect(decidir(p, "ver", "proposta")).toBe(true);
    expect(decidir(p, "ver", "obra")).toBe(false);
  });

  it("a chave omitida de 'excluir e desfazer' vale não", () => {
    const p = permissoesEfetivas("ADMIN", { modulos: { COMERCIAL: { nivel: "ALTERAR" } } });
    expect(podeDestruirNoModulo(p, "COMERCIAL")).toBe(false);
    expect(decidir(p, "excluir", "proposta")).toBe(false);
  });

  it("'excluir e desfazer' sem 'alterar' é ignorado", () => {
    const p = permissoesEfetivas("ADMIN", { modulos: { COMERCIAL: { nivel: "VER", destrutivo: true } } });
    expect(podeDestruirNoModulo(p, "COMERCIAL")).toBe(false);
    expect(p.modulos.COMERCIAL.destrutivo).toBe(false);
  });

  it("custo e margem sem 'ver valores' é ignorado", () => {
    const p = permissoesEfetivas("ESCRITORIO", { verValores: false, verCustoMargem: true });
    expect(p.verValores).toBe(false);
    expect(p.verCustoMargem).toBe(false);
    const campo = permissoesEfetivas("CAMPO", { verCustoMargem: true });
    expect(campo.verCustoMargem).toBe(false);
  });

  it("Painel nunca passa de 'ver'", () => {
    const p = permissoesEfetivas("ADMIN", { modulos: { PAINEL: { nivel: "ALTERAR", destrutivo: true } } });
    expect(p.modulos.PAINEL).toEqual({ nivel: "VER", destrutivo: false });
  });

  it("transversais concedidos ao Campo", () => {
    const p = permissoesEfetivas("CAMPO", { verValores: true, verCustoMargem: true });
    expect(p.verValores).toBe(true);
    expect(p.verCustoMargem).toBe(true);
  });

  it("ajuste vazio ou nulo = perfil puro", () => {
    expect(permissoesEfetivas("ESCRITORIO", {})).toEqual(permissoesEfetivas("ESCRITORIO"));
    expect(permissoesEfetivas("ESCRITORIO", null)).toEqual(permissoesEfetivas("ESCRITORIO"));
  });
});

describe("falha fechada (decisão 178)", () => {
  const invalidos: [string, unknown][] = [
    ["módulo desconhecido", { modulos: { INEXISTENTE: { nivel: "VER" } } }],
    ["nível desconhecido", { modulos: { OBRAS: { nivel: "TUDO" } } }],
    ["chave a mais no módulo", { modulos: { OBRAS: { nivel: "VER", extra: true } } }],
    ["chave a mais na raiz", { verValores: true, outra: 1 }],
    ["tipo errado", { verValores: "sim" }],
    ["não é objeto", "ALTERAR"],
    ["lista", []],
    ["número", 1],
  ];
  for (const [nome, ajuste] of invalidos) {
    it(`ajuste inválido (${nome}): Escritório e Campo ficam sem acesso a nada`, () => {
      for (const papel of ["ESCRITORIO", "CAMPO"] as const) {
        const p = permissoesEfetivas(papel, ajuste);
        expect(p.ajustesInvalidos).toBe(true);
        for (const m of MODULOS) expect(podeVerModulo(p, m)).toBe(false);
        expect(p.verValores).toBe(false);
        expect(p.verCustoMargem).toBe(false);
        expect(decidir(p, "ver", "cliente")).toBe(false);
      }
    });
    it(`ajuste inválido (${nome}): ADMIN volta ao perfil puro e nunca é trancado`, () => {
      const p = permissoesEfetivas("ADMIN", ajuste);
      expect(p.ajustesInvalidos).toBe(true);
      expect({ ...p, ajustesInvalidos: false }).toEqual(permissoesEfetivas("ADMIN"));
      expect(ehAdministrador(p)).toBe(true);
    });
  }

  it("papel desconhecido não tem acesso a nada", () => {
    const p = permissoesEfetivas("VISITANTE");
    for (const m of MODULOS) expect(podeVerModulo(p, m)).toBe(false);
  });

  it("verbo ou recurso desconhecido é negado, até para ADMIN", () => {
    const admin = permissoesEfetivas("ADMIN");
    expect(decidir(admin, "apagarTudo", "cliente")).toBe(false);
    expect(decidir(admin, "editar", "coisaInexistente")).toBe(false);
    expect(decidir(admin, "editar", undefined)).toBe(false);
  });
});

describe("can(): ponto único", () => {
  it("calcula pelo papel quando a sessão não traz permissões", () => {
    expect(can({ id: "u", papel: "ADMIN" }, "excluir", "cliente")).toBe(true);
    expect(can({ id: "u", papel: "CAMPO" }, "excluir", "cliente")).toBe(false);
  });
  it("usa o ajuste guardado no usuário", () => {
    expect(can({ id: "u", papel: "CAMPO", ajustesPermissao: { modulos: { COMERCIAL: { nivel: "VER" } } } }, "ver", "proposta")).toBe(true);
  });
  it("usa permissões já calculadas (ator de API da Parte A)", () => {
    const permissoes = permissoesEfetivas("CAMPO", { modulos: { FINANCEIRO: { nivel: "ALTERAR" } } });
    expect(can({ id: "u", papel: "CAMPO", permissoes }, "receber", "contaReceber")).toBe(true);
  });
});

describe("mapeamento", () => {
  it("todo recurso aponta para módulo existente", () => {
    for (const [nome, r] of Object.entries(RECURSO)) {
      for (const mod of [r.modulo, ...(r.tambem ?? [])]) {
        if (mod === null || mod === "QUALQUER") continue;
        expect(MODULOS, `recurso ${nome}`).toContain(mod);
      }
    }
  });
  it("todo verbo tem nível", () => {
    for (const nivel of Object.values(NIVEL_DO_VERBO)) expect(["VER", "ALTERAR", "DESTRUTIVO"]).toContain(nivel);
  });
});
