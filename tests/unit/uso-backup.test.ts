import { describe, expect, it } from "vitest";

import { bytesLegiveis, nivelDeUso, percentualDeUso } from "@/modules/backup/uso";

describe("uso do plano gratuito", () => {
  it("alerta a partir de 70% e fica crítico a partir de 90%", () => {
    expect(nivelDeUso(69, 100)).toBe("normal");
    expect(nivelDeUso(70, 100)).toBe("atencao");
    expect(nivelDeUso(89, 100)).toBe("atencao");
    expect(nivelDeUso(90, 100)).toBe("critico");
    expect(nivelDeUso(150, 100)).toBe("critico");
  });

  it("limite inválido não gera alerta nem divisão por zero", () => {
    expect(nivelDeUso(10, 0)).toBe("normal");
    expect(percentualDeUso(10, 0)).toBe(0);
  });

  it("percentual com uma casa e teto de 100", () => {
    expect(percentualDeUso(1, 3)).toBe(33.3);
    expect(percentualDeUso(500, 100)).toBe(100);
  });

  it("formata bytes", () => {
    expect(bytesLegiveis(512 * 1024)).toBe("512 KB");
    expect(bytesLegiveis(5 * 1024 * 1024)).toBe("5,0 MB");
    expect(bytesLegiveis(1.5 * 1024 * 1024 * 1024)).toBe("1,50 GB");
  });
});
