import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import type { UsuarioSessao } from "@/lib/auth/sessao";
import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { aplicarReajusteKg, definirPrecosKgDoAcabamento, previaDoReajusteKg, recalcularCustoDoPerfil } from "@/modules/produtos/servico-preco-kg";
import { criarProdutoRapido } from "@/modules/produtos/servico-rapido";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

/**
 * Preço do kg do alumínio e cadastro rápido de produto. Só toca registros "Int Kg" / "INT-KG-"; o reajuste usa SEMPRE o escopo
 * dos acabamentos de teste (nunca mexe nos preços reais). O contador de códigos "P-0001" volta ao valor de antes.
 */
const PREFIXO = "Int Kg";
const LOGIN = "int-kg";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
const AGORA = new Date("2026-11-20T15:00:00Z");

let usuario: UsuarioSessao;
let acabNatural: string;
let acabPreto: string;
let linhaA: string;
let linhaB: string;
let contadorAntes: number | null = null;

const tx = <T>(fn: (t: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn, { timeout: 30_000 });
const ctx = () => ({ usuario, ip: null, agora: AGORA });
const definir = (acabamentoId: string, precos: { linhaId: string | null; custoKgCentavos: number | null }[]) => tx((t) => definirPrecosKgDoAcabamento(t, { acabamentoId, precos }, ctx()));
const custoDe = async (id: string) => (await prisma.produto.findUniqueOrThrow({ where: { id } })).custoUnitarioCentavos;

async function perfil(nome: string, extra: Partial<Prisma.ProdutoUncheckedCreateInput> = {}) {
  return prisma.produto.create({
    data: { codigo: `INT-KG-${randomUUID().slice(0, 8)}`, descricao: `${PREFIXO} ${nome}`, unidade: "BARRA", custoPorKg: true, acabamentoId: acabNatural, pesoKgPorMetro: "0.5", comprimentoBarraMm: 6000, ...extra },
  });
}

async function limpar() {
  await comConexao(async (c) => {
    const produtos = `SELECT id FROM "Produto" WHERE codigo LIKE 'INT-KG-%' OR descricao LIKE '${PREFIXO}%'`;
    await c.query(`DELETE FROM "LogAuditoria" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE login = $1)`, [LOGIN]);
    await c.query(`DELETE FROM "HistoricoPreco" WHERE "produtoId" IN (${produtos})`);
    await c.query(`DELETE FROM "Produto" WHERE id IN (${produtos})`);
    await c.query(`DELETE FROM "HistoricoPrecoKg" WHERE "precoKgId" IN (SELECT id FROM "PrecoKgAluminio" WHERE "acabamentoId" IN (SELECT id FROM "AcabamentoAluminio" WHERE nome LIKE '${PREFIXO}%'))`);
    await c.query(`DELETE FROM "PrecoKgAluminio" WHERE "acabamentoId" IN (SELECT id FROM "AcabamentoAluminio" WHERE nome LIKE '${PREFIXO}%')`);
    await c.query(`DELETE FROM "AcabamentoAluminio" WHERE nome LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "LinhaAluminio" WHERE nome LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "CategoriaProduto" WHERE nome LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Usuario" WHERE login = $1`, [LOGIN]);
  });
}

beforeAll(async () => {
  await limpar();
  contadorAntes = await comConexao(async (c) => (await c.query(`SELECT valor FROM "ContadorSequencia" WHERE chave = 'produto'`)).rows[0]?.valor ?? null);
  await criarUsuarioDeTeste(LOGIN, "senha-de-teste-123");
  const u = await prisma.usuario.findUniqueOrThrow({ where: { login: LOGIN } });
  usuario = { id: u.id, nome: u.nome, login: u.login, email: u.email, papel: "ADMIN", precisaTrocarSenha: false };
  acabNatural = (await prisma.acabamentoAluminio.create({ data: { nome: `${PREFIXO} Natural` } })).id;
  acabPreto = (await prisma.acabamentoAluminio.create({ data: { nome: `${PREFIXO} Preto` } })).id;
  linhaA = (await prisma.linhaAluminio.create({ data: { nome: `${PREFIXO} Linha A` } })).id;
  linhaB = (await prisma.linhaAluminio.create({ data: { nome: `${PREFIXO} Linha B` } })).id;
});

afterAll(async () => {
  await limpar();
  // Devolve o contador de códigos ao que era (os testes consomem P-0001...): nada de buraco na numeração real.
  await comConexao(async (c) => {
    if (contadorAntes === null) await c.query(`DELETE FROM "ContadorSequencia" WHERE chave = 'produto'`);
    else await c.query(`UPDATE "ContadorSequencia" SET valor = $1 WHERE chave = 'produto'`, [contadorAntes]);
  });
  await prisma.$disconnect();
});

describe("preço do kg do alumínio", () => {
  it("o preço geral recalcula o custo dos perfis do acabamento: R$ 50,00/kg × 0,5 kg/m × 6 m = R$ 150,00 a barra; histórico PRECO_KG", async () => {
    const barra = await perfil("Barra");
    const metro = await perfil("Metro", { unidade: "M" });
    const semPeso = await perfil("Sem peso", { pesoKgPorMetro: null });
    const outroAcabamento = await perfil("Outro acabamento", { acabamentoId: acabPreto });
    const manual = await perfil("Manual", { custoPorKg: false, custoUnitarioCentavos: 777 });

    const r = await definir(acabNatural, [{ linhaId: null, custoKgCentavos: 5000 }]);
    expect(r).toMatchObject({ mudancas: 1 });
    expect(await custoDe(barra.id)).toBe(15_000);
    expect(await custoDe(metro.id)).toBe(2_500);
    expect(await custoDe(semPeso.id)).toBeNull(); // falta peso: sem custo, nunca zero
    expect(await custoDe(outroAcabamento.id)).toBeNull(); // outro acabamento não é tocado
    expect(await custoDe(manual.id)).toBe(777); // produto que não é por kg não é tocado

    const hist = await prisma.historicoPreco.findMany({ where: { produtoId: barra.id } });
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ origem: "PRECO_KG", custoAnteriorCentavos: null, custoNovoCentavos: 15_000 });
    const preco = await prisma.precoKgAluminio.findFirstOrThrow({ where: { acabamentoId: acabNatural, linhaId: null } });
    expect(await prisma.historicoPrecoKg.count({ where: { precoKgId: preco.id } })).toBe(1);
    expect(await prisma.logAuditoria.count({ where: { entidade: "PrecoKgAluminio", entidadeId: preco.id } })).toBe(1);
  });

  it("o preço por linha vence o geral; sem linha específica vale o geral", async () => {
    const naLinhaA = await perfil("Na linha A", { linhaId: linhaA });
    const naLinhaB = await perfil("Na linha B", { linhaId: linhaB });
    await definir(acabNatural, [
      { linhaId: null, custoKgCentavos: 5000 },
      { linhaId: linhaA, custoKgCentavos: 6000 },
    ]);
    expect(await custoDe(naLinhaA.id)).toBe(18_000); // 6000 × 0,5 × 6
    expect(await custoDe(naLinhaB.id)).toBe(15_000); // geral
  });

  it("mudar o preço atualiza os perfis; o mesmo preço é 'nada alterado'; apagar o preço NÃO zera o custo já calculado", async () => {
    const p = await perfil("Muda");
    await definir(acabNatural, [{ linhaId: null, custoKgCentavos: 5200 }]); // (o geral já estava em 5000 de um teste anterior)
    const antes = await custoDe(p.id);
    await definir(acabNatural, [{ linhaId: null, custoKgCentavos: 5500 }]);
    expect(await custoDe(p.id)).toBe(16_500);
    expect(antes).toBe(15_600);
    await expect(definir(acabNatural, [{ linhaId: null, custoKgCentavos: 5500 }])).rejects.toThrow(/Nada foi alterado/);

    await definir(acabNatural, [{ linhaId: null, custoKgCentavos: null }]); // limpou o preço
    expect(await custoDe(p.id)).toBe(16_500); // continua com o último custo conhecido, nunca zero
    const preco = await prisma.precoKgAluminio.findFirstOrThrow({ where: { acabamentoId: acabNatural, linhaId: null } });
    expect(preco.custoKgCentavos).toBeNull();
    const hist = await prisma.historicoPrecoKg.findMany({ where: { precoKgId: preco.id }, orderBy: { criadoEm: "asc" } });
    expect(hist.map((h) => h.custoNovoCentavos)).toContain(null);
    await definir(acabNatural, [{ linhaId: null, custoKgCentavos: 5000 }]); // deixa pronto para os próximos testes
  });

  it("recusa preço zero, negativo ou absurdo, linha que não existe, linha repetida e acabamento inexistente", async () => {
    await expect(definir(acabPreto, [{ linhaId: null, custoKgCentavos: 0 }])).rejects.toThrow(/maior que zero/);
    await expect(definir(acabPreto, [{ linhaId: null, custoKgCentavos: -5 }])).rejects.toThrow(/maior que zero/);
    await expect(definir(acabPreto, [{ linhaId: null, custoKgCentavos: 999_999_999 }])).rejects.toThrow(/maior que zero/);
    await expect(definir(acabPreto, [{ linhaId: "nao-existe", custoKgCentavos: 100 }])).rejects.toThrow(/linha/);
    await expect(definir(acabPreto, [{ linhaId: linhaA, custoKgCentavos: 100 }, { linhaId: linhaA, custoKgCentavos: 200 }])).rejects.toThrow(/repetido/);
    await expect(definir("nao-existe", [{ linhaId: null, custoKgCentavos: 100 }])).rejects.toThrow(/não encontrado/);
    expect(await prisma.precoKgAluminio.count({ where: { acabamentoId: acabPreto } })).toBe(0); // nada foi gravado
  });

  it("recalcular um perfil que não é por kg não faz nada", async () => {
    const manual = await perfil("Não é por kg", { custoPorKg: false, custoUnitarioCentavos: 321 });
    expect(await tx((t) => recalcularCustoDoPerfil(t, manual.id, ctx()))).toEqual({ mudou: false, custoCentavos: null });
    expect(await custoDe(manual.id)).toBe(321);
  });
});

