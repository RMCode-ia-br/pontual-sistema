import { describe, expect, it } from "vitest";

import { verificarSharp } from "@/lib/imagem/saude";

describe("verificarSharp", () => {
  it("com o sharp funcionando devolve exatamente 'ok'", async () => {
    expect(await verificarSharp()).toBe("ok");
  });

  it("falha da sonda vira 'falhou' sem lançar e sem vazar a mensagem", async () => {
    const r = await verificarSharp({ executar: async () => { throw new Error("Cannot find module '/var/task/node_modules/sharp' versão 0.35.5"); } });
    expect(r).toBe("falhou");
  });

  it("sonda que trava vira 'falhou' dentro do limite de tempo", async () => {
    const inicio = Date.now();
    const r = await verificarSharp({ executar: () => new Promise<void>(() => undefined), limiteMs: 80 });
    expect(r).toBe("falhou");
    expect(Date.now() - inicio).toBeLessThan(1500);
  });

  it("falha síncrona (lançada na hora) também não escapa", async () => {
    expect(await verificarSharp({ executar: () => { throw new Error("x"); } })).toBe("falhou");
  });
});
