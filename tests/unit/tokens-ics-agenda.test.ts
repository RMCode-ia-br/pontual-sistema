import { describe, expect, it } from "vitest";

import { eventoParaIcs, calendarioDaAgenda } from "@/modules/agenda/ics";
import type { EventoDaAgenda } from "@/modules/agenda/queries";
import { eventoEditadoSchema, eventoSchema, feedSchema, mudarStatusSchema } from "@/modules/agenda/schemas";
import { gerarToken, hashDoToken, tokenComFormatoValido } from "@/lib/tokens";

describe("tokens secretos", () => {
  it("gera tokens longos, diferentes a cada vez e aceitos pelo formato", () => {
    const a = gerarToken();
    const b = gerarToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(tokenComFormatoValido(a)).toBe(true);
  });

  it("o hash é estável, hexadecimal de 64 caracteres e nunca contém o token", () => {
    const t = gerarToken();
    expect(hashDoToken(t)).toBe(hashDoToken(t));
    expect(hashDoToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDoToken(t)).not.toContain(t);
    expect(hashDoToken(t)).not.toBe(hashDoToken(`${t}x`));
  });

  it("rejeita token malformado antes de qualquer consulta ao banco", () => {
    for (const ruim of ["", "curto", "tem espaço no meio do token aqui!!", "../../etc/passwd", "a".repeat(200), "'; DROP TABLE x;--"]) {
      expect(tokenComFormatoValido(ruim), ruim).toBe(false);
    }
  });

  it("recusa gerar token fraco", () => {
    expect(() => gerarToken(8)).toThrow();
  });
});

const base: EventoDaAgenda = {
  id: "ev1",
  tipo: "VISITA_TECNICA",
  titulo: null,
  inicio: "2026-11-13T12:00:00.000Z",
  fim: "2026-11-13T13:00:00.000Z",
  status: "AGENDADO",
  responsavelId: "u1",
  responsavelNome: "Marcelo",
  equipeId: null,
  equipeNome: null,
  clienteId: "c1",
  clienteNome: "Ana Souza",
  projetoId: "p1",
  projetoCodigo: "P-2026-0001",
  projetoTitulo: "Casa Búzios",
  enderecoId: null,
  local: "Rua A, 10 — Centro, Búzios/RJ",
  lembreteMin: 1440,
  observacoes: "Levar trena a laser.",
  realizadoEm: null,
  atualizadoEm: "2026-11-12T15:30:00.000Z",
};

describe("compromisso → iCalendar", () => {
  it("monta título, local e descrição úteis, sem telefone nem valores", () => {
    const e = eventoParaIcs(base);
    expect(e.titulo).toBe("Visita técnica — Ana Souza");
    expect(e.local).toBe("Rua A, 10 — Centro, Búzios/RJ");
    expect(e.descricao).toContain("Projeto: P-2026-0001 — Casa Búzios");
    expect(e.descricao).toContain("Responsável: Marcelo");
    expect(e.descricao).not.toMatch(/R\$|telefone|\+55|whatsapp/i);
    expect(e.uid).toBe("ev1@agenda.gestao");
    expect(e.alarmeMin).toBe(1440);
    expect(e.status).toBe("CONFIRMED");
  });

  it("título digitado vale mais que o automático; a versão cresce com a alteração", () => {
    expect(eventoParaIcs({ ...base, titulo: "Medir o vão da sacada" }).titulo).toBe("Medir o vão da sacada");
    const antiga = eventoParaIcs(base).sequencia!;
    const nova = eventoParaIcs({ ...base, atualizadoEm: "2026-11-12T15:31:00.000Z" }).sequencia!;
    expect(nova).toBeGreaterThan(antiga);
  });

  it("cancelado e 'não compareceu' saem como CANCELLED e sem alarme", () => {
    for (const status of ["CANCELADO", "NAO_COMPARECEU"] as const) {
      const e = eventoParaIcs({ ...base, status });
      expect(e.status).toBe("CANCELLED");
      expect(e.alarmeMin).toBeNull();
    }
  });

  it("o arquivo inteiro é válido e leva o nome do calendário", () => {
    const ics = calendarioDaAgenda([base], "Agenda — Pontual");
    expect(ics).toContain("X-WR-CALNAME:Agenda — Pontual");
    expect(ics).toContain("DTSTART:20261113T120000Z");
    expect(ics).toContain("TRIGGER:-PT1440M");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

const evento = { tipo: "VISITA_TECNICA", inicio: "2026-11-13T09:00", duracaoMin: "60" };

describe("formulário do compromisso", () => {
  it("aceita o mínimo e converte duração e lembrete em números", () => {
    const r = eventoSchema.safeParse({ ...evento, lembreteMin: "1440" });
    expect(r.success && r.data).toMatchObject({ tipo: "VISITA_TECNICA", inicio: "2026-11-13T09:00", duracaoMin: 60, lembreteMin: 1440 });
    const semLembrete = eventoSchema.safeParse({ ...evento, lembreteMin: "" });
    expect(semLembrete.success && semLembrete.data.lembreteMin).toBeUndefined();
  });

  it("valida tipo, data/hora e duração", () => {
    expect(eventoSchema.safeParse({ ...evento, tipo: "FESTA" }).success).toBe(false);
    expect(eventoSchema.safeParse({ ...evento, inicio: "13/11/2026 09:00" }).success).toBe(false);
    expect(eventoSchema.safeParse({ ...evento, inicio: "" }).success).toBe(false);
    expect(eventoSchema.safeParse({ ...evento, duracaoMin: "0" }).success).toBe(false);
    expect(eventoSchema.safeParse({ ...evento, duracaoMin: "1441" }).success).toBe(false);
    expect(eventoSchema.safeParse({ ...evento, duracaoMin: "abc" }).success).toBe(false);
    expect(eventoSchema.safeParse({ ...evento, lembreteMin: "2" }).success).toBe(false);
  });

  it("a edição exige o id e a mudança de situação só aceita as quatro opções", () => {
    expect(eventoEditadoSchema.safeParse(evento).success).toBe(false);
    expect(eventoEditadoSchema.safeParse({ ...evento, id: "e1" }).success).toBe(true);
    for (const status of ["CONFIRMADO", "REALIZADO", "CANCELADO", "NAO_COMPARECEU"]) expect(mudarStatusSchema.safeParse({ id: "e1", status }).success).toBe(true);
    for (const status of ["AGENDADO", "REMARCADO", "XYZ"]) expect(mudarStatusSchema.safeParse({ id: "e1", status }).success).toBe(false);
  });

  it("nome do link é opcional e limitado", () => {
    expect(feedSchema.safeParse({}).success).toBe(true);
    expect(feedSchema.safeParse({ nome: "Celular do Marcelo" }).success).toBe(true);
    expect(feedSchema.safeParse({ nome: "x".repeat(81) }).success).toBe(false);
  });
});
