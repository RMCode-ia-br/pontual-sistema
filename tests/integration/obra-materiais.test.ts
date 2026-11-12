import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import type { UsuarioSessao } from "@/lib/auth/sessao";
import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { cancelarCompra, criarCompra } from "@/modules/compras/servico";
import { carregarMateriaisDaObra } from "@/modules/obras/queries-materiais";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

/**
 * Aba "Materiais e compras" da obra (Fase 6, Bloco 6): lista de materiais pela composição da OPÇÃO APROVADA, com a mesma conta do
 * custo, confrontada com o estoque; tipologia sem composição não gera quantidade; vidros por medida e o que já foi pedido.
 * Não usa o contador de propostas (número "Int Mat ..." manual). Só toca registros "Int Mat"/"INT-MAT-".
 */
const PREFIXO = "Int Mat";
const LOGIN = "int-materiais";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

let usuario: UsuarioSessao;
let projetoId: string;
let perfilId: string;
let roldanaId: string;
let fornecedorId: string;
let medidaVidroId: string;
let numeroProposta: string;
let contadorAntes: number | null = null;

const tx = <T>(fn: (t: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn, { timeout: 30_000 });

async function limpar() {
  await comConexao(async (c) => {
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE '${PREFIXO}%'`;
    const propostas = `SELECT id FROM "Proposta" WHERE "projetoId" IN (${projetos})`;
    const compras = `SELECT id FROM "Compra" WHERE "fornecedorId" IN (SELECT id FROM "Fornecedor" WHERE "razaoSocial" LIKE '${PREFIXO}%')`;
    await c.query(`DELETE FROM "LogAuditoria" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE login = $1)`, [LOGIN]);
    await c.query(`DELETE FROM "ItemCompra" WHERE "compraId" IN (${compras})`);
    await c.query(`DELETE FROM "Compra" WHERE id IN (${compras})`);
    await c.query(`DELETE FROM "ItemPropostaMedida" WHERE "itemId" IN (SELECT id FROM "ItemProposta" WHERE "propostaId" IN (${propostas}))`);
    await c.query(`DELETE FROM "ItemProposta" WHERE "propostaId" IN (${propostas})`);
    await c.query(`DELETE FROM "OpcaoProposta" WHERE "propostaId" IN (${propostas})`);
    await c.query(`DELETE FROM "Proposta" WHERE id IN (${propostas})`);
    await c.query(`DELETE FROM "ComposicaoInsumo" WHERE "tipologiaId" IN (SELECT id FROM "Tipologia" WHERE nome LIKE '${PREFIXO}%')`);
    await c.query(`DELETE FROM "Tipologia" WHERE nome LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Produto" WHERE codigo LIKE 'INT-MAT-%'`);
    await c.query(`DELETE FROM "TipoVidro" WHERE nome LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Fornecedor" WHERE "razaoSocial" LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Projeto" WHERE titulo LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Usuario" WHERE login = $1`, [LOGIN]);
  });
}