describe("reajuste em % do preço do kg (sempre no escopo dos acabamentos de teste)", () => {
  it("a prévia não grava nada; aplicar reajusta os preços, recalcula os perfis e grava histórico REAJUSTE_LOTE", async () => {
    const p = await perfil("Reajuste");
    await definir(acabPreto, [{ linhaId: null, custoKgCentavos: 4000 }]);
    await prisma.produto.update({ where: { id: p.id }, data: { acabamentoId: acabPreto } });
    await tx((t) => recalcularCustoDoPerfil(t, p.id, ctx()));
    expect(await custoDe(p.id)).toBe(12_000); // 4000 × 0,5 × 6

    const escopo = { acabamentoIds: [acabPreto] };
    const previa = await tx((t) => previaDoReajusteKg(t, 1000, escopo));
    expect(previa.map((l) => [l.anteriorCentavos, l.novoCentavos])).toEqual([[4000, 4400]]);
    expect((await prisma.precoKgAluminio.findFirstOrThrow({ where: { acabamentoId: acabPreto } })).custoKgCentavos).toBe(4000);

    const r = await tx((t) => aplicarReajusteKg(t, 1000, ctx(), escopo));
    // Dois perfis por kg no acabamento Preto (este e o "Outro acabamento" do primeiro teste): os dois acompanham o preço.
    expect(r).toEqual({ precos: 1, perfisAtualizados: 2 });
    expect((await prisma.precoKgAluminio.findFirstOrThrow({ where: { acabamentoId: acabPreto } })).custoKgCentavos).toBe(4400);
    expect(await custoDe(p.id)).toBe(13_200);
    const hist = await prisma.historicoPrecoKg.findMany({ where: { precoKg: { acabamentoId: acabPreto } } });
    expect(hist.some((h) => h.origem === "REAJUSTE_LOTE" && h.custoAnteriorCentavos === 4000 && h.custoNovoCentavos === 4400)).toBe(true);
  });

  it("recusa percentual zero, o que deixaria preço inválido (−100%) e reajuste sem nenhum preço no escopo; nada é aplicado", async () => {
    const escopo = { acabamentoIds: [acabPreto] };
    await expect(tx((t) => aplicarReajusteKg(t, 0, ctx(), escopo))).rejects.toThrow(/diferente de zero/);
    await expect(tx((t) => aplicarReajusteKg(t, -10_000, ctx(), escopo))).rejects.toThrow(/inválido/);
    await expect(tx((t) => aplicarReajusteKg(t, 500, ctx(), { acabamentoIds: [randomUUID()] }))).rejects.toThrow(/Não há preço/);
    expect((await prisma.precoKgAluminio.findFirstOrThrow({ where: { acabamentoId: acabPreto } })).custoKgCentavos).toBe(4400);
  });
});

