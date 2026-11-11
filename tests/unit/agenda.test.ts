import { describe, expect, it } from "vitest";

import {
  avisosDoAgendamento,
  detectarConflitos,
  expedienteDoDia,
  foraDoExpediente,
  horarioDosMinutos,
  horariosLivres,
  limitesDoDia,
  minutosDoHorario,
  partesLocais,
  periodosQueCobrem,
  podeMudarSituacao,
  sobrepoe,
  vinculoExigido,
  type ConfigExpediente,
  type EventoOcupando,
} from "@/lib/dominio/agenda";
import { diasDaSemana, distribuirEmColunas, gradeDoMes, inicioDaSemana, mesVizinho, mesmoMes, somarDias } from "@/lib/dominio/calendario";
import { dataLocalDoInstante, inputDataHoraParaInstante, instanteDeDataHoraLocal, instanteParaInputDataHora } from "@/lib/formatadores";

const cfg: ConfigExpediente = { horarioSemanaInicio: "08:00", horarioSemanaFim: "18:00", horarioSabadoInicio: "08:00", horarioSabadoFim: "12:00" };

// 13/11/2026 é sexta-feira; São Paulo é UTC-3 (sem horário de verão).
const sexta = (hora: string) => instanteDeDataHoraLocal("2026-11-13", hora)!;
const intervalo = (ini: string, fim: string) => ({ inicio: sexta(ini), fim: sexta(fim) });

describe("fuso de São Paulo", () => {
  it("converte data e hora locais em instante UTC e de volta", () => {
    expect(sexta("08:00").toISOString()).toBe("2026-11-13T11:00:00.000Z");
    expect(inputDataHoraParaInstante("2026-11-13T08:00")?.toISOString()).toBe("2026-11-13T11:00:00.000Z");
    expect(instanteParaInputDataHora(sexta("08:00"))).toBe("2026-11-13T08:00");
    expect(instanteParaInputDataHora(null)).toBe("");
    expect(dataLocalDoInstante("2026-11-14T02:00:00Z")).toBe("2026-11-13");
  });

  it("recusa data ou hora inexistente", () => {
    expect(instanteDeDataHoraLocal("2026-02-31", "08:00")).toBeNull();
    expect(instanteDeDataHoraLocal("2026-11-13", "25:00")).toBeNull();
    expect(instanteDeDataHoraLocal("13/11/2026", "08:00")).toBeNull();
    expect(inputDataHoraParaInstante("2026-11-13 08:00")).toBeNull();
  });

  it("partes locais: meia-noite local não vira o dia anterior", () => {
    expect(partesLocais(new Date("2026-11-13T03:00:00Z"))).toEqual({ data: "2026-11-13", minutos: 0, diaSemana: 5 });
    expect(partesLocais(new Date("2026-11-15T15:00:00Z")).diaSemana).toBe(0); // domingo
  });
});

describe("expediente", () => {
  it("lê horários e recusa texto fora do padrão", () => {
    expect(minutosDoHorario("08:00")).toBe(480);
    expect(minutosDoHorario("17:45")).toBe(1065);
    expect(minutosDoHorario("8:00")).toBeNull();
    expect(minutosDoHorario("24:00")).toBeNull();
    expect(minutosDoHorario("")).toBeNull();
    expect(minutosDoHorario(null)).toBeNull();
    expect(horarioDosMinutos(1065)).toBe("17:45");
  });

  it("domingo nunca tem expediente; sábado usa o horário próprio", () => {
    expect(expedienteDoDia(0, cfg)).toBeNull();
    expect(expedienteDoDia(3, cfg)).toEqual({ inicioMin: 480, fimMin: 1080 });
    expect(expedienteDoDia(6, cfg)).toEqual({ inicioMin: 480, fimMin: 720 });
    expect(expedienteDoDia(6, { ...cfg, horarioSabadoInicio: null })).toBeNull();
    expect(expedienteDoDia(2, { ...cfg, horarioSemanaInicio: "18:00", horarioSemanaFim: "08:00" })).toBeNull();
  });

  it("detecta horário fora do expediente, domingo e virada de dia", () => {
    expect(foraDoExpediente(intervalo("08:00", "09:00"), cfg)).toBe(false);
    expect(foraDoExpediente(intervalo("17:00", "18:00"), cfg)).toBe(false);
    expect(foraDoExpediente(intervalo("07:30", "08:30"), cfg)).toBe(true);
    expect(foraDoExpediente(intervalo("17:30", "18:30"), cfg)).toBe(true);
    const domingo = { inicio: instanteDeDataHoraLocal("2026-11-15", "10:00")!, fim: instanteDeDataHoraLocal("2026-11-15", "11:00")! };
    expect(foraDoExpediente(domingo, cfg)).toBe(true);
    const sabado = (ini: string, fim: string) => ({ inicio: instanteDeDataHoraLocal("2026-11-14", ini)!, fim: instanteDeDataHoraLocal("2026-11-14", fim)! });
    expect(foraDoExpediente(sabado("08:00", "09:00"), cfg)).toBe(false);
    expect(foraDoExpediente(sabado("11:30", "12:30"), cfg)).toBe(true);
    expect(foraDoExpediente({ inicio: sexta("23:00"), fim: instanteDeDataHoraLocal("2026-11-14", "01:00")! }, cfg)).toBe(true);
  });
});

