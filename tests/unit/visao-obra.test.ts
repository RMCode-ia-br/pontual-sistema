import { describe, expect, it } from "vitest";

import { datasDeFeriado } from "../../src/lib/dominio/dias-uteis";
import { somarDiasUteis } from "../../src/lib/dominio/dias-uteis";
import { avisosDaObra, visaoDoPrazo, type EntradaDaVisao } from "../../src/modules/obras/visao";

const projetoBase: EntradaDaVisao["projeto"] = {
  status: "EM_EXECUCAO",
  prazoModo: "TOTAL",
  prazoDias: 10,
  prazoMaterialDias: null,
  prazoExecucaoDias: null,
  prazoVidrosDias: null,
  tipoDiasPrazo: "UTEIS",
  dataInicioPrazo: "2026-06-01",
  dataConclusao: null,
};

type Parte = Omit<Partial<EntradaDaVisao>, "projeto"> & { projeto?: Partial<EntradaDaVisao["projeto"]> };

const entrada = (parte: Parte = {}): EntradaDaVisao => ({
  etapas: [],
  pausas: [],
  periodos: [{ data: "2026-04-03", tipo: "FERIADO" }],
  hoje: "2026-06-05",
  diasAlerta: 3,
  ...parte,
  projeto: { ...projetoBase, ...parte.projeto },
});

describe("visão do prazo da obra", () => {
  it("sem prazo: nada é calculado e o aviso pede para definir", () => {
    const v = visaoDoPrazo(entrada({ projeto: { prazoModo: "NENHUM", prazoDias: null, dataInicioPrazo: null } }));
    expect(v).toMatchObject({ definido: false, comPausas: null, diasRestantes: null, semaforo: null, previsaoProvisoria: null });
    expect(avisosDaObra({ prazo: v, etapas: [], periodos: [], condominio: null, concluida: false })[0]).toContain("Defina o prazo da obra");
  });

  it("antes do relógio: só a previsão provisória (a maior data prevista), que não é promessa", () => {
    const v = visaoDoPrazo(
      entrada({
        projeto: { dataInicioPrazo: null },
        etapas: [
          { status: "PENDENTE", fimPrevisto: "2026-06-10" },
          { status: "PENDENTE", fimPrevisto: "2026-06-17" },
          { status: "DISPENSADA", fimPrevisto: "2026-07-30" },
          { status: "PENDENTE", fimPrevisto: null },
        ],
      }),
    );
    expect(v).toMatchObject({ definido: true, relogioIniciado: false, previsaoProvisoria: "2026-06-17", comPausas: null, semaforo: null });
    expect(avisosDaObra({ prazo: v, etapas: [], periodos: [{ data: "2026-04-03", tipo: "FERIADO" }, { data: "2026-12-25", tipo: "FERIADO" }], condominio: null, concluida: false })[0]).toContain("provisórias");
  });

  it("com o relógio iniciado: prazo prometido, dias restantes e semáforo", () => {
    // 10 dias úteis depois de segunda 01/06: terça 02 é o 1º, sexta 12 é o 9º e segunda 15 é o 10º.
    const em = (hoje: string) => visaoDoPrazo(entrada({ hoje }));
    expect(em("2026-06-05")).toMatchObject({ semPausas: "2026-06-15", comPausas: "2026-06-15", diasRestantes: 6, semaforo: "VERDE", relogioIniciado: true });
    expect(em("2026-06-12")).toMatchObject({ diasRestantes: 1, semaforo: "AMARELO" }); // faltam 3 dias corridos (o alerta é em dias corridos)
    expect(em("2026-06-15")).toMatchObject({ diasRestantes: 0, semaforo: "AMARELO" }); // no dia do prazo ainda não está atrasada
    expect(em("2026-06-16")).toMatchObject({ diasRestantes: -1, semaforo: "VERMELHO" });
  });

  it("pausa justificada em curso empurra o prazo (conta até hoje) e aparece separada", () => {
    const v = visaoDoPrazo(entrada({ hoje: "2026-06-05", pausas: [{ inicio: "2026-06-03", fim: null, justificada: true }] }));
    expect(v.diasPausaJustificada).toBe(3); // quarta, quinta e sexta
    expect(v.semPausas).toBe("2026-06-15");
    expect(v.comPausas).toBe("2026-06-18"); // 13 dias úteis depois de 01/06
    expect(v.comPausas).toBe(somarDiasUteis("2026-06-01", 13, datasDeFeriado([])));
  });

  it("obra concluída: sem semáforo, com o veredito de pontualidade (com e sem pausas)", () => {
    const v = visaoDoPrazo(
      entrada({
        hoje: "2026-06-30",
        projeto: { status: "CONCLUIDO", dataConclusao: "2026-06-17" },
        pausas: [{ inicio: "2026-06-03", fim: "2026-06-05", justificada: true }],
      }),
    );
    // Sem pausas o prazo era 15/06; com 3 dias de pausa foi a 18/06; concluída em 17/06.
    expect(v).toMatchObject({ semaforo: null, diasRestantes: null, comPausas: "2026-06-18", semPausas: "2026-06-15" });
    expect(v.pontualidade).toMatchObject({ avaliavel: true, pontual: true, pontualSemPausas: false });
  });
});

