import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";

import { comConexao } from "./banco-teste";

/**
 * Restrições da migração da Fase 4 que só existem no banco (índices parciais e CHECKs): o Prisma não as
 * expressa, então um teste precisa provar que continuam valendo.
 */
const PREFIXO = "Int Obr";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

const UNICIDADE = { code: "23505" };
const CHECK = { code: "23514" };

let projetoId: string;
let motivoId: string;

async function limpar() {
  await comConexao(async (c) => {
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE $1`;
    await c.query(`DELETE FROM "EtapaProjeto" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "PausaProjeto" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Projeto" WHERE titulo LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "MotivoBloqueio" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ModeloEtapaItem" WHERE "modeloId" IN (SELECT id FROM "ModeloEtapas" WHERE nome LIKE $1)`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ModeloEtapas" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
  });
}

beforeAll(async () => {
  await limpar();
  const cliente = await prisma.cliente.create({ data: { nome: `${PREFIXO} Cliente`, tipoPessoa: "PF" } });
  projetoId = (await prisma.projeto.create({ data: { codigo: `P-0000-${randomUUID().slice(0, 8)}`, titulo: `${PREFIXO} Obra`, clienteId: cliente.id } })).id;
  // Motivo de bloqueio do próprio teste (o dono pode renomear ou excluir os do catálogo).
  motivoId = (await prisma.motivoBloqueio.create({ data: { nome: `${PREFIXO} Motivo` } })).id;
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

const modelo = (c: import("pg").Client, padrao = false) => {
  const id = randomUUID();
  return c.query(`INSERT INTO "ModeloEtapas" (id, nome, padrao, "atualizadoEm") VALUES ($1, $2, $3, now())`, [id, `${PREFIXO} ${id.slice(0, 6)}`, padrao]).then(() => id);
};

const item = (c: import("pg").Client, modeloId: string, o: { ordem?: number; gatilho?: string | null; marco?: boolean; peso?: number; deletado?: boolean } = {}) =>
  c.query(
    `INSERT INTO "ModeloEtapaItem" (id, "modeloId", tipo, nome, ordem, peso, "liberaGatilho", "marcoGarantia", "deletadoEm", "atualizadoEm")
     VALUES ($1, $2, 'OUTRA', 'Etapa de teste', $3, $4, $5::"GatilhoPagamento", $6, $7, now())`,
    [randomUUID(), modeloId, o.ordem ?? 1, o.peso ?? 1, o.gatilho ?? null, o.marco ?? false, o.deletado ? new Date() : null],
  );

describe("modelo de etapas", () => {
  it("só um modelo pode ser o padrão (a seed já criou o padrão do sistema)", async () => {
    await comConexao(async (c) => {
      await expect(modelo(c, true)).rejects.toMatchObject(UNICIDADE);
      await expect(modelo(c, false)).resolves.toBeTruthy();
    });
  });

  it("um item por gatilho em cada modelo; outro modelo pode usar o mesmo gatilho; item excluído libera", async () => {
    await comConexao(async (c) => {
      const a = await modelo(c);
      const b = await modelo(c);
      await item(c, a, { ordem: 1, gatilho: "ENTREGA_MATERIAL" });
      await expect(item(c, a, { ordem: 2, gatilho: "ENTREGA_MATERIAL" })).rejects.toMatchObject(UNICIDADE);
      await expect(item(c, a, { ordem: 3, gatilho: "ENTREGA_E_INSTALACAO" })).resolves.toBeTruthy();
      await expect(item(c, b, { ordem: 1, gatilho: "ENTREGA_MATERIAL" })).resolves.toBeTruthy();
      await expect(item(c, a, { ordem: 4, gatilho: "ENTREGA_MATERIAL", deletado: true })).resolves.toBeTruthy();
    });
  });

  it("um único marco de garantia por modelo", async () => {
    await comConexao(async (c) => {
      const m = await modelo(c);
      await item(c, m, { ordem: 1, marco: true });
      await expect(item(c, m, { ordem: 2, marco: true })).rejects.toMatchObject(UNICIDADE);
      await expect(item(c, m, { ordem: 3, marco: false })).resolves.toBeTruthy();
    });
  });

  it("só os gatilhos ligados a etapa podem ser liberados por uma etapa; peso mínimo 1", async () => {
    await comConexao(async (c) => {
      const m = await modelo(c);
      await expect(item(c, m, { gatilho: "CONFIRMACAO" })).rejects.toMatchObject(CHECK);
      await expect(item(c, m, { gatilho: "DATA_FIXA" })).rejects.toMatchObject(CHECK);
      await expect(item(c, m, { peso: 0 })).rejects.toMatchObject(CHECK);
    });
  });
});

describe("etapas da obra", () => {
  const etapa = (
    c: import("pg").Client,
    o: { ordem: number; tipo?: string; status?: string; motivo?: string | null; inicio?: string | null; fim?: string | null; deletado?: boolean },
  ) =>
    c.query(
      `INSERT INTO "EtapaProjeto" (id, "projetoId", tipo, nome, ordem, status, "motivoBloqueioId", "inicioPrevisto", "fimPrevisto", "deletadoEm", "atualizadoEm")
       VALUES ($1, $2, $3::"TipoEtapa", 'Etapa de teste', $4, $5::"StatusEtapa", $6, $7, $8, $9, now())`,
      [randomUUID(), projetoId, o.tipo ?? "OUTRA", o.ordem, o.status ?? "PENDENTE", o.motivo ?? null, o.inicio ?? null, o.fim ?? null, o.deletado ? new Date() : null],
    );

  it("uma posição por etapa e uma etapa de cada tipo na obra (protege contra geração em duplicidade)", async () => {
    await comConexao(async (c) => {
      await etapa(c, { ordem: 1, tipo: "MEDICAO_EXATA" });
      await expect(etapa(c, { ordem: 1, tipo: "FABRICACAO" })).rejects.toMatchObject(UNICIDADE);
      await expect(etapa(c, { ordem: 2, tipo: "MEDICAO_EXATA" })).rejects.toMatchObject(UNICIDADE);
      await expect(etapa(c, { ordem: 2, tipo: "FABRICACAO" })).resolves.toBeTruthy();
    });
  });

  it("etapas 'outra' podem se repetir (com ordens diferentes)", async () => {
    await comConexao(async (c) => {
      await expect(etapa(c, { ordem: 10, tipo: "OUTRA" })).resolves.toBeTruthy();
      await expect(etapa(c, { ordem: 11, tipo: "OUTRA" })).resolves.toBeTruthy();
    });
  });

  it("etapa excluída libera a posição e o tipo", async () => {
    await comConexao(async (c) => {
      await etapa(c, { ordem: 20, tipo: "ACABAMENTO", deletado: true });
      await expect(etapa(c, { ordem: 20, tipo: "ACABAMENTO" })).resolves.toBeTruthy();
    });
  });

  it("etapa bloqueada exige motivo (R7)", async () => {
    await comConexao(async (c) => {
      await expect(etapa(c, { ordem: 30, tipo: "PEDIDO_VIDROS", status: "BLOQUEADA" })).rejects.toMatchObject(CHECK);
      await expect(etapa(c, { ordem: 31, tipo: "PEDIDO_VIDROS", status: "BLOQUEADA", motivo: motivoId })).resolves.toBeTruthy();
    });
  });

  it("a data de fim não pode ser anterior à de início", async () => {
    await comConexao(async (c) => {
      await expect(etapa(c, { ordem: 40, tipo: "ENTREGA", inicio: "2026-06-10", fim: "2026-06-09" })).rejects.toMatchObject(CHECK);
      await expect(etapa(c, { ordem: 41, tipo: "ENTREGA", inicio: "2026-06-10", fim: "2026-06-10" })).resolves.toBeTruthy();
    });
  });

  it("não é possível apagar a obra que tem etapas (exclusão é lógica)", async () => {
    await comConexao(async (c) => {
      await expect(c.query(`DELETE FROM "Projeto" WHERE id = $1`, [projetoId])).rejects.toMatchObject({ code: "23503" });
    });
  });
});

describe("pausas e prazo", () => {
  it("a pausa não termina antes de começar; sem fim vale (em curso)", async () => {
    await comConexao(async (c) => {
      const inserir = (inicio: string, fim: string | null) =>
        c.query(`INSERT INTO "PausaProjeto" (id, "projetoId", inicio, fim, "motivoBloqueioId", justificada, "atualizadoEm") VALUES ($1, $2, $3, $4, $5, true, now())`, [
          randomUUID(),
          projetoId,
          inicio,
          fim,
          motivoId,
        ]);
      await expect(inserir("2026-06-10", "2026-06-09")).rejects.toMatchObject(CHECK);
      await expect(inserir("2026-06-10", null)).resolves.toBeTruthy();
      await expect(inserir("2026-06-10", "2026-06-10")).resolves.toBeTruthy();
    });
  });

  it("os prazos do projeto não podem ser negativos nem absurdos", async () => {
    await comConexao(async (c) => {
      const atualizar = (campo: string, valor: number) => c.query(`UPDATE "Projeto" SET "${campo}" = $1 WHERE id = $2`, [valor, projetoId]);
      await expect(atualizar("prazoDias", -1)).rejects.toMatchObject(CHECK);
      await expect(atualizar("prazoMaterialDias", 99999)).rejects.toMatchObject(CHECK);
      await expect(atualizar("diasPausaJustificada", -3)).rejects.toMatchObject(CHECK);
      await expect(atualizar("prazoDias", 35)).resolves.toBeTruthy();
    });
  });
});
