import { describe, expect, it } from "vitest";

import { avaliarBloqueio, BLOQUEIO_MS, JANELA_MS, MAX_FALHAS } from "@/lib/auth/bloqueio";

const AGORA = new Date("2026-11-11T12:00:00Z");
const minutosAtras = (n: number) => new Date(AGORA.getTime() - n * 60_000);

describe("bloqueio por tentativas de login", () => {
  it("usa 5 falhas, janela e bloqueio de 15 minutos (spec seção 3)", () => {
    expect(MAX_FALHAS).toBe(5);
    expect(JANELA_MS).toBe(15 * 60_000);
    expect(BLOQUEIO_MS).toBe(15 * 60_000);
  });

  it("não bloqueia sem falhas", () => {
    expect(avaliarBloqueio([], AGORA)).toEqual({ bloqueado: false });
  });

  it("não bloqueia com 4 falhas recentes", () => {
    const falhas = [1, 2, 3, 4].map(minutosAtras);
    expect(avaliarBloqueio(falhas, AGORA)).toEqual({ bloqueado: false });
  });

  it("bloqueia na 5ª falha dentro da janela", () => {
    const falhas = [1, 2, 3, 4, 5].map(minutosAtras);
    const r = avaliarBloqueio(falhas, AGORA);
    expect(r.bloqueado).toBe(true);
  });

  it("o bloqueio dura 15 min a partir da falha mais recente", () => {
    const falhas = [2, 3, 4, 5, 6].map(minutosAtras);
    const r = avaliarBloqueio(falhas, AGORA);
    expect(r).toMatchObject({ bloqueado: true, minutosRestantes: 13 });
    if (r.bloqueado) expect(r.ate.getTime()).toBe(minutosAtras(2).getTime() + BLOQUEIO_MS);
  });

  it("ignora falhas fora da janela de 15 minutos", () => {
    const falhas = [1, 2, 3, 16, 20].map(minutosAtras);
    expect(avaliarBloqueio(falhas, AGORA)).toEqual({ bloqueado: false });
  });

  it("libera quando o bloqueio expira (última falha há mais de 15 min)", () => {
    // 5 falhas, a mais recente exatamente há 15 min: já saiu da janela e o bloqueio acabou.
    const falhas = [15, 16, 17, 18, 19].map(minutosAtras);
    expect(avaliarBloqueio(falhas, AGORA)).toEqual({ bloqueado: false });
  });

  it("sempre informa pelo menos 1 minuto restante", () => {
    // 5 falhas exatamente em AGORA; consulta 14 min e 59 s depois: faltam 1 s de bloqueio.
    const falhas = [0, 0, 0, 0, 0].map(minutosAtras);
    const r = avaliarBloqueio(falhas, new Date(AGORA.getTime() + 14 * 60_000 + 59_000));
    expect(r).toMatchObject({ bloqueado: true, minutosRestantes: 1 });
  });
});
