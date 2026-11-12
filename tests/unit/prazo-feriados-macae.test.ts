import { describe, expect, it } from "vitest";

import { feriadosDoSeed } from "../../prisma/seed-dados";
import { datasDeFeriado, somarDiasUteis } from "../../src/lib/dominio/dias-uteis";
import { calcularPrazoFinal, diasDePausaJustificada } from "../../src/lib/dominio/prazo-obra";

const doSeed = (anoInicial: number, anoFinal: number, filtro: (nome: string) => boolean = () => true) =>
  datasDeFeriado(
    feriadosDoSeed(anoInicial, anoFinal)
      .filter((f) => filtro(f.nome))
      .map((f) => ({ data: f.data.toISOString().slice(0, 10), tipo: f.tipo })),
  );

const ehDeMacae = (nome: string) => /Macaé/.test(nome);

describe("o prazo da obra respeita os feriados de Macaé do seed", () => {
  const comMacae = doSeed(2026, 2030);
  const semMacae = doSeed(2026, 2030, (nome) => !ehDeMacae(nome));

  it("São João Batista (qua 24/06/2026): 5 dias úteis a partir de 22/06 terminam em 30/06, e não em 29/06", () => {
    expect(somarDiasUteis("2026-06-22", 5, semMacae)).toBe("2026-06-29");
    expect(somarDiasUteis("2026-06-22", 5, comMacae)).toBe("2026-06-30");
  });

  it("emancipação (qua 29/07/2026): 3 dias úteis a partir de 27/07 terminam em 31/07, e não em 30/07", () => {
    expect(somarDiasUteis("2026-07-27", 3, semMacae)).toBe("2026-07-30");
    expect(somarDiasUteis("2026-07-27", 3, comMacae)).toBe("2026-07-31");
  });

  it("Dia do Comerciário (seg 19/10/2026): 3 dias úteis a partir de 14/10 terminam em 20/10, e não em 19/10", () => {
    expect(somarDiasUteis("2026-10-14", 3, semMacae)).toBe("2026-10-19");
    expect(somarDiasUteis("2026-10-14", 3, comMacae)).toBe("2026-10-20");
  });

  it("a data do Dia do Comerciário acompanha a regra: em 2027 é 18/10 (e 19/10/2026 deixa de ser feriado)", () => {
    expect(somarDiasUteis("2027-10-14", 3, comMacae)).toBe("2027-10-20"); // 15, (18 feriado) 19, 20
    expect(somarDiasUteis("2027-10-14", 3, semMacae)).toBe("2027-10-19");
    expect(comMacae.has("2027-10-18")).toBe(true);
    expect(comMacae.has("2027-10-19")).toBe(false);
    expect(comMacae.has("2026-10-19")).toBe(true);
  });

  it("o prazo final prometido sai um dia útil mais tarde quando atravessa o feriado de Macaé", () => {
    const sem = calcularPrazoFinal("2026-06-22", 5, [], "2026-06-22", "UTEIS", semMacae);
    const com = calcularPrazoFinal("2026-06-22", 5, [], "2026-06-22", "UTEIS", comMacae);
    expect(sem.comPausas).toBe("2026-06-29");
    expect(com.comPausas).toBe("2026-06-30");
  });

  it("feriado de Macaé dentro de uma pausa justificada não conta como dia de pausa (sem contar duas vezes)", () => {
    // Pausa de sexta 16/10 a terça 20/10 (relógio iniciado em 05/10): sexta e terça contam; segunda 19/10 é feriado.
    const pausa = [{ inicio: "2026-10-16", fim: "2026-10-20", justificada: true }];
    expect(diasDePausaJustificada(pausa, "2026-10-05", "2026-10-30", "UTEIS", semMacae)).toBe(3);
    expect(diasDePausaJustificada(pausa, "2026-10-05", "2026-10-30", "UTEIS", comMacae)).toBe(2);
    // E o prazo: 10 dias úteis + 2 de pausa, tudo contado com o feriado.
    const r = calcularPrazoFinal("2026-10-05", 10, pausa, "2026-10-30", "UTEIS", comMacae);
    expect(r.diasPausaJustificada).toBe(2);
    expect(r.comPausas).toBe(somarDiasUteis("2026-10-05", 12, comMacae));
  });

  it("em dias corridos o feriado não altera o prazo", () => {
    // (a regra vale só para dias úteis: R8)
    const sem = calcularPrazoFinal("2026-06-22", 5, [], "2026-06-22", "CORRIDOS", semMacae);
    const com = calcularPrazoFinal("2026-06-22", 5, [], "2026-06-22", "CORRIDOS", comMacae);
    expect(com.comPausas).toBe(sem.comPausas);
  });
});
