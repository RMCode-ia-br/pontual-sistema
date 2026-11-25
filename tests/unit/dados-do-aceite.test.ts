import { describe, expect, it } from "vitest";

import { DadosDoAceiteIncompletos, exigirDadosDoAceite, temDadosDoAceite } from "@/modules/indicadores/dados-do-aceite";

const completa = { valorReferenciaAprovadoCentavos: 1000, ajusteAprovadoCentavos: 0, acrescimoNotaAprovadoCentavos: 0, repasseCartaoAprovadoCentavos: 0 };

describe("valores do aceite (fonte única do repasse)", () => {
  it("zero é valor: só nulo conta como faltando", () => {
    expect(temDadosDoAceite(completa)).toBe(true);
    for (const coluna of Object.keys(completa)) expect(temDadosDoAceite({ ...completa, [coluna]: null }), coluna).toBe(false);
  });

  it("sem números não faz nada; com números recusa em português e diz quais propostas", () => {
    expect(() => exigirDadosDoAceite([])).not.toThrow();
    expect(() => exigirDadosDoAceite(["1258-26", "1260-26"])).toThrow(DadosDoAceiteIncompletos);
    expect(() => exigirDadosDoAceite(["1258-26", "1260-26"])).toThrow(/sem os valores gravados no aceite \(1258-26, 1260-26\).*zero em silêncio/);
  });

  it("mais de cinco propostas: lista as cinco primeiras e conta o resto", () => {
    const numeros = Array.from({ length: 8 }, (_, i) => `${1000 + i}-26`);
    expect(() => exigirDadosDoAceite(numeros)).toThrow(/1000-26, 1001-26, 1002-26, 1003-26, 1004-26 e mais 3/);
  });
});
