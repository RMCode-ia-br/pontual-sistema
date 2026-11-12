import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { listarFeriados } from "@/modules/feriados/queries";

import { comConexao } from "./banco-teste";

const PREFIXO = "Int Feriado";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

// Anos distantes de qualquer dado real; o período atravessa a virada do ano.
const FERIAS_INICIO = "2044-12-22";
const FERIAS_FIM = "2045-01-05";

async function limpar() {
  await comConexao(async (c) => {
    await c.query(`DELETE FROM "Feriado" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
  });
}

beforeAll(async () => {
  await limpar();
  await prisma.feriado.create({
    data: {
      data: new Date(`${FERIAS_INICIO}T00:00:00Z`),
      dataFim: new Date(`${FERIAS_FIM}T00:00:00Z`),
      nome: `${PREFIXO} Férias de fim de ano`,
      tipo: "FERIAS_COLETIVA_FORNECEDORES",
    },
  });
  await prisma.feriado.create({ data: { data: new Date("2045-03-01T00:00:00Z"), nome: `${PREFIXO} Um dia`, tipo: "FERIADO" } });
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe("listarFeriados: períodos que atravessam a virada do ano", () => {
  const nomes = async (ano: number) => (await listarFeriados(ano)).map((f) => f.nome).filter((n) => n.startsWith(PREFIXO));

  it("aparecem no ano em que começam e no ano em que terminam", async () => {
    expect(await nomes(2044)).toEqual([`${PREFIXO} Férias de fim de ano`]);
    expect(await nomes(2045)).toEqual([`${PREFIXO} Férias de fim de ano`, `${PREFIXO} Um dia`]);
  });

  it("não aparecem em anos que não toca", async () => {
    expect(await nomes(2043)).toEqual([]);
    expect(await nomes(2046)).toEqual([]);
  });

  it("um feriado de um dia só aparece no próprio ano", async () => {
    expect(await nomes(2044)).not.toContain(`${PREFIXO} Um dia`);
  });
});
