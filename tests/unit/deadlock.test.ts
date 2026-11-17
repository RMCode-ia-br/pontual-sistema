import { describe, expect, it } from "vitest";

import { ehDeadlock, tentarDeNovoEmDeadlock } from "@/lib/db/deadlock";

const deadlock = () => Object.assign(new Error("Raw query failed. Code: `40P01`. Message: `deadlock detected`"), { code: "P2010", meta: { code: "40P01" } });

describe("ehDeadlock", () => {
  it("reconhece o P2034 do Prisma e o 40P01 do Postgres, em qualquer das formas", () => {
    expect(ehDeadlock(Object.assign(new Error("x"), { code: "P2034" }))).toBe(true);
    expect(ehDeadlock(deadlock())).toBe(true);
    expect(ehDeadlock(new Error("ERROR: deadlock detected"))).toBe(true);
  });
  it("não confunde com outros erros nem quebra com valores estranhos", () => {
    expect(ehDeadlock(new Error("Unique constraint failed"))).toBe(false);
    expect(ehDeadlock(Object.assign(new Error("x"), { code: "P2002" }))).toBe(false);
    for (const v of [null, undefined, "deadlock", 42, {}]) expect(ehDeadlock(v)).toBe(false);
  });
});

describe("tentarDeNovoEmDeadlock", () => {
  it("refaz uma vez quando a transação foi a vítima do deadlock", async () => {
    let chamadas = 0;
    const r = await tentarDeNovoEmDeadlock(async () => {
      chamadas += 1;
      if (chamadas === 1) throw deadlock();
      return "ok";
    });
    expect(r).toBe("ok");
    expect(chamadas).toBe(2);
  });
  it("desiste depois do limite e repassa o erro", async () => {
    let chamadas = 0;
    await expect(
      tentarDeNovoEmDeadlock(async () => {
        chamadas += 1;
        throw deadlock();
      }),
    ).rejects.toThrow(/deadlock/);
    expect(chamadas).toBe(2);
  });
  it("erro de regra (qualquer outro) sobe na hora, sem repetir", async () => {
    let chamadas = 0;
    await expect(
      tentarDeNovoEmDeadlock(async () => {
        chamadas += 1;
        throw new Error("Esta aprovação já foi desfeita.");
      }),
    ).rejects.toThrow(/já foi desfeita/);
    expect(chamadas).toBe(1);
  });
});