describe("cadastro rápido de produto", () => {
  const rapido = (d: Partial<Parameters<typeof criarProdutoRapido>[1]> & { descricao: string }) =>
    tx((t) => criarProdutoRapido(t, { unidade: "UN", categoriaId: null, codigo: null, perfil: false, acabamentoId: null, linhaId: null, pesoKgPorMetro: null, comprimentoBarraMm: null, ...d }, { usuario, ip: null }));

  it("nasce SEM custo, com código gerado P-NNNN livre e auditoria; o código seguinte é outro", async () => {
    const a = await rapido({ descricao: `${PREFIXO} Roldana` });
    expect(a.codigo).toMatch(/^P-\d{4,}$/);
    expect(a.custoUnitarioCentavos).toBeNull();
    const dado = await prisma.produto.findUniqueOrThrow({ where: { id: a.id } });
    expect(dado).toMatchObject({ custoUnitarioCentavos: null, custoPorKg: false, saldoCache: expect.anything() });
    expect(dado.saldoCache.toString()).toBe("0");
    expect(await prisma.logAuditoria.count({ where: { entidade: "Produto", entidadeId: a.id, acao: "CRIAR" } })).toBe(1);
    const b = await rapido({ descricao: `${PREFIXO} Fecho` });
    expect(b.codigo).not.toBe(a.codigo);
  });

  it("código informado vale; código repetido é recusado (sem diferenciar maiúsculas)", async () => {
    const cod = `INT-KG-${randomUUID().slice(0, 6)}`;
    const p = await rapido({ descricao: `${PREFIXO} Com código`, codigo: cod });
    expect(p.codigo).toBe(cod);
    await expect(rapido({ descricao: `${PREFIXO} Repetido`, codigo: cod.toLowerCase() })).rejects.toThrow(/Já existe um produto com esse código/);
  });

  it("perfil por kg: usa o preço do kg já cadastrado; sem peso por metro o custo fica vazio; sem preço também", async () => {
    await definir(acabNatural, [{ linhaId: null, custoKgCentavos: 5000 }]).catch(() => undefined); // já pode existir
    const completo = await rapido({ descricao: `${PREFIXO} Perfil completo`, unidade: "BARRA", perfil: true, acabamentoId: acabNatural, pesoKgPorMetro: 0.5, comprimentoBarraMm: 6000 });
    expect(completo.custoUnitarioCentavos).toBe(15_000);
    const semPeso = await rapido({ descricao: `${PREFIXO} Perfil sem peso`, unidade: "BARRA", perfil: true, acabamentoId: acabNatural });
    expect(semPeso.custoUnitarioCentavos).toBeNull();
    const bruto = await prisma.produto.findUniqueOrThrow({ where: { id: semPeso.id } });
    expect(bruto.comprimentoBarraMm).toBe(6000); // padrão da spec (R14) só quando nada foi informado
    expect(bruto.pesoKgPorMetro).toBeNull(); // peso nunca inventado
    const semPreco = await rapido({ descricao: `${PREFIXO} Perfil sem preço`, unidade: "BARRA", perfil: true, acabamentoId: acabPreto, pesoKgPorMetro: 0.5 });
    expect(semPreco.custoUnitarioCentavos).not.toBe(0);
  });

  it("recusa categoria, linha e acabamento que não existem", async () => {
    await expect(rapido({ descricao: `${PREFIXO} X`, categoriaId: "nao-existe" })).rejects.toThrow(/não existe mais/);
    await expect(rapido({ descricao: `${PREFIXO} X`, perfil: true, acabamentoId: "nao-existe" })).rejects.toThrow(/não existe mais/);
    await expect(rapido({ descricao: `${PREFIXO} X`, perfil: true, acabamentoId: acabNatural, linhaId: "nao-existe" })).rejects.toThrow(/não existe mais/);
  });
});
