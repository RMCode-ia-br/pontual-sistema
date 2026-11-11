import { describe, expect, it } from "vitest";

import { avaliarBloqueio, BLOQUEIO_MS, falhasContadas, JANELA_MS, MAX_FALHAS, statusBloqueioDasTentativas } from "@/lib/auth/bloqueio";

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

describe("contagem de falhas a partir das tentativas lidas", () => {
  const t = (identificador: string, ip: string, sucesso: boolean, minAtras: number) => ({
    identificador,
    ip,
    sucesso,
    criadoEm: minutosAtras(minAtras),
  });

  it("só conta falhas da chave pedida dentro da janela de 15 minutos", () => {
    const tentativas = [t("ana", "1.1.1.1", false, 1), t("ana", "1.1.1.1", false, 20), t("bia", "1.1.1.1", false, 2)];
    expect(falhasContadas(tentativas, (x) => x.identificador === "ana", AGORA)).toHaveLength(1);
    expect(falhasContadas(tentativas, (x) => x.ip === "1.1.1.1", AGORA)).toHaveLength(2);
  });

  it("um login bem-sucedido zera as falhas anteriores a ele, mas não as posteriores", () => {
    const tentativas = [t("ana", "ip", false, 10), t("ana", "ip", false, 9), t("ana", "ip", true, 8), t("ana", "ip", false, 3)];
    const contadas = falhasContadas(tentativas, (x) => x.identificador === "ana", AGORA);
    expect(contadas).toHaveLength(1);
    expect(contadas[0].getTime()).toBe(minutosAtras(3).getTime());
  });

  it("bloqueia pela CONTA (5 falhas) mesmo vindo de IPs diferentes", () => {
    const tentativas = [1, 2, 3, 4, 5].map((i) => t("ana", `ip-${i}`, false, i));
    expect(statusBloqueioDasTentativas(tentativas, "ana", "ip-novo", AGORA)).toMatchObject({ bloqueado: true });
    expect(statusBloqueioDasTentativas(tentativas, "bia", "ip-novo", AGORA)).toEqual({ bloqueado: false });
  });

  it("bloqueia pelo IP (5 falhas) mesmo contra contas diferentes", () => {
    const tentativas = ["a", "b", "c", "d", "e"].map((c, i) => t(c, "ip-atacante", false, i + 1));
    expect(statusBloqueioDasTentativas(tentativas, "outra-conta", "ip-atacante", AGORA)).toMatchObject({ bloqueado: true });
    expect(statusBloqueioDasTentativas(tentativas, "outra-conta", "ip-limpo", AGORA)).toEqual({ bloqueado: false });
  });

  it("quando conta e IP estão bloqueados, vale o bloqueio que termina mais tarde", () => {
    const porConta = [1, 2, 3, 4, 5].map((i) => t("ana", "ip-a", false, i + 5)); // última falha há 6 min
    const porIp = [1, 2, 3, 4, 5].map((i) => t(`x${i}`, "ip-b", false, i)); // última falha há 1 min
    const r = statusBloqueioDasTentativas([...porConta, ...porIp], "ana", "ip-b", AGORA);
    expect(r).toMatchObject({ bloqueado: true });
    if (r.bloqueado) expect(r.ate.getTime()).toBe(minutosAtras(1).getTime() + BLOQUEIO_MS);
  });
});