beforeAll(async () => {
  await limpar();
  contadorAntes = await comConexao(async (c) => (await c.query(`SELECT valor FROM "ContadorSequencia" WHERE chave = 'compra'`)).rows[0]?.valor ?? null);
  await criarUsuarioDeTeste(LOGIN, "senha-de-teste-123");
  const u = await prisma.usuario.findUniqueOrThrow({ where: { login: LOGIN } });
  usuario = { id: u.id, nome: u.nome, login: u.login, email: u.email, papel: "ADMIN", precisaTrocarSenha: false };
  fornecedorId = (await prisma.fornecedor.create({ data: { razaoSocial: `${PREFIXO} Fornecedor` } })).id;
  const clienteId = (await prisma.cliente.create({ data: { nome: `${PREFIXO} Cliente`, tipoPessoa: "PF" } })).id;
  projetoId = (await prisma.projeto.create({ data: { codigo: `P-0000-${randomUUID().slice(0, 8)}`, titulo: `${PREFIXO} Obra`, clienteId, status: "APROVADO", responsavelId: usuario.id } })).id;

  // Estoque de partida: 1 barra do perfil (precisa de 2) e 5 roldanas (precisa de 8).
  perfilId = (await prisma.produto.create({ data: { codigo: `INT-MAT-${randomUUID().slice(0, 6)}`, descricao: `${PREFIXO} Perfil`, unidade: "BARRA", comprimentoBarraMm: 6000, pesoKgPorMetro: "0.5", saldoCache: "1" } })).id;
  roldanaId = (await prisma.produto.create({ data: { codigo: `INT-MAT-${randomUUID().slice(0, 6)}`, descricao: `${PREFIXO} Roldana`, unidade: "UN", saldoCache: "5" } })).id;

  const comComposicao = await prisma.tipologia.create({
    data: {
      nome: `${PREFIXO} Janela`,
      templateDescricao: "JANELA",
      insumos: {
        create: [
          { produtoId: perfilId, unidade: "M", formulaQuantidade: "(L/1000)*2 + (A/1000)*2", perdaPb: 500, ordem: 1 },
          { produtoId: roldanaId, unidade: "UN", formulaQuantidade: "F * 2", perdaPb: 0, ordem: 2 },
          { descricao: "Silicone (sem produto)", unidade: "UN", formulaQuantidade: "1", perdaPb: 0, ordem: 3 },
        ],
      },
    },
  });
  const semComposicao = await prisma.tipologia.create({ data: { nome: `${PREFIXO} Box sem composição`, templateDescricao: "BOX" } });
  const tipoVidro = await prisma.tipoVidro.create({ data: { nome: `${PREFIXO} Vidro` } });

  numeroProposta = `INT-MAT-${randomUUID().slice(0, 5)}`;
  const proposta = await prisma.proposta.create({
    data: {
      projetoId,
      numero: numeroProposta,
      numeroSequencial: 8_000_000 + Math.floor(Math.random() * 900_000),
      ano: 2026,
      data: new Date("2026-11-10T00:00:00Z"),
      clienteNome: `${PREFIXO} Cliente`,
      status: "APROVADA",
      aceitaEm: new Date("2026-11-12T00:00:00Z"),
      opcoes: { create: [{ nome: "Opção 1", ordem: 0 }, { nome: "Opção 2", ordem: 1 }] },
    },
    include: { opcoes: { orderBy: { ordem: "asc" } } },
  });
  await prisma.proposta.update({ where: { id: proposta.id }, data: { opcaoAprovadaId: proposta.opcoes[0].id } });
  const criarItem = async (ordem: number, opcaoId: string, extra: Record<string, unknown>, medidas: { larguraMm: number; alturaMm: number; quantidade: number; local?: string }[]) =>
    prisma.itemProposta.create({
      data: { propostaId: proposta.id, opcaoId, ordem, descricao: `ITEM ${ordem + 1}`, modoPreco: "MANUAL", valorManualCentavos: 100_000, precoTotalCentavos: 100_000, ...extra, medidas: { create: medidas.map((m, i) => ({ ...m, ordem: i })) } },
      include: { medidas: true },
    });
  // Item 1 (aprovado): janela de 2 folhas, 2 peças de 1,2 × 1,0 m, com vidro.
  const i1 = await criarItem(0, proposta.opcoes[0].id, { tipologiaId: comComposicao.id, folhas: 2, tipoVidroId: tipoVidro.id, espessuraVidroMm: 8 }, [{ larguraMm: 1200, alturaMm: 1000, quantidade: 2, local: "Sala" }]);
  medidaVidroId = i1.medidas[0].id;
  // Item 2 (aprovado): tipologia sem composição. Item 3 (aprovado): sem tipologia.
  await criarItem(1, proposta.opcoes[0].id, { tipologiaId: semComposicao.id }, [{ larguraMm: 800, alturaMm: 800, quantidade: 1 }]);
  await criarItem(2, proposta.opcoes[0].id, {}, [{ larguraMm: 500, alturaMm: 500, quantidade: 1 }]);
  // Item da OUTRA opção (não aprovada): não entra em nada.
  await criarItem(3, proposta.opcoes[1].id, { tipologiaId: comComposicao.id, folhas: 2, tipoVidroId: tipoVidro.id }, [{ larguraMm: 3000, alturaMm: 3000, quantidade: 9 }]);
  // Proposta em rascunho da mesma obra: também não entra.
  await prisma.proposta.create({ data: { projetoId, numero: `${numeroProposta}-R`, numeroSequencial: 8_900_000 + Math.floor(Math.random() * 90_000), ano: 2026, data: new Date("2026-11-10T00:00:00Z"), clienteNome: `${PREFIXO} Cliente`, opcoes: { create: [{ nome: "Opção 1" }] } } });
});

afterAll(async () => {
  await limpar();
  await comConexao(async (c) => {
    const max = (await c.query(`SELECT coalesce(max(numero), 0)::int AS m FROM "Compra"`)).rows[0].m as number;
    if (contadorAntes === null && max === 0) await c.query(`DELETE FROM "ContadorSequencia" WHERE chave = 'compra'`);
    else await c.query(`UPDATE "ContadorSequencia" SET valor = $1 WHERE chave = 'compra'`, [Math.max(max, contadorAntes ?? 0)]);
  });
  await prisma.$disconnect();
});

