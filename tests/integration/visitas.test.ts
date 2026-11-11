import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { proximoCodigoDoProjeto } from "@/modules/projetos/servico";
import { listarMedidasDoProjeto, medidasParaProposta } from "@/modules/visitas/queries";

import { comConexao } from "./banco-teste";

const PREFIXO = "Int Visita";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

async function limpar() {
  await comConexao(async (c) => {
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE $1`;
    await c.query(`DELETE FROM "MedidaRascunho" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Projeto" WHERE titulo LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(
      `UPDATE "ContadorSequencia" SET "valor" = coalesce((SELECT max(substring("codigo" from 8)::int) FROM "Projeto" WHERE "codigo" LIKE 'P-' || substring("chave" from 9) || '-%'), 0) WHERE "chave" LIKE 'projeto:%'`,
    );
  });
}

let projetoId: string;

beforeAll(async () => {
  await limpar();
  const cliente = await prisma.cliente.create({ data: { nome: `${PREFIXO} Cliente` } });
  const projeto = await prisma.$transaction(async (tx) => tx.projeto.create({ data: { codigo: await proximoCodigoDoProjeto(tx), titulo: `${PREFIXO} Obra`, clienteId: cliente.id } }));
  projetoId = projeto.id;
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe("medidas-rascunho", () => {
  it("o banco recusa medida zero ou negativa e quantidade zero", async () => {
    await expect(prisma.medidaRascunho.create({ data: { projetoId, larguraMm: 0 } })).rejects.toThrow();
    await expect(prisma.medidaRascunho.create({ data: { projetoId, alturaMm: -5 } })).rejects.toThrow();
    await expect(prisma.medidaRascunho.create({ data: { projetoId, quantidade: 0 } })).rejects.toThrow();
  });

  it("lista na ordem anotada, sem as removidas", async () => {
    await prisma.medidaRascunho.createMany({
      data: [
        { projetoId, ambiente: "Sala", larguraMm: 2000, alturaMm: 1200, quantidade: 2, ordem: 1 },
        { projetoId, ambiente: "Removida", larguraMm: 500, alturaMm: 500, ordem: 2, deletadoEm: new Date() },
        { projetoId, ambiente: "Suíte", larguraMm: 1500, ordem: 3 }, // sem altura ainda
        { projetoId, ambiente: "Varanda", ordem: 4 }, // só ambiente (e foto, na obra)
      ],
    });
    const lista = await listarMedidasDoProjeto(projetoId);
    expect(lista.map((m) => m.ambiente)).toEqual(["Sala", "Suíte", "Varanda"]);
  });

  it("para a proposta, só as medidas completas viram itens; as incompletas voltam apontadas", async () => {
    const { prontas, incompletas } = await medidasParaProposta(projetoId);
    expect(prontas).toHaveLength(1);
    expect(prontas[0]).toMatchObject({ ambiente: "Sala", larguraMm: 2000, alturaMm: 1200, quantidade: 2 });
    expect(incompletas.map((m) => m.ambiente)).toEqual(["Suíte", "Varanda"]);
  });

  it("o banco recusa medida de projeto inexistente (chave estrangeira)", async () => {
    await expect(prisma.medidaRascunho.create({ data: { projetoId: "nao-existe" } })).rejects.toThrow();
  });
});