describe("conflitos de horário (alerta, não bloqueio)", () => {
  const existente = (over: Partial<EventoOcupando> = {}): EventoOcupando => ({
    id: "e1",
    ...intervalo("09:00", "10:00"),
    responsavelId: "u1",
    equipeId: null,
    status: "AGENDADO",
    ...over,
  });

  it("encostar não é sobrepor", () => {
    expect(sobrepoe(intervalo("08:00", "09:00"), intervalo("09:00", "10:00"))).toBe(false);
    expect(sobrepoe(intervalo("08:00", "09:01"), intervalo("09:00", "10:00"))).toBe(true);
    expect(sobrepoe(intervalo("09:15", "09:45"), intervalo("09:00", "10:00"))).toBe(true); // contido
  });

  it("mesmo responsável com horário sobreposto conflita", () => {
    expect(detectarConflitos({ ...intervalo("09:30", "10:30"), responsavelId: "u1" }, [existente()])).toHaveLength(1);
  });

  it("outro responsável, ou horário que só encosta, não conflita", () => {
    expect(detectarConflitos({ ...intervalo("09:30", "10:30"), responsavelId: "u2" }, [existente()])).toHaveLength(0);
    expect(detectarConflitos({ ...intervalo("10:00", "11:00"), responsavelId: "u1" }, [existente()])).toHaveLength(0);
  });

  it("a mesma equipe conflita mesmo sem responsável", () => {
    const e = existente({ responsavelId: null, equipeId: "eq1" });
    expect(detectarConflitos({ ...intervalo("09:00", "10:00"), equipeId: "eq1" }, [e])).toHaveLength(1);
    expect(detectarConflitos({ ...intervalo("09:00", "10:00"), equipeId: "eq2" }, [e])).toHaveLength(0);
  });

  it("sem responsável nem equipe no novo evento, nada conflita", () => {
    expect(detectarConflitos(intervalo("09:00", "10:00"), [existente()])).toHaveLength(0);
  });

  it("cancelado e não compareceu liberam o horário; realizado e remarcado continuam ocupando", () => {
    const novo = { ...intervalo("09:00", "10:00"), responsavelId: "u1" };
    expect(detectarConflitos(novo, [existente({ status: "CANCELADO" })])).toHaveLength(0);
    expect(detectarConflitos(novo, [existente({ status: "NAO_COMPARECEU" })])).toHaveLength(0);
    expect(detectarConflitos(novo, [existente({ status: "REALIZADO" })])).toHaveLength(1);
    expect(detectarConflitos(novo, [existente({ status: "REMARCADO" })])).toHaveLength(1);
  });

  it("ao remarcar, o próprio evento não conflita consigo", () => {
    expect(detectarConflitos({ id: "e1", ...intervalo("09:00", "10:00"), responsavelId: "u1" }, [existente()])).toHaveLength(0);
  });
});