describe("avisos da obra", () => {
  const prazoIniciado = visaoDoPrazo(entrada());
  const base = { prazo: prazoIniciado, etapas: [], periodos: [{ data: "2026-06-01", tipo: "FERIADO" as const }], condominio: null, concluida: false };

  it("sem nenhum aviso quando está tudo em ordem", () => {
    expect(avisosDaObra(base)).toEqual([]);
  });

  it("avisa quando o ano do prazo não tem feriados cadastrados (só em dias úteis)", () => {
    const sem = avisosDaObra({ ...base, periodos: [] });
    expect(sem[0]).toContain("Não há feriados cadastrados em 2026");
    const corridos = visaoDoPrazo(entrada({ projeto: { tipoDiasPrazo: "CORRIDOS" } }));
    expect(avisosDaObra({ ...base, prazo: corridos, periodos: [] })).toEqual([]);
  });

  it("avisa quando férias coletivas dos fornecedores caem sobre pedido ou fabricação aberta", () => {
    const periodos = [
      { data: "2026-06-01", tipo: "FERIADO" as const },
      { data: "2026-06-08", dataFim: "2026-06-10", tipo: "FERIAS_COLETIVA_FORNECEDORES" as const },
    ];
    const etapas = [
      { nome: "Pedido de material", tipo: "PEDIDO_MATERIAL", status: "PENDENTE" as const, inicioPrevisto: "2026-06-09", fimPrevisto: "2026-06-11" },
      { nome: "Instalação das esquadrias", tipo: "INSTALACAO_ESQUADRIAS", status: "PENDENTE" as const, inicioPrevisto: "2026-06-09", fimPrevisto: "2026-06-11" },
      { nome: "Fabricação", tipo: "FABRICACAO", status: "CONCLUIDA" as const, inicioPrevisto: "2026-06-09", fimPrevisto: "2026-06-11" },
      { nome: "Pedido dos vidros", tipo: "PEDIDO_VIDROS", status: "PENDENTE" as const, inicioPrevisto: "2026-06-15", fimPrevisto: "2026-06-16" },
    ];
    const avisos = avisosDaObra({ ...base, periodos, etapas });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('"Pedido de material"');
    expect(avisos[0]).toContain("08/06/2026 a 10/06/2026");
  });

  it("avisa do condomínio que ainda não aprovou a fachada", () => {
    const pendente = avisosDaObra({ ...base, condominio: { nome: "Edifício Mar", exigeAprovacaoFachada: true, fachadaAprovada: false } });
    expect(pendente[0]).toContain("Edifício Mar");
    expect(avisosDaObra({ ...base, condominio: { nome: "Edifício Mar", exigeAprovacaoFachada: true, fachadaAprovada: true } })).toEqual([]);
    expect(avisosDaObra({ ...base, condominio: { nome: null, exigeAprovacaoFachada: false, fachadaAprovada: false } })).toEqual([]);
  });

  it("obra concluída não tem avisos", () => {
    expect(avisosDaObra({ ...base, periodos: [], concluida: true })).toEqual([]);
  });
});
