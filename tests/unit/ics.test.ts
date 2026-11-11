import { describe, expect, it } from "vitest";

import { dataHoraIcs, dobrarLinhaIcs, escaparTextoIcs, gerarCalendarioIcs, type EventoIcs } from "@/lib/ics";

const evento = (over: Partial<EventoIcs> = {}): EventoIcs => ({
  uid: "evento-1@pontual.exemplo",
  inicio: new Date("2026-11-13T11:00:00Z"),
  fim: new Date("2026-11-13T12:00:00Z"),
  titulo: "Visita técnica",
  ...over,
});

const gerar = (eventos: EventoIcs[]) => gerarCalendarioIcs({ idProduto: "-//Teste//Agenda//PT", nome: "Agenda", eventos, geradoEm: new Date("2026-11-13T00:00:00Z") });

describe("iCalendar", () => {
  it("formata instantes em UTC", () => {
    expect(dataHoraIcs(new Date("2026-11-13T12:30:00.000Z"))).toBe("20261113T123000Z");
    expect(() => dataHoraIcs(new Date("invalido"))).toThrow();
  });

  it("escapa barra, ponto e vírgula, vírgula e quebras de linha", () => {
    expect(escaparTextoIcs("a,b;c\\d\ne\r\nf")).toBe("a\\,b\\;c\\\\d\\ne\\nf");
  });

  it("dobra linhas longas em 75 octetos e o resultado desdobrado é o original", () => {
    const longa = `DESCRIPTION:${"x".repeat(300)}`;
    const partes = dobrarLinhaIcs(longa);
    expect(partes.length).toBeGreaterThan(1);
    for (const p of partes) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    for (const p of partes.slice(1)) expect(p.startsWith(" ")).toBe(true);
    expect(partes.map((p, i) => (i === 0 ? p : p.slice(1))).join("")).toBe(longa);
  });

  it("nunca parte um caractere acentuado ao dobrar", () => {
    const longa = `SUMMARY:${"ação ".repeat(60)}`;
    const partes = dobrarLinhaIcs(longa);
    const desdobrada = partes.map((p, i) => (i === 0 ? p : p.slice(1))).join("");
    expect(desdobrada).toBe(longa);
    for (const p of partes) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
  });

  it("linha curta fica como está", () => {
    expect(dobrarLinhaIcs("SUMMARY:Visita")).toEqual(["SUMMARY:Visita"]);
  });

  it("gera um calendário válido, com CRLF em todas as linhas", () => {
    const ics = gerar([evento({ descricao: "Cliente: Ana, obra\nPortão", local: "Rua A, 10", alarmeMin: 1440, sequencia: 2 })]);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(ics).toContain("UID:evento-1@pontual.exemplo");
    expect(ics).toContain("DTSTART:20261113T110000Z");
    expect(ics).toContain("DTEND:20261113T120000Z");
    expect(ics).toContain("DESCRIPTION:Cliente: Ana\\, obra\\nPortão");
    expect(ics).toContain("LOCATION:Rua A\\, 10");
    expect(ics).toContain("SEQUENCE:2");
    expect(ics).toContain("TRIGGER:-PT1440M");
    expect(ics).toContain("STATUS:CONFIRMED");
  });

  it("evento cancelado sai como CANCELLED e sem alarme quando não pedido", () => {
    const ics = gerar([evento({ status: "CANCELLED" })]);
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).not.toContain("VALARM");
  });

  it("ignora evento com fim antes do início e remove caracteres de controle", () => {
    const ics = gerar([evento({ fim: new Date("2026-11-13T10:00:00Z") }), evento({ uid: "ok", titulo: "A\u0000B\u0007C" })]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("SUMMARY:ABC");
  });

  it("calendário vazio continua válido", () => {
    const ics = gerar([]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toContain("VEVENT");
  });

  it("injeção de linha no título não cria propriedades novas", () => {
    const ics = gerar([evento({ titulo: "Visita\r\nATTENDEE:mailto:x@y.z" })]);
    expect(ics).not.toMatch(/^ATTENDEE:/m);
    expect(ics).toContain("SUMMARY:Visita\\nATTENDEE:mailto:x@y.z");
  });
});