describe("horários livres", () => {
  const rotulos = (datas: Date[]) => datas.map((d) => horarioDosMinutos(partesLocais(d).minutos));

  it("lista os inícios possíveis, pulando o que encosta em evento ocupado", () => {
    const livres = rotulos(horariosLivres({ data: "2026-11-13", duracaoMin: 60, cfg, ocupados: [intervalo("09:00", "10:00")] }));
    expect(livres).toContain("08:00"); // termina às 09:00, só encosta
    expect(livres).not.toContain("08:30");
    expect(livres).not.toContain("09:00");
    expect(livres).not.toContain("09:30");
    expect(livres).toContain("10:00");
    expect(livres.at(-1)).toBe("17:00"); // 17:00–18:00 cabe; 17:30 estouraria o expediente
    expect(livres).toHaveLength(16);
  });

  it("não oferece horários que já passaram", () => {
    const livres = rotulos(horariosLivres({ data: "2026-11-13", duracaoMin: 60, cfg, ocupados: [], agora: sexta("10:00") }));
    expect(livres[0]).toBe("10:00");
    expect(livres).toHaveLength(15);
  });

  it("domingo, expediente vazio e duração inválida não têm horários", () => {
    expect(horariosLivres({ data: "2026-11-15", duracaoMin: 60, cfg, ocupados: [] })).toEqual([]);
    expect(horariosLivres({ data: "2026-11-13", duracaoMin: 60, cfg: { ...cfg, horarioSemanaInicio: null }, ocupados: [] })).toEqual([]);
    expect(horariosLivres({ data: "2026-11-13", duracaoMin: 0, cfg, ocupados: [] })).toEqual([]);
    expect(horariosLivres({ data: "2026-13-45", duracaoMin: 60, cfg, ocupados: [] })).toEqual([]);
  });

  it("no sábado respeita o expediente curto", () => {
    const livres = rotulos(horariosLivres({ data: "2026-11-14", duracaoMin: 60, cfg, ocupados: [] }));
    expect(livres[0]).toBe("08:00");
    expect(livres.at(-1)).toBe("11:00");
  });

  it("limites do dia local em UTC", () => {
    const l = limitesDoDia("2026-11-13");
    expect(l.inicio.toISOString()).toBe("2026-11-13T03:00:00.000Z");
    expect(l.fim.toISOString()).toBe("2026-11-14T03:00:00.000Z");
  });
});

describe("vínculo e situação do compromisso", () => {
  it("o que é do ciclo da obra exige projeto; assistência, cliente ou projeto; reunião, nada", () => {
    for (const t of ["VISITA_TECNICA", "MEDICAO_EXATA", "MEDICAO_VIDROS", "INSTALACAO", "ENTREGA"] as const) expect(vinculoExigido(t)).toBe("projeto");
    expect(vinculoExigido("ASSISTENCIA")).toBe("cliente_ou_projeto");
    expect(vinculoExigido("REUNIAO")).toBe("nenhum");
  });

  it("só compromisso em aberto muda de situação, e nunca volta a 'agendado' ou 'remarcado' por esse caminho", () => {
    expect(podeMudarSituacao("AGENDADO", "CONFIRMADO")).toBe(true);
    expect(podeMudarSituacao("CONFIRMADO", "REALIZADO")).toBe(true);
    expect(podeMudarSituacao("REMARCADO", "CANCELADO")).toBe(true);
    expect(podeMudarSituacao("AGENDADO", "NAO_COMPARECEU")).toBe(true);
    expect(podeMudarSituacao("AGENDADO", "AGENDADO")).toBe(false);
    expect(podeMudarSituacao("CONFIRMADO", "CONFIRMADO")).toBe(false);
    expect(podeMudarSituacao("CONFIRMADO", "AGENDADO")).toBe(false);
    expect(podeMudarSituacao("AGENDADO", "REMARCADO")).toBe(false);
    for (const encerrado of ["REALIZADO", "CANCELADO", "NAO_COMPARECEU"] as const) expect(podeMudarSituacao(encerrado, "CONFIRMADO")).toBe(false);
  });
});