describe("lista de materiais da obra", () => {
  it("usa SÓ a opção aprovada de proposta APROVADA, com a mesma conta do custo (perda de corte), e confronta com o estoque", async () => {
    const m = await carregarMateriaisDaObra(projetoId);
    expect(m.propostas).toEqual([{ numero: numeroProposta, revisao: 0 }]);

    const perfil = m.linhas.find((l) => l.produtoId === perfilId)!;
    // 2 peças × (1,2 m × 2 + 1,0 m × 2 = 4,4 m) × 1,05 = 9,24 m = 2 barras de 6 m (para cima) = 4,62 kg
    expect(perfil).toMatchObject({ necessario: 9.24, unidadeFormula: "M", unidadeProduto: "BARRA", saldo: 1, falta: 1 });
    expect(perfil.equivalencias).toEqual({ metros: 9.24, barras: 2, kg: 4.62 });

    const roldana = m.linhas.find((l) => l.produtoId === roldanaId)!;
    expect(roldana).toMatchObject({ necessario: 8, unidadeProduto: "UN", saldo: 5, falta: 3, semCusto: true }); // F×2 = 4 por peça × 2 peças

    const silicone = m.linhas.find((l) => l.produtoId === null)!;
    expect(silicone).toMatchObject({ produto: "Silicone (sem produto)", necessario: 2, saldo: null, falta: null });
    expect(m.linhas).toHaveLength(3); // o item da outra opção (9 peças) não entrou
  });

  it("item sem tipologia ou com tipologia sem composição vira aviso, nunca quantidade", async () => {
    const m = await carregarMateriaisDaObra(projetoId);
    expect(m.semComposicao.map((s) => [s.proposta, s.itemNumero, s.motivo.includes("não tem composição") ? "sem composição" : s.motivo])).toEqual([
      [numeroProposta, 2, "sem composição"],
      [numeroProposta, 3, "item sem tipologia"],
    ]);
  });

  it("obra sem proposta aprovada devolve tudo vazio", async () => {
    const clienteId = (await prisma.cliente.findFirstOrThrow({ where: { nome: `${PREFIXO} Cliente` } })).id;
    const vazia = await prisma.projeto.create({ data: { codigo: `P-0000-${randomUUID().slice(0, 8)}`, titulo: `${PREFIXO} Obra vazia`, clienteId, status: "APROVADO", responsavelId: usuario.id } });
    const m = await carregarMateriaisDaObra(vazia.id);
    expect(m).toMatchObject({ propostas: [], linhas: [], semComposicao: [], vidros: [], compras: [] });
  });
});

describe("pedido de vidro", () => {
  it("uma linha por medida da opção aprovada, com o vão só como referência; sem compra aparece 'falta pedir'", async () => {
    const m = await carregarMateriaisDaObra(projetoId);
    expect(m.vidros).toHaveLength(1);
    expect(m.vidros[0]).toMatchObject({ medidaId: medidaVidroId, tipoVidro: `${PREFIXO} Vidro`, espessuraMm: 8, vaoLarguraMm: 1200, vaoAlturaMm: 1000, quantidade: 2, local: "Sala", compra: null });
  });

  it("depois de pedido o vidro mostra a compra; cancelada, volta a 'falta pedir'", async () => {
    const compra = await tx((t) =>
      criarCompra(
        t,
        {
          fornecedorId,
          tipo: "VIDRO",
          destino: "OBRA",
          projetoId,
          previsaoEntrega: null,
          condicoes: null,
          observacao: null,
          fazerPedido: true,
          itens: [{ produtoId: null, descricao: `${PREFIXO} Vidro 8 mm`, unidadeCompra: "UN", quantidadeMilesimos: 2_000, precoUnitarioCentavos: null, larguraMm: 1180, alturaMm: 980, espessuraMm: 8, itemPropostaMedidaId: medidaVidroId }],
        },
        { usuario, ip: null },
      ),
    );
    const depois = await carregarMateriaisDaObra(projetoId);
    expect(depois.vidros[0].compra).toMatchObject({ id: compra.id, status: "PEDIDO" });
    expect(depois.vidros[0].compra?.numero).toMatch(/^C-\d{4}/);
    expect(depois.compras).toHaveLength(1);
    expect(depois.compras[0]).toMatchObject({ id: compra.id, tipo: "VIDRO", recebidoCentavos: null });

    await tx((t) => cancelarCompra(t, compra.id, "Mudou a medida", { usuario, ip: null }));
    expect((await carregarMateriaisDaObra(projetoId)).vidros[0].compra).toBeNull();
  });
});
