import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import type { UsuarioSessao } from "@/lib/auth/sessao";
import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { listarContasFinanceiras } from "@/modules/financeiro/queries";
import { lerListaAPagar, listarContasAPagar, listarRecorrencias, obterContaAPagar } from "@/modules/financeiro/queries-pagar";
import { contaAPagarSchema, pagamentoSchema, recorrenciaSchema } from "@/modules/financeiro/schemas";
import { estornarLancamento } from "@/modules/financeiro/servico-lancamentos";
import {
  ajustarContaAPagar,
  cancelarContaAPagar,
  criarContasAPagar,
  editarRecorrencia,
  encerrarRecorrencia,
  estenderRecorrencias,
  gerarOcorrenciasDaRecorrencia,
  reabrirContaAPagar,
  registrarPagamento,
} from "@/modules/financeiro/servico-pagar";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

const PREFIXO = "Int FinP";
const LOGIN = "int-fin-pagar";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

const AGORA = new Date("2026-11-20T15:00:00Z");
const HOJE = "2026-11-20";

let usuario: UsuarioSessao;
let contaBancoId: string;
let categoriaDespesa: string;
let categoriaReceita: string;

const tx = <T>(fn: (t: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn, { timeout: 30_000 });
const ctx = () => ({ usuario, ip: null, agora: AGORA });
const dia = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

async function limpar() {
  await comConexao(async (c) => {
    await c.query(`DELETE FROM "LogAuditoria" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE login = $1)`, [LOGIN]);
    await c.query(`DELETE FROM "LogAuditoria" WHERE entidade = 'RecorrenciaPagar' AND "usuarioId" IS NULL AND "entidadeId" IN (SELECT id FROM "RecorrenciaPagar" WHERE descricao LIKE $1)`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Lancamento" WHERE "contaPagarId" IN (SELECT id FROM "ContaPagar" WHERE descricao LIKE $1) OR "contaFinanceiraId" IN (SELECT id FROM "ContaFinanceira" WHERE nome LIKE $1)`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ContaPagar" WHERE descricao LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "RecorrenciaPagar" WHERE descricao LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ContaFinanceira" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "CategoriaFinanceira" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Usuario" WHERE login = $1`, [LOGIN]);
  });
}

beforeAll(async () => {
  await limpar();
  await criarUsuarioDeTeste(LOGIN, "senha-de-teste-123");
  const u = await prisma.usuario.findUniqueOrThrow({ where: { login: LOGIN } });
  usuario = { id: u.id, nome: u.nome, login: u.login, email: u.email, papel: "ADMIN", precisaTrocarSenha: false };
  contaBancoId = (await prisma.contaFinanceira.create({ data: { nome: `${PREFIXO} Banco`, saldoInicialInformado: true, saldoInicialCentavos: 1000000, dataSaldoInicial: new Date("2026-11-01T00:00:00Z") } })).id;
  categoriaDespesa = (await prisma.categoriaFinanceira.create({ data: { nome: `${PREFIXO} Despesa`, tipo: "DESPESA", grupo: "DESPESAS_FIXAS", grupoDre: "Despesas fixas" } })).id;
  categoriaReceita = (await prisma.categoriaFinanceira.create({ data: { nome: `${PREFIXO} Receita`, tipo: "RECEITA", grupo: "RECEITAS_OPERACIONAIS", grupoDre: "Receitas operacionais" } })).id;
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

const nova = (extra: Record<string, string>) =>
  tx((t) => criarContasAPagar(t, contaAPagarSchema.parse({ descricao: `${PREFIXO} Conta`, modo: "UNICA", valor: "100,00", vencimento: "2026-11-25", categoriaId: categoriaDespesa, ...extra }), ctx()));
const pagar = (id: string, valor: string, extra: Record<string, string> = {}) =>
  tx((t) => registrarPagamento(t, pagamentoSchema.parse({ contaPagarId: id, data: "2026-11-19", valor, contaFinanceiraId: contaBancoId, forma: "PIX", ...extra }), ctx()));
const de = (id: string) => prisma.contaPagar.findUniqueOrThrow({ where: { id } });
const saldoDoBanco = async () => (await listarContasFinanceiras(HOJE)).find((c) => c.id === contaBancoId)!.saldoAtualCentavos;

describe("conta a pagar única", () => {
  it("nasce em aberto, com competência no dia 1 do mês do vencimento, e fica auditada", async () => {
    const r = await nova({ descricao: `${PREFIXO} Única`, vencimento: "2026-12-15" });
    const c = await de(r.primeiraId);
    expect(c).toMatchObject({ status: "ABERTA", valorCentavos: 10000, valorPagoCentavos: 0, categoriaId: categoriaDespesa, recorrenciaId: null, parcelamentoId: null });
    expect(dia(c.vencimento)).toBe("2026-12-15");
    expect(dia(c.competencia)).toBe("2026-12-01");
    expect(await prisma.logAuditoria.count({ where: { entidade: "ContaPagar", entidadeId: c.id, acao: "CRIAR" } })).toBe(1);
  });

  it("recusa categoria de receita, fornecedor e obra que não existem", async () => {
    await expect(nova({ categoriaId: categoriaReceita })).rejects.toThrow(/categoria de despesa/);
    await expect(nova({ fornecedorId: "nao-existe" })).rejects.toThrow(/Fornecedor/);
    await expect(nova({ projetoId: "nao-existe" })).rejects.toThrow(/Obra/);
  });
});

describe("conta parcelada", () => {
  it("R$ 100,00 em 3x: a soma é o total, a última absorve a diferença e o vencimento acompanha o mês", async () => {
    const r = await nova({ descricao: `${PREFIXO} Parcelada`, modo: "PARCELADA", valor: "100,00", parcelas: "3", vencimento: "2027-01-31" });
    expect(r.criadas).toBe(3);
    const lista = await prisma.contaPagar.findMany({ where: { descricao: { startsWith: `${PREFIXO} Parcelada` } }, orderBy: { parcelaNumero: "asc" } });
    expect(lista.map((c) => c.valorCentavos)).toEqual([3333, 3333, 3334]);
    expect(lista.map((c) => dia(c.vencimento))).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
    expect(lista.map((c) => dia(c.competencia))).toEqual(["2027-01-01", "2027-02-01", "2027-03-01"]);
    expect(lista.map((c) => `${c.parcelaNumero}/${c.parcelaTotal}`)).toEqual(["1/3", "2/3", "3/3"]);
    expect(new Set(lista.map((c) => c.parcelamentoId)).size).toBe(1);
    expect(lista[0].descricao).toBe(`${PREFIXO} Parcelada (1/3)`);
  });
});

describe("recorrência (aluguel, energia, DAS, salários)", () => {
  it("cria o modelo e gera as ocorrências até o horizonte (3 meses à frente), com vencimento no dia pedido", async () => {
    const r = await nova({ descricao: `${PREFIXO} Aluguel`, modo: "RECORRENTE", valor: "2.500,00", vencimento: "2026-12-10" });
    expect(r.recorrenciaId).not.toBeNull();
    const ocorrencias = await prisma.contaPagar.findMany({ where: { recorrenciaId: r.recorrenciaId! }, orderBy: { vencimento: "asc" } });
    // Horizonte: fim de fevereiro de 2027 (nov + 3 meses).
    expect(ocorrencias.map((o) => dia(o.vencimento))).toEqual(["2026-12-10", "2027-01-10", "2027-02-10"]);
    expect(ocorrencias.every((o) => o.valorCentavos === 250000 && o.status === "ABERTA")).toBe(true);
    expect(dia((await prisma.recorrenciaPagar.findUniqueOrThrow({ where: { id: r.recorrenciaId! } })).geradaAte)).toBe("2027-02-10");
  });

  it("gerar de novo (cron atrasado, duas vezes, retry) NÃO duplica nada; o horizonte maior só acrescenta o que falta", async () => {
    const rec = await prisma.recorrenciaPagar.findFirstOrThrow({ where: { descricao: `${PREFIXO} Aluguel` } });
    const total = () => prisma.contaPagar.count({ where: { recorrenciaId: rec.id } });
    expect(await total()).toBe(3);
    expect(await tx((t) => gerarOcorrenciasDaRecorrencia(t, rec, "2027-02-28", null))).toBe(0);
    expect(await total()).toBe(3);

    // A rotina diária, rodando em janeiro com o horizonte seguinte (até 30/04/2027): acrescenta março e abril, e só uma vez.
    const primeira = await tx((t) => estenderRecorrencias(t, "2027-01-05", { apenas: [rec.id] }));
    expect(primeira).toEqual({ recorrencias: 1, ocorrenciasCriadas: 2 });
    const segunda = await tx((t) => estenderRecorrencias(t, "2027-01-05", { apenas: [rec.id] }));
    expect(segunda.ocorrenciasCriadas).toBe(0);
    expect(await total()).toBe(5);
    // Cada competência aparece uma vez só (a chave única do banco garante).
    const competencias = (await prisma.contaPagar.findMany({ where: { recorrenciaId: rec.id }, select: { competencia: true } })).map((c) => dia(c.competencia));
    expect(new Set(competencias).size).toBe(5);
  });

  it("ocorrência cancelada não é recriada pela rotina", async () => {
    const rec = await prisma.recorrenciaPagar.findFirstOrThrow({ where: { descricao: `${PREFIXO} Aluguel` } });
    const marco = await prisma.contaPagar.findFirstOrThrow({ where: { recorrenciaId: rec.id, vencimento: new Date("2027-03-10T00:00:00Z") } });
    await tx((t) => cancelarContaAPagar(t, marco.id, "Mudou de endereço", ctx()));
    expect(await tx((t) => estenderRecorrencias(t, "2027-01-05", { apenas: [rec.id] }))).toMatchObject({ ocorrenciasCriadas: 0 });
    expect((await de(marco.id)).status).toBe("CANCELADA");
  });

  it("dia 31 usa o último dia dos meses curtos; trimestral anda de 3 em 3", async () => {
    const r = await nova({ descricao: `${PREFIXO} Dia 31`, modo: "RECORRENTE", valor: "10,00", vencimento: "2026-12-31" });
    const lista = await prisma.contaPagar.findMany({ where: { recorrenciaId: r.recorrenciaId! }, orderBy: { vencimento: "asc" } });
    expect(lista.map((o) => dia(o.vencimento))).toEqual(["2026-12-31", "2027-01-31", "2027-02-28"]);
    const t = await nova({ descricao: `${PREFIXO} Trimestral`, modo: "RECORRENTE", periodicidade: "TRIMESTRAL", valor: "10,00", vencimento: "2026-12-05" });
    expect((await prisma.contaPagar.findMany({ where: { recorrenciaId: t.recorrenciaId! } })).map((o) => dia(o.vencimento))).toEqual(["2026-12-05"]);
  });

  it("editar a recorrência propaga só para as futuras em aberto: a paga e a vencida ficam como estavam", async () => {
    const r = await nova({ descricao: `${PREFIXO} Energia`, modo: "RECORRENTE", valor: "300,00", vencimento: "2026-11-05" });
    const ocorrencias = await prisma.contaPagar.findMany({ where: { recorrenciaId: r.recorrenciaId! }, orderBy: { vencimento: "asc" } });
    expect(ocorrencias.map((o) => dia(o.vencimento))).toEqual(["2026-11-05", "2026-12-05", "2027-01-05", "2027-02-05"]);
    await pagar(ocorrencias[2].id, "300,00"); // janeiro já paga

    const edicao = recorrenciaSchema.parse({ recorrenciaId: r.recorrenciaId!, descricao: `${PREFIXO} Energia (nova)`, categoriaId: categoriaDespesa, valor: "350,00", diaVencimento: "12" });
    const resultado = await tx((t) => editarRecorrencia(t, edicao, ctx()));
    expect(resultado.atualizadas).toBe(2); // dezembro e fevereiro

    const depois = await prisma.contaPagar.findMany({ where: { recorrenciaId: r.recorrenciaId! }, orderBy: { vencimento: "asc" } });
    expect(depois.map((o) => [dia(o.vencimento), o.valorCentavos, o.descricao.endsWith("(nova)")])).toEqual([
      ["2026-11-05", 30000, false], // já venceu: intacta
      ["2026-12-12", 35000, true],
      ["2027-01-05", 30000, false], // paga: intacta
      ["2027-02-12", 35000, true],
    ]);
    // Uma ocorrência nova (gerada depois) já vem com os valores novos.
    const rec = await prisma.recorrenciaPagar.findUniqueOrThrow({ where: { id: r.recorrenciaId! } });
    await tx((t) => gerarOcorrenciasDaRecorrencia(t, rec, "2027-03-31", usuario));
    const marco = await prisma.contaPagar.findFirstOrThrow({ where: { recorrenciaId: rec.id, vencimento: new Date("2027-03-12T00:00:00Z") } });
    expect(marco.valorCentavos).toBe(35000);
  });

  it("encerrar cancela as futuras em aberto e sem pagamento e para de gerar; a lista mostra a recorrência encerrada", async () => {
    const r = await nova({ descricao: `${PREFIXO} DAS`, modo: "RECORRENTE", valor: "400,00", vencimento: "2026-12-20" });
    const [primeira] = await prisma.contaPagar.findMany({ where: { recorrenciaId: r.recorrenciaId! }, orderBy: { vencimento: "asc" } });
    await pagar(primeira.id, "400,00"); // dezembro paga: não será cancelada
    const res = await tx((t) => encerrarRecorrencia(t, r.recorrenciaId!, ctx()));
    expect(res.canceladas).toBe(2); // janeiro e fevereiro
    const status = (await prisma.contaPagar.findMany({ where: { recorrenciaId: r.recorrenciaId! }, orderBy: { vencimento: "asc" } })).map((c) => c.status);
    expect(status).toEqual(["PAGA", "CANCELADA", "CANCELADA"]);
    await expect(tx((t) => encerrarRecorrencia(t, r.recorrenciaId!, ctx()))).rejects.toThrow(/já está encerrada/);
    const rec = await prisma.recorrenciaPagar.findUniqueOrThrow({ where: { id: r.recorrenciaId! } });
    expect(await tx((t) => gerarOcorrenciasDaRecorrencia(t, rec, "2027-12-31", null))).toBe(0);
    expect((await listarRecorrencias(HOJE)).find((x) => x.id === r.recorrenciaId)).toMatchObject({ ativo: false, emAberto: 0 });
  });
});

describe("pagamento (baixa)", () => {
  it("parcial e depois quitação: o saldo bancário diminui, o status acompanha e tudo é auditado", async () => {
    const r = await nova({ descricao: `${PREFIXO} Fornecedor`, valor: "1.000,00" });
    const antes = await saldoDoBanco();

    expect(await pagar(r.primeiraId, "400,00")).toMatchObject({ status: "PARCIAL" });
    expect(await de(r.primeiraId)).toMatchObject({ status: "PARCIAL", valorPagoCentavos: 40000 });
    expect(await saldoDoBanco()).toBe(antes - 40000);
    const lanc = await prisma.lancamento.findMany({ where: { contaPagarId: r.primeiraId } });
    expect(lanc[0]).toMatchObject({ tipo: "SAIDA", valorCentavos: 40000, categoriaId: categoriaDespesa, contaFinanceiraId: contaBancoId, estornadoEm: null });

    expect(await pagar(r.primeiraId, "600,00")).toMatchObject({ status: "PAGA" });
    expect(await de(r.primeiraId)).toMatchObject({ status: "PAGA", valorPagoCentavos: 100000 });
    expect(await saldoDoBanco()).toBe(antes - 100000);
    expect(await prisma.logAuditoria.count({ where: { entidade: "ContaPagar", entidadeId: r.primeiraId, acao: "PAGAR" } })).toBe(2);
  });

  it("recusa o que passa do saldo, conta cancelada e conta já paga; nada é gravado", async () => {
    const r = await nova({ valor: "50,00" });
    await expect(pagar(r.primeiraId, "50,01")).rejects.toThrow(/passa do saldo/);
    await tx((t) => cancelarContaAPagar(t, r.primeiraId, "teste", ctx()));
    await expect(pagar(r.primeiraId, "10,00")).rejects.toThrow(/cancelad/);
    const paga = await nova({ valor: "20,00" });
    await pagar(paga.primeiraId, "20,00");
    await expect(pagar(paga.primeiraId, "1,00")).rejects.toThrow(/já está pago/);
    expect(await prisma.lancamento.count({ where: { contaPagarId: r.primeiraId } })).toBe(0);
  });

  it("dois pagamentos simultâneos nunca passam do valor", async () => {
    const r = await nova({ valor: "100,00" });
    const res = await Promise.allSettled([pagar(r.primeiraId, "60,00"), pagar(r.primeiraId, "60,00")]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await de(r.primeiraId)).toMatchObject({ valorPagoCentavos: 6000, status: "PARCIAL" });
  });

  it("estorno devolve o valor pago e o saldo do banco; a conta volta a dever", async () => {
    const r = await nova({ valor: "200,00" });
    const antes = await saldoDoBanco();
    await pagar(r.primeiraId, "80,00");
    const quitacao = await pagar(r.primeiraId, "120,00");
    await tx((t) => estornarLancamento(t, quitacao.lancamentoId, "Pagamento duplicado", ctx()));
    expect(await de(r.primeiraId)).toMatchObject({ status: "PARCIAL", valorPagoCentavos: 8000 });
    expect(await saldoDoBanco()).toBe(antes - 8000);
    const detalhe = (await obterContaAPagar(r.primeiraId, HOJE))!;
    expect(detalhe.pagamentos.map((p) => [p.valorCentavos, p.estornadoEm !== null])).toEqual([[8000, false], [12000, true]]);
  });
});

describe("correções da revisão sênior", () => {
  it("conta ainda pagável depois que a categoria foi inativada", async () => {
    const cat = await prisma.categoriaFinanceira.create({ data: { nome: `${PREFIXO} Inativável`, tipo: "DESPESA", grupo: "DESPESAS_FIXAS", grupoDre: "Despesas fixas" } });
    const r = await nova({ descricao: `${PREFIXO} Categoria inativada`, categoriaId: cat.id, valor: "50,00" });
    await prisma.categoriaFinanceira.update({ where: { id: cat.id }, data: { ativo: false } });
    expect(await pagar(r.primeiraId, "50,00")).toMatchObject({ status: "PAGA" });
    // Já criar uma conta NOVA com a categoria inativa continua recusado.
    await expect(nova({ categoriaId: cat.id })).rejects.toThrow(/categoria de despesa/);
  });

  it("recorrência com início no passado não gera dezenas de contas atrasadas (só do mês anterior em diante)", async () => {
    const r = await nova({ descricao: `${PREFIXO} Início antigo`, modo: "RECORRENTE", valor: "10,00", vencimento: "2016-01-10" });
    const lista = await prisma.contaPagar.findMany({ where: { recorrenciaId: r.recorrenciaId! }, orderBy: { vencimento: "asc" } });
    // Hoje é 20/11/2026: nascem de outubro/2026 até o horizonte (fevereiro/2027), e não 130 contas desde 2016.
    expect(lista.map((c) => dia(c.vencimento))).toEqual(["2026-10-10", "2026-11-10", "2026-12-10", "2027-01-10", "2027-02-10"]);
  });

  it("antecipar o fim da recorrência cancela as ocorrências já geradas depois dele (em aberto e sem pagamento)", async () => {
    const r = await nova({ descricao: `${PREFIXO} Fim antecipado`, modo: "RECORRENTE", valor: "10,00", vencimento: "2026-12-10" });
    const edicao = recorrenciaSchema.parse({ recorrenciaId: r.recorrenciaId!, descricao: `${PREFIXO} Fim antecipado`, categoriaId: categoriaDespesa, valor: "10,00", diaVencimento: "10", fim: "2026-12-31" });
    await tx((t) => editarRecorrencia(t, edicao, ctx()));
    const status = (await prisma.contaPagar.findMany({ where: { recorrenciaId: r.recorrenciaId! }, orderBy: { vencimento: "asc" } })).map((c) => c.status);
    expect(status).toEqual(["ABERTA", "CANCELADA", "CANCELADA"]);
  });

  it("parcelamento de valor pequeno (R$ 0,08 em 5x) cria parcelas válidas", async () => {
    const r = await nova({ descricao: `${PREFIXO} Pequeno`, modo: "PARCELADA", valor: "0,08", parcelas: "5" });
    expect(r.criadas).toBe(5);
    const valores = (await prisma.contaPagar.findMany({ where: { descricao: { startsWith: `${PREFIXO} Pequeno` } }, orderBy: { parcelaNumero: "asc" } })).map((c) => c.valorCentavos);
    expect(valores).toEqual([1, 1, 1, 1, 4]);
  });

  it("estorno e pagamento simultâneos nunca deixam o valor pago diferente da soma dos lançamentos não estornados", async () => {
    const r = await nova({ descricao: `${PREFIXO} Estorno concorrente`, valor: "200,00" });
    const primeiro = await pagar(r.primeiraId, "80,00");
    const res = await Promise.allSettled([tx((t) => estornarLancamento(t, primeiro.lancamentoId, "Concorrência", ctx())), pagar(r.primeiraId, "150,00")]);
    expect(res.filter((x) => x.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    const c = await de(r.primeiraId);
    const lanc = await prisma.lancamento.findMany({ where: { contaPagarId: r.primeiraId, estornadoEm: null } });
    expect(c.valorPagoCentavos).toBe(lanc.reduce((s, l) => s + l.valorCentavos, 0));
    expect(c.valorPagoCentavos).toBeLessThanOrEqual(c.valorCentavos);
  });
});

describe("ajuste, cancelamento e reabertura", () => {
  it("desconto não vai abaixo do pago; igualar quita; novo vencimento é gravado", async () => {
    const r = await nova({ valor: "100,00" });
    await pagar(r.primeiraId, "30,00");
    const ajustar = (valor: number | null, vencimento: string | null = null) => tx((t) => ajustarContaAPagar(t, { contaPagarId: r.primeiraId, valorCentavos: valor, vencimento, motivo: "Acordo com o fornecedor" }, ctx()));
    await expect(ajustar(2000)).rejects.toThrow(/não pode ser menor/);
    await ajustar(3000);
    expect(await de(r.primeiraId)).toMatchObject({ valorCentavos: 3000, status: "PAGA" });
    await expect(ajustar(null, "2026-12-30")).rejects.toThrow(/já está paga/);
    await ajustar(5000);
    expect(await de(r.primeiraId)).toMatchObject({ status: "PARCIAL" });
    await ajustar(null, "2026-12-30");
    expect(dia((await de(r.primeiraId)).vencimento)).toBe("2026-12-30");
    await expect(ajustar(5000, "2026-12-30")).rejects.toThrow(/Nada foi alterado/);
  });

  it("cancelar recusa com pagamento; sem pagamento cancela e dá para reabrir", async () => {
    const paga = await nova({ valor: "10,00" });
    await pagar(paga.primeiraId, "1,00");
    await expect(tx((t) => cancelarContaAPagar(t, paga.primeiraId, "motivo", ctx()))).rejects.toThrow(/estorne antes/);
    const c = await nova({ valor: "10,00" });
    await tx((t) => cancelarContaAPagar(t, c.primeiraId, "Pedido cancelado", ctx()));
    expect((await de(c.primeiraId)).status).toBe("CANCELADA");
    await tx((t) => reabrirContaAPagar(t, c.primeiraId, ctx()));
    expect((await de(c.primeiraId)).status).toBe("ABERTA");
    await expect(tx((t) => reabrirContaAPagar(t, c.primeiraId, ctx()))).rejects.toThrow(/cancelada/);
  });
});

describe("lista e atraso derivado (critério de aceite)", () => {
  it("as abas agrupam pela data de hoje; o saldo é o que falta pagar", async () => {
    const mk = (nome: string, vencimento: string, extra: Partial<Prisma.ContaPagarUncheckedCreateInput> = {}) =>
      prisma.contaPagar.create({ data: { descricao: `${PREFIXO} Lista ${nome}`, valorCentavos: 10000, vencimento: new Date(`${vencimento}T00:00:00Z`), competencia: new Date(`${vencimento.slice(0, 7)}-01T00:00:00Z`), categoriaId: categoriaDespesa, ...extra } });
    await mk("Ontem", "2026-11-19");
    const parcial = await mk("Parcial vencida", "2026-11-10");
    await prisma.contaPagar.update({ where: { id: parcial.id }, data: { status: "PARCIAL", valorPagoCentavos: 4000 } });
    await mk("Hoje", HOJE);
    await mk("Em 3 dias", "2026-11-23");
    await mk("Em 8 dias", "2026-11-28");
    await mk("Paga", "2026-11-01", { status: "PAGA", valorPagoCentavos: 10000 });

    const lista = async (aba: string) => {
      const { parametros, filtros } = lerListaAPagar({ aba, busca: `${PREFIXO} Lista`, tamanho: "100" });
      return listarContasAPagar(parametros, filtros, HOJE, 7);
    };
    const nomes = async (aba: string) => (await lista(aba)).linhas.map((l) => l.descricao.replace(`${PREFIXO} Lista `, ""));
    expect(await nomes("atrasadas")).toEqual(["Parcial vencida", "Ontem"]);
    expect(await nomes("hoje")).toEqual(["Hoje"]);
    expect(await nomes("proximos")).toEqual(["Em 3 dias"]);
    expect(await nomes("pagas")).toEqual(["Paga"]);
    const abertas = await lista("abertas");
    expect(abertas.contagens).toMatchObject({ abertas: 5, atrasadas: 2, hoje: 1, proximos: 1, pagas: 1, todas: 6 });
    expect(abertas.totais).toEqual({ saldoCentavos: 40000 + 6000, atrasadoCentavos: 16000 });
    expect(abertas.linhas.find((l) => l.descricao.endsWith("Parcial vencida"))!.resumo).toMatchObject({ situacao: "ATRASADO", parcial: true, saldoCentavos: 6000, diasEmAtraso: 10 });
  });
});
