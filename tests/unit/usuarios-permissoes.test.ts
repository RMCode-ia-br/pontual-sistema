import { beforeEach, describe, expect, it, vi } from "vitest";

import { PAPEIS, MODULOS, ajustesDeDiferenca, contarAdministradoresAtivos, permissoesEfetivas, type Modulo, type PermissaoDoModulo } from "@/lib/dominio/permissoes";
import { alterarPermissoesSchema, criarUsuarioSchema } from "@/modules/usuarios/schemas";

/**
 * Tela de usuários (Fase 7C, Bloco 7): regra do último administrador, ida e volta dos ajustes, schemas estritos e as ações
 * de usuário contra um banco EM MEMÓRIA (o banco compartilhado tem usuários reais, então a regra "último administrador"
 * não pode ser provada nele sem mexer em gente de verdade).
 */

type U = { id: string; nome: string; login: string; email: null; ativo: boolean; precisaTrocarSenha: boolean; papel: string; ajustesPermissao: unknown; versaoSessao: number; deletadoEm: null };

const estado = vi.hoisted(() => ({
  sessao: null as unknown,
  usuarios: [] as unknown[],
  auditoria: [] as unknown[],
  tocouOBanco: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, updateTag: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth/sessao", () => ({ exigirSessao: async () => estado.sessao }));
vi.mock("@/lib/auditoria", () => ({
  registrarAuditoria: async (_tx: unknown, e: unknown) => {
    estado.auditoria.push(e);
  },
}));
vi.mock("@/lib/db", () => {
  const lista = () => estado.usuarios as U[];
  const tx = {
    $queryRaw: async () => [],
    usuario: {
      findFirst: async ({ where }: { where: { id: string } }) => (() => { const u = lista().find((x) => x.id === where.id && !x.deletadoEm); return u ? { ...u } : null; })(),
      findMany: async () => lista().filter((u) => u.ativo && !u.deletadoEm),
      count: async ({ where }: { where: { id?: { not: string } } }) => lista().filter((u) => u.ativo && !u.deletadoEm && (!where.id || u.id !== where.id.not)).length,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const u = lista().find((x) => x.id === where.id)!;
        for (const [k, v] of Object.entries(data)) {
          if (k === "versaoSessao") u.versaoSessao += (v as { increment: number }).increment;
          else if (k === "ajustesPermissao") u.ajustesPermissao = typeof v === "object" && v !== null && "toString" in v && String(v) === "DbNull" ? null : v;
          else (u as Record<string, unknown>)[k] = v;
        }
        estado.tocouOBanco = true;
        return u;
      },
    },
  };
  return { prisma: { $transaction: async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx) } };
});

const usuario = (id: string, papel: string, extra: Partial<U> = {}): U => ({ id, nome: id, login: id, email: null, ativo: true, precisaTrocarSenha: false, papel, ajustesPermissao: null, versaoSessao: 1, deletadoEm: null, ...extra });
const sessaoDe = (u: U) => ({ id: u.id, nome: u.nome, login: u.login, email: null, papel: u.papel, precisaTrocarSenha: false });

describe("contarAdministradoresAtivos", () => {
  const base = [{ id: "a", ativo: true, papel: "ADMIN", ajustesPermissao: null }, { id: "e", ativo: true, papel: "ESCRITORIO", ajustesPermissao: null }, { id: "i", ativo: false, papel: "ADMIN", ajustesPermissao: null }];

  it("conta só ativo com Configurações em 'Pode alterar'", () => {
    expect(contarAdministradoresAtivos(base)).toBe(1);
  });
  it("ajuste que concede Configurações cria administrador; ajuste que tira, remove", () => {
    expect(contarAdministradoresAtivos(base, { id: "e", ajustesPermissao: { modulos: { CONFIGURACOES: { nivel: "ALTERAR" } } } })).toBe(2);
    expect(contarAdministradoresAtivos(base, { id: "a", ajustesPermissao: { modulos: { CONFIGURACOES: { nivel: "VER" } } } })).toBe(0);
  });
  it("desativar ou rebaixar muda a conta; ajuste inválido de ADMIN não o tranca, de outro perfil fecha", () => {
    expect(contarAdministradoresAtivos(base, { id: "a", ativo: false })).toBe(0);
    expect(contarAdministradoresAtivos(base, { id: "a", papel: "CAMPO" })).toBe(0);
    expect(contarAdministradoresAtivos(base, { id: "a", ajustesPermissao: { lixo: true } })).toBe(1);
    expect(contarAdministradoresAtivos(base, { id: "e", ajustesPermissao: { lixo: true } })).toBe(1);
  });
});

describe("ajustesDeDiferenca: volta de permissoesEfetivas", () => {
  it("sem diferença não há ajuste (perfil puro)", () => {
    for (const papel of PAPEIS) {
      const b = permissoesEfetivas(papel);
      expect(ajustesDeDiferenca(papel, b.modulos, b.verValores, b.verCustoMargem)).toBeNull();
    }
  });

  it("o que a pessoa marcou volta igual depois de guardar e ler", () => {
    for (const papel of PAPEIS) {
      const b = permissoesEfetivas(papel);
      const marcado: Record<Modulo, PermissaoDoModulo> = { ...b.modulos, FINANCEIRO: { nivel: "VER", destrutivo: false }, ESTOQUE: { nivel: "ALTERAR", destrutivo: true }, CONFIGURACOES: { nivel: "SEM_ACESSO", destrutivo: false } };
      const ajustes = ajustesDeDiferenca(papel, marcado, !b.verValores, false);
      const lido = permissoesEfetivas(papel, ajustes);
      for (const m of MODULOS) expect(lido.modulos[m], `${papel} ${m}`).toEqual(marcado[m]);
      expect(lido.verValores).toBe(!b.verValores);
      expect(lido.verCustoMargem).toBe(false);
      expect(lido.ajustesInvalidos).toBe(false);
    }
  });
});

describe("schemas estritos", () => {
  it("criar usuário exige perfil e não tem padrão", () => {
    expect(criarUsuarioSchema.safeParse({ nome: "Ana", login: "ana", email: "" }).success).toBe(false);
    expect(criarUsuarioSchema.safeParse({ nome: "Ana", login: "ana", email: "", papel: "" }).success).toBe(false);
    expect(criarUsuarioSchema.safeParse({ nome: "Ana", login: "ana", email: "", papel: "SUPERUSUARIO" }).success).toBe(false);
    for (const papel of PAPEIS) expect(criarUsuarioSchema.safeParse({ nome: "Ana", login: "ana", email: "", papel }).success).toBe(true);
  });

  it("alterar permissões recusa chave desconhecida, módulo inexistente e nível inventado", () => {
    const ok = { id: "u", papel: "CAMPO", ajustes: { modulos: { FINANCEIRO: { nivel: "VER" } }, verValores: true } };
    expect(alterarPermissoesSchema.safeParse(ok).success).toBe(true);
    expect(alterarPermissoesSchema.safeParse({ ...ok, ajustes: null }).success).toBe(true);
    expect(alterarPermissoesSchema.safeParse({ ...ok, ajustes: { extra: 1 } }).success).toBe(false);
    expect(alterarPermissoesSchema.safeParse({ ...ok, ajustes: { modulos: { XYZ: { nivel: "VER" } } } }).success).toBe(false);
    expect(alterarPermissoesSchema.safeParse({ ...ok, ajustes: { modulos: { OBRAS: { nivel: "TUDO" } } } }).success).toBe(false);
    expect(alterarPermissoesSchema.safeParse({ ...ok, papel: "X" }).success).toBe(false);
  });
});

describe("ações de usuário (banco em memória)", () => {
  beforeEach(() => {
    estado.auditoria = [];
    estado.tocouOBanco = false;
  });

  async function acoes() {
    return import("@/modules/usuarios/actions/usuarios");
  }

  it("rebaixar a si mesmo sendo o ÚLTIMO administrador é recusado, e nada muda", async () => {
    const a = usuario("a", "ADMIN");
    estado.usuarios = [a, usuario("c", "CAMPO")];
    estado.sessao = sessaoDe(a);
    const { alterarPermissoesUsuario } = await acoes();
    const r = await alterarPermissoesUsuario({ id: "a", papel: "ESCRITORIO", ajustes: null });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toMatch(/último administrador/);
    expect(a.papel).toBe("ADMIN");
    expect(a.versaoSessao).toBe(1);
    expect(estado.auditoria).toHaveLength(0);
  });

  it("tirar Configurações por AJUSTE também conta como rebaixar", async () => {
    const a = usuario("a", "ADMIN");
    estado.usuarios = [a];
    estado.sessao = sessaoDe(a);
    const { alterarPermissoesUsuario } = await acoes();
    const r = await alterarPermissoesUsuario({ id: "a", papel: "ADMIN", ajustes: { modulos: { CONFIGURACOES: { nivel: "VER" } } } });
    expect(r.ok).toBe(false);
    expect(a.ajustesPermissao).toBeNull();
  });

  it("com outro administrador ativo, rebaixar é permitido: sessão cai, perfil muda e a auditoria guarda antes e depois", async () => {
    const a = usuario("a", "ADMIN");
    const b = usuario("b", "ADMIN");
    estado.usuarios = [a, b];
    estado.sessao = sessaoDe(a);
    const { alterarPermissoesUsuario } = await acoes();
    const r = await alterarPermissoesUsuario({ id: "b", papel: "CAMPO", ajustes: { verValores: true } });
    expect(r.ok).toBe(true);
    expect(b.papel).toBe("CAMPO");
    expect(b.ajustesPermissao).toEqual({ verValores: true });
    expect(b.versaoSessao).toBe(2);
    expect(estado.auditoria).toHaveLength(1);
    const log = estado.auditoria[0] as { acao: string; antes: { papel: string }; depois: { papel: string; ajustesPermissao: unknown } };
    expect(log.acao).toBe("ALTERAR_PERMISSOES");
    expect(log.antes.papel).toBe("ADMIN");
    expect(log.depois.papel).toBe("CAMPO");
    expect(log.depois.ajustesPermissao).toEqual({ verValores: true });
  });

  it("promover alguém a administrador por ajuste libera o rebaixamento do primeiro", async () => {
    const a = usuario("a", "ADMIN");
    const e = usuario("e", "ESCRITORIO");
    estado.usuarios = [a, e];
    estado.sessao = sessaoDe(a);
    const { alterarPermissoesUsuario } = await acoes();
    expect((await alterarPermissoesUsuario({ id: "e", papel: "ESCRITORIO", ajustes: { modulos: { CONFIGURACOES: { nivel: "ALTERAR" } } } })).ok).toBe(true);
    expect((await alterarPermissoesUsuario({ id: "a", papel: "ESCRITORIO", ajustes: null })).ok).toBe(true);
  });

  it("ajuste fora do formato é recusado antes de tocar o banco", async () => {
    const a = usuario("a", "ADMIN");
    const b = usuario("b", "CAMPO");
    estado.usuarios = [a, b];
    estado.sessao = sessaoDe(a);
    const { alterarPermissoesUsuario } = await acoes();
    const r = await alterarPermissoesUsuario({ id: "b", papel: "CAMPO", ajustes: { qualquer: "coisa" } });
    expect(r.ok).toBe(false);
    expect(estado.tocouOBanco).toBe(false);
    expect(b.versaoSessao).toBe(1);
  });

  it("quem não altera Configurações não mexe em permissões (nem a sua)", async () => {
    const e = usuario("e", "ESCRITORIO");
    estado.usuarios = [usuario("a", "ADMIN"), e];
    estado.sessao = sessaoDe(e);
    const { alterarPermissoesUsuario } = await acoes();
    const r = await alterarPermissoesUsuario({ id: "e", papel: "ADMIN", ajustes: null });
    expect(!r.ok && r.erro).toMatch(/permiss/i);
    expect(e.papel).toBe("ESCRITORIO");
  });

  it("desativar o outro administrador é permitido; a desativação derruba a sessão", async () => {
    const a = usuario("a", "ADMIN");
    const b = usuario("b", "ADMIN");
    estado.usuarios = [a, b];
    estado.sessao = sessaoDe(a);
    const { alternarAtivoUsuario } = await acoes();
    expect((await alternarAtivoUsuario("b", false)).ok).toBe(true);
    expect(b.ativo).toBe(false);
    expect(b.versaoSessao).toBe(2);
  });
});
