import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Permissão de ver custo e margem (Fase 7, Bloco 2). Hoje `can()` responde sempre "sim" (só existe o perfil ADMIN); este
 * teste TROCA o retorno para "não" e confere que custo e margem somem: a exportação responde 403, a página mostra o aviso
 * e, nos dois casos, o carregador (que consulta o banco) nem é chamado.
 */

// Importar a rota e a página inteiras (next/server, componentes) leva alguns segundos com a suíte toda rodando em paralelo.
vi.setConfig({ testTimeout: 60_000 });

const { sessaoParaApi, exigirSessao, can, carregarMargemDasObras } = vi.hoisted(() => ({
  sessaoParaApi: vi.fn(),
  exigirSessao: vi.fn(),
  can: vi.fn(),
  carregarMargemDasObras: vi.fn(),
}));

vi.mock("@/lib/auth/sessao", () => ({ sessaoParaApi, exigirSessao }));
vi.mock("@/lib/permissoes", () => ({ can }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: vi.fn() }));
vi.mock("@/modules/relatorios/margem-obras", () => ({
  lerFiltroDeMargem: () => ({ situacao: "andamento", busca: undefined, periodo: undefined }),
  carregarMargemDasObras,
}));

const USUARIO = { id: "u1", papel: "ADMIN" as const, nome: "Teste", login: "teste" };

const RELATORIO = {
  linhas: [
    { id: "p1", codigo: "P-0001", titulo: "Casa", cliente: "Ana", status: "EM_EXECUCAO", receitaDaMargemCentavos: 1_000_000, repasseDeImpostoCentavos: 0, custoConhecidoCentavos: 600_000, margemCentavos: 400_000, margemPb: 4000, incompleto: false, faltando: [] },
    { id: "p2", codigo: "P-0002", titulo: "Sacada", cliente: "Bia", status: "APROVADO", receitaDaMargemCentavos: 500_000, repasseDeImpostoCentavos: 0, custoConhecidoCentavos: 100_000, margemCentavos: null, margemPb: null, incompleto: true, faltando: ["mão de obra por m²"] },
  ],
  totalCompletoCentavos: 400_000,
  receitaCompletaCentavos: 1_000_000,
  completas: 1,
  incompletas: 1,
  truncado: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  sessaoParaApi.mockResolvedValue(USUARIO);
  exigirSessao.mockResolvedValue(USUARIO);
  carregarMargemDasObras.mockResolvedValue(RELATORIO);
});

describe("exportação da margem por obra", () => {
  async function chamar() {
    const { GET } = await import("@/app/api/exportar/relatorios/margem-obras/route");
    const { NextRequest } = await import("next/server");
    return GET(new NextRequest("http://localhost/api/exportar/relatorios/margem-obras?situacao=todas"));
  }

  it("com permissão: CSV com custo e margem, margem incompleta como texto (nunca zero)", async () => {
    can.mockReturnValue(true);
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/csv");
    const texto = await r.text();
    expect(texto).toContain("Custo conhecido (R$)");
    expect(texto).toContain("Margem (R$)");
    expect(texto).toContain("4000,00");
    expect(texto).toContain("Incompleta");
    expect(can).toHaveBeenCalledWith(USUARIO, "ver", "custo");
  });

  it("SEM permissão de ver custo: 403, sem nenhum dado e sem consultar o banco", async () => {
    can.mockReturnValue(false);
    const r = await chamar();
    expect(r.status).toBe(403);
    const texto = await r.text();
    expect(texto).not.toContain("Custo");
    expect(texto).not.toContain("4000,00");
    expect(carregarMargemDasObras).not.toHaveBeenCalled();
  });

  it("sem sessão: 401", async () => {
    sessaoParaApi.mockResolvedValue(null);
    can.mockReturnValue(true);
    const r = await chamar();
    expect(r.status).toBe(401);
    expect(carregarMargemDasObras).not.toHaveBeenCalled();
  });
});

describe("página da margem por obra", () => {
  it("sem permissão de ver custo, mostra o aviso e não consulta o banco", async () => {
    can.mockReturnValue(false);
    const { default: Pagina } = await import("@/app/(app)/relatorios/margem-obras/page");
    const elemento = await Pagina({ searchParams: Promise.resolve({}) });
    const texto = JSON.stringify(elemento);
    expect(texto).toContain("Sem permissão para ver custo e margem");
    expect(texto).not.toContain("P-0001");
    expect(carregarMargemDasObras).not.toHaveBeenCalled();
  });
});
