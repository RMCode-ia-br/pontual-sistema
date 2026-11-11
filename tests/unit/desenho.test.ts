import { describe, expect, it } from "vitest";

import { ALTURA_QUADRO, gerarDesenho, LARGURA_QUADRO, type TipoDesenho } from "@/lib/dominio/desenho";

const TIPOS: TipoDesenho[] = ["JANELA_CORRER", "PORTA_CORRER", "BASCULA", "PAINEL_FIXO", "PORTA_GIRO", "BOX_FRONTAL", "GUARDA_CORPO", "FECHAMENTO_SACADA", "PORTAO", "PERGOLADO", "ESPELHO", "GENERICO"];

describe("gerarDesenho", () => {
  it("todo tipo gera formas finitas dentro do quadro, mesmo com medidas extremas", () => {
    for (const tipo of TIPOS) {
      for (const [l, a] of [[2000, 1200], [100, 5000], [20000, 300], [1, 1]] as const) {
        const formas = gerarDesenho({ tipo, folhas: 3, larguraMm: l, alturaMm: a });
        expect(formas.length, `${tipo} ${l}x${a}`).toBeGreaterThan(0);
        for (const f of formas) {
          const nums = f.t === "rect" ? [f.x, f.y, f.w, f.h] : [f.x1, f.y1, f.x2, f.y2];
          for (const n of nums) expect(Number.isFinite(n), `${tipo}`).toBe(true);
          if (f.t === "rect") {
            expect(f.x).toBeGreaterThanOrEqual(-0.01);
            expect(f.y).toBeGreaterThanOrEqual(-0.01);
            expect(f.x + f.w).toBeLessThanOrEqual(LARGURA_QUADRO + 0.01);
            expect(f.y + f.h).toBeLessThanOrEqual(ALTURA_QUADRO + 0.01);
          }
        }
      }
    }
  });

  it("janela de correr tem uma folha de vidro por folha (mínimo 2)", () => {
    const vidros = (n: number) => gerarDesenho({ tipo: "JANELA_CORRER", folhas: n, larguraMm: 2000, alturaMm: 1200 }).filter((f) => f.t === "rect" && f.vidro).length;
    expect(vidros(2)).toBe(2);
    expect(vidros(4)).toBe(4);
    expect(vidros(1)).toBe(2);
  });

  it("respeita a proporção do vão (largo fica mais largo que alto)", () => {
    const [moldura] = gerarDesenho({ tipo: "PAINEL_FIXO", larguraMm: 3000, alturaMm: 1000 });
    expect(moldura.t === "rect" && moldura.w > moldura.h * 2).toBe(true);
  });
});