describe("avisos de calendário", () => {
  const periodos = [
    { data: new Date("2026-11-20T00:00:00Z"), dataFim: null, tipo: "FERIADO" as const, nome: "Consciência Negra" },
    { data: new Date("2026-12-21T00:00:00Z"), dataFim: new Date("2027-01-04T00:00:00Z"), tipo: "FERIAS_COLETIVA_FORNECEDORES" as const, nome: "Férias de fim de ano" },
  ];

  it("períodos cobrem o dia inclusive nas pontas (data e dataFim)", () => {
    expect(periodosQueCobrem("2026-11-20", periodos)).toHaveLength(1);
    expect(periodosQueCobrem("2026-11-21", periodos)).toHaveLength(0);
    expect(periodosQueCobrem("2026-12-21", periodos)).toHaveLength(1);
    expect(periodosQueCobrem("2027-01-04", periodos)).toHaveLength(1);
    expect(periodosQueCobrem("2027-01-05", periodos)).toHaveLength(0);
  });

  it("avisa feriado, férias coletivas e fora do expediente", () => {
    const feriado = { inicio: instanteDeDataHoraLocal("2026-11-20", "09:00")!, fim: instanteDeDataHoraLocal("2026-11-20", "10:00")! };
    expect(avisosDoAgendamento(feriado, cfg, periodos)).toEqual(["Feriado: Consciência Negra."]);
    const ferias = { inicio: instanteDeDataHoraLocal("2026-12-28", "07:00")!, fim: instanteDeDataHoraLocal("2026-12-28", "08:00")! };
    const avisos = avisosDoAgendamento(ferias, cfg, periodos);
    expect(avisos).toHaveLength(2);
    expect(avisos[0]).toMatch(/fora do expediente/);
    expect(avisos[1]).toMatch(/Férias coletivas/);
  });

  it("dia comum no expediente: nenhum aviso", () => {
    expect(avisosDoAgendamento(intervalo("09:00", "10:00"), cfg, periodos)).toEqual([]);
  });
});

describe("grade de semana: compromissos sobrepostos", () => {
  const item = (id: string, inicioMin: number, fimMin: number) => ({ id, inicioMin, fimMin });
  const por = (r: ReturnType<typeof distribuirEmColunas<ReturnType<typeof item>>>, id: string) => r.find((x) => x.id === id)!;

  it("compromissos separados ficam sozinhos, em uma coluna", () => {
    const r = distribuirEmColunas([item("a", 480, 540), item("b", 540, 600), item("c", 700, 760)]);
    expect(r.every((x) => x.coluna === 0 && x.colunas === 1)).toBe(true);
  });

  it("dois que se cruzam dividem a largura em duas colunas", () => {
    const r = distribuirEmColunas([item("a", 480, 600), item("b", 540, 660)]);
    expect(por(r, "a")).toMatchObject({ coluna: 0, colunas: 2 });
    expect(por(r, "b")).toMatchObject({ coluna: 1, colunas: 2 });
  });

  it("reaproveita a coluna livre e não afeta o grupo seguinte", () => {
    const r = distribuirEmColunas([item("a", 480, 600), item("b", 500, 560), item("c", 570, 620), item("d", 700, 760)]);
    expect(por(r, "a")).toMatchObject({ coluna: 0, colunas: 2 });
    expect(por(r, "b")).toMatchObject({ coluna: 1, colunas: 2 });
    expect(por(r, "c")).toMatchObject({ coluna: 1, colunas: 2 }); // reaproveita a coluna 1, que já terminou
    expect(por(r, "d")).toMatchObject({ coluna: 0, colunas: 1 });
  });

  it("lista vazia e itens fora de ordem funcionam", () => {
    expect(distribuirEmColunas([])).toEqual([]);
    const r = distribuirEmColunas([item("b", 540, 660), item("a", 480, 600)]);
    expect(por(r, "a").coluna).toBe(0);
  });
});

describe("calendário", () => {
  it("monta a grade do mês em semanas de domingo a sábado", () => {
    const grade = gradeDoMes("2026-11-13"); // 1/11/2026 é domingo; 30/11 é segunda
    expect(grade).toHaveLength(5);
    expect(grade[0][0]).toBe("2026-11-01");
    expect(grade[4][0]).toBe("2026-11-29");
    expect(grade[4][6]).toBe("2026-12-05");
    expect(grade.every((s) => s.length === 7)).toBe(true);
  });

  it("fevereiro que começa no domingo cabe em 4 linhas", () => {
    expect(gradeDoMes("2026-02-10")).toHaveLength(4);
  });

  it("semana, soma de dias e meses vizinhos", () => {
    expect(inicioDaSemana("2026-11-13")).toBe("2026-11-08");
    expect(diasDaSemana("2026-11-13")[6]).toBe("2026-11-14");
    expect(somarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(mesVizinho("2026-11-13", 1)).toBe("2026-12-01");
    expect(mesVizinho("2026-01-15", -1)).toBe("2025-12-01");
    expect(mesmoMes("2026-11-01", "2026-11-30")).toBe(true);
    expect(mesmoMes("2026-11-30", "2026-12-01")).toBe(false);
  });

  it("recusa data inválida", () => {
    expect(() => somarDias("2026-02-30", 1)).toThrow();
    expect(() => gradeDoMes("lixo")).toThrow();
  });
});
