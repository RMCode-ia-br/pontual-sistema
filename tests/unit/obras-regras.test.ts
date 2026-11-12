import { describe, expect, it } from "vitest";

import { MODELO_PADRAO_DE_ETAPAS } from "../../prisma/seed-obras";
import { datasDeFeriado } from "../../src/lib/dominio/dias-uteis";
import {
  entregaConcluida,
  etapaAtual,
  etapasDoModelo,
  statusDoProjetoPelasEtapas,
  transicaoPermitida,
  type ItemDoModelo,
} from "../../src/lib/dominio/etapas";
import { classificarChamado } from "../../src/lib/dominio/garantia";
import { avaliarPontualidade, resumirPontualidade, type ObraConcluida } from "../../src/lib/dominio/pontualidade";
import type { StatusDeEtapa } from "../../src/lib/dominio/prazo-obra";
import { etapaAtrasada, pior, semaforoDaData, semaforoDaEtapa, semaforoDaObra } from "../../src/lib/dominio/semaforo";

const NENHUM = new Set<string>();

describe("semáforo de prazo", () => {
  const hoje = "2026-05-12";
  it("atrasada (vermelho) quando hoje passou da data prevista", () => {
    expect(semaforoDaData("2026-05-10", hoje, 3)).toBe("VERMELHO");
    expect(semaforoDaData("2026-05-11", hoje, 3)).toBe("VERMELHO");
  });
  it("no próprio dia previsto ainda NÃO está atrasada (amarelo)", () => {
    expect(semaforoDaData("2026-05-12", hoje, 3)).toBe("AMARELO");
  });
  it("amarelo quando vence em até 3 dias; verde a partir do 4º", () => {
    expect(semaforoDaData("2026-05-15", hoje, 3)).toBe("AMARELO");
    expect(semaforoDaData("2026-05-16", hoje, 3)).toBe("VERDE");
  });
  it("o limite do amarelo é configurável", () => {
    expect(semaforoDaData("2026-05-16", hoje, 5)).toBe("AMARELO");
    expect(semaforoDaData("2026-05-13", hoje, 0)).toBe("VERDE");
  });
  it("sem data prevista não há semáforo", () => {
    expect(semaforoDaData(null, hoje, 3)).toBeNull();
  });
  it("etapa concluída ou dispensada nunca atrasa, mesmo com a data vencida", () => {
    for (const status of ["CONCLUIDA", "DISPENSADA"] as StatusDeEtapa[]) {
      expect(semaforoDaEtapa({ status, fimPrevisto: "2026-05-01" }, hoje, 3), status).toBeNull();
      expect(etapaAtrasada({ status, fimPrevisto: "2026-05-01" }, hoje), status).toBe(false);
    }
  });
  it("etapa bloqueada ou em andamento com data vencida está atrasada", () => {
    expect(etapaAtrasada({ status: "BLOQUEADA", fimPrevisto: "2026-05-01" }, hoje)).toBe(true);
    expect(etapaAtrasada({ status: "EM_ANDAMENTO", fimPrevisto: "2026-05-12" }, hoje)).toBe(false);
  });
  it("pior cor entre as etapas e o prazo final; obra concluída não tem semáforo", () => {
    const etapas = [
      { status: "CONCLUIDA" as const, fimPrevisto: "2026-04-01" },
      { status: "EM_ANDAMENTO" as const, fimPrevisto: "2026-05-30" },
      { status: "PENDENTE" as const, fimPrevisto: "2026-05-14" },
    ];
    expect(semaforoDaObra(etapas, "2026-06-30", false, hoje, 3)).toBe("AMARELO");
    expect(semaforoDaObra(etapas, "2026-05-01", false, hoje, 3)).toBe("VERMELHO"); // prazo final estourado
    expect(semaforoDaObra(etapas, "2026-05-01", true, hoje, 3)).toBeNull();
    expect(semaforoDaObra([], null, false, hoje, 3)).toBeNull();
  });
  it("pior() ignora nulos", () => {
    expect(pior([null, "VERDE", null])).toBe("VERDE");
    expect(pior([null, null])).toBeNull();
    expect(pior(["VERDE", "VERMELHO", "AMARELO"])).toBe("VERMELHO");
  });
});

describe("pontualidade (R8), exemplos conferidos à mão", () => {
  // Maio de 2026: 13 quarta, 14 quinta, 15 sexta, 18 segunda, 19 terça, 20 quarta. Dias úteis, sem feriado.
  const obra = (concluidaEm: string, prazoFinalPrometido: string | null, prazoFinalSemPausas: string | null): ObraConcluida => ({
    concluidaEm,
    prazoFinalPrometido,
    prazoFinalSemPausas,
    tipoDias: "UTEIS",
  });

  it("uma obra: pontual se concluída até o prazo (inclusive no próprio dia); desvio em dias úteis", () => {
    expect(avaliarPontualidade(obra("2026-05-14", "2026-05-15", "2026-05-15"), NENHUM)).toEqual({
      avaliavel: true,
      pontual: true,
      desvioDias: -1,
      pontualSemPausas: true,
      desvioSemPausasDias: -1,
    });
    expect(avaliarPontualidade(obra("2026-05-15", "2026-05-15", "2026-05-15"), NENHUM)).toMatchObject({ pontual: true, desvioDias: 0 });
  });

  it("atraso de segunda a sexta: 1 dia útil (o fim de semana não conta)", () => {
    expect(avaliarPontualidade(obra("2026-05-18", "2026-05-15", "2026-05-15"), NENHUM)).toMatchObject({ pontual: false, desvioDias: 1 });
  });

  it("a pausa justificada muda o veredito: pontual COM pausas, atrasada SEM", () => {
    // Prazo sem pausas 15/05; as pausas levaram o prometido a 20/05; concluída em 18/05.
    expect(avaliarPontualidade(obra("2026-05-18", "2026-05-20", "2026-05-15"), NENHUM)).toEqual({
      avaliavel: true,
      pontual: true,
      desvioDias: -2,
      pontualSemPausas: false,
      desvioSemPausasDias: 1,
    });
  });

  it("sem prazo prometido não dá para avaliar", () => {
    expect(avaliarPontualidade(obra("2026-05-18", null, null), NENHUM)).toEqual({ avaliavel: false });
  });

  it("em dias corridos o desvio conta o fim de semana", () => {
    const corridos: ObraConcluida = { ...obra("2026-05-18", "2026-05-15", "2026-05-15"), tipoDias: "CORRIDOS" };
    expect(avaliarPontualidade(corridos, NENHUM)).toMatchObject({ desvioDias: 3 });
  });

  it("feriado entre as datas não conta no desvio em dias úteis", () => {
    const feriados = datasDeFeriado([{ data: "2026-05-18", tipo: "FERIADO" }]);
    expect(avaliarPontualidade(obra("2026-05-19", "2026-05-15", "2026-05-15"), feriados)).toMatchObject({ desvioDias: 1 });
  });

  describe("período com 5 obras concluídas", () => {
    const avaliacoes = [
      obra("2026-05-14", "2026-05-15", "2026-05-15"), // A: -1 / -1, pontual nas duas
      obra("2026-05-18", "2026-05-15", "2026-05-13"), // B: +1 / +3, atrasada nas duas
      obra("2026-05-15", "2026-05-15", "2026-05-15"), // C: 0 / 0, pontual nas duas
      obra("2026-05-18", "2026-05-20", "2026-05-15"), // D: -2 / +1, pontual só com pausas
      obra("2026-05-18", "2026-05-15", "2026-05-15"), // E: +1 / +1, atrasada nas duas
    ].map((o) => avaliarPontualidade(o, NENHUM));

    it("pontualidade com pausas: 3 de 5 = 60,0%; sem pausas: 2 de 5 = 40,0%", () => {
      const r = resumirPontualidade(avaliacoes);
      expect(r).toMatchObject({ concluidas: 5, semPrazo: 0, pontuais: 3, pontualidadePct: 60, pontuaisSemPausas: 2, pontualidadeSemPausasPct: 40 });
    });

    it("desvio médio: (-1+1+0-2+1)/5 = -0,2 com pausas; (-1+3+0+1+1)/5 = 0,8 sem pausas", () => {
      const r = resumirPontualidade(avaliacoes);
      expect(r.desvioMedioDias).toBe(-0.2);
      expect(r.desvioMedioSemPausasDias).toBe(0.8);
    });
  });

  it("obras sem prazo ficam fora da porcentagem, mas são contadas à parte", () => {
    const r = resumirPontualidade([
      avaliarPontualidade(obra("2026-05-14", "2026-05-15", "2026-05-15"), NENHUM),
      avaliarPontualidade(obra("2026-05-14", null, null), NENHUM),
    ]);
    expect(r).toMatchObject({ concluidas: 1, semPrazo: 1, pontuais: 1, pontualidadePct: 100 });
  });

  it("sem nenhuma obra avaliável não há porcentagem (null, nunca 0%)", () => {
    expect(resumirPontualidade([])).toMatchObject({ concluidas: 0, pontualidadePct: null, desvioMedioDias: null, desvioMedioSemPausasDias: null });
  });

  it("arredonda a uma casa decimal, com 1 de 3 = 33,3%", () => {
    const tres = [
      obra("2026-05-14", "2026-05-15", "2026-05-15"),
      obra("2026-05-18", "2026-05-15", "2026-05-15"),
      obra("2026-05-19", "2026-05-15", "2026-05-15"),
    ].map((o) => avaliarPontualidade(o, NENHUM));
    expect(resumirPontualidade(tres).pontualidadePct).toBe(33.3);
  });
});

describe("garantia e assistência (R12)", () => {
  // Instalação concluída em 02/03/2026; 90 dias de regulagem vão até 31/05/2026.
  const base = { temObra: true, marcoConcluidoEm: "2026-03-02", garantiaDias: 90 } as const;

  it("regulagem dentro dos 90 dias: em garantia, sem cobrar visita, explicando o prazo", () => {
    const r = classificarChamado({ ...base, tipoProblema: "REGULAGEM", abertoEm: "2026-04-15" });
    expect(r).toMatchObject({ classificacao: "EM_GARANTIA", cobrarVisita: false, garantiaAte: "2026-05-31" });
    expect(r.motivo).toContain("02/03/2026");
    expect(r.motivo).toContain("31/05/2026");
  });

  it("o último dia da garantia ainda vale; o dia seguinte já passou", () => {
    expect(classificarChamado({ ...base, tipoProblema: "REGULAGEM", abertoEm: "2026-05-31" }).classificacao).toBe("EM_GARANTIA");
    const fora = classificarChamado({ ...base, tipoProblema: "REGULAGEM", abertoEm: "2026-06-01" });
    expect(fora).toMatchObject({ classificacao: "FORA_DA_GARANTIA", cobrarVisita: true });
  });

  it("vidro: a garantia vale só até a instalação (depois dela, fora, mesmo dentro dos 90 dias)", () => {
    expect(classificarChamado({ ...base, tipoProblema: "VIDRO", abertoEm: "2026-03-02" }).classificacao).toBe("EM_GARANTIA");
    const depois = classificarChamado({ ...base, tipoProblema: "VIDRO", abertoEm: "2026-03-03" });
    expect(depois.classificacao).toBe("FORA_DA_GARANTIA");
    expect(depois.motivo).toContain("vidros");
  });

  it("outro tipo segue a janela da regulagem", () => {
    expect(classificarChamado({ ...base, tipoProblema: "OUTRO", abertoEm: "2026-04-01" }).classificacao).toBe("EM_GARANTIA");
    expect(classificarChamado({ ...base, tipoProblema: "OUTRO", abertoEm: "2026-07-01" }).classificacao).toBe("FORA_DA_GARANTIA");
  });

  it("a janela acompanha a configuração (garantiaRegulagemDias)", () => {
    const trinta = classificarChamado({ ...base, garantiaDias: 30, tipoProblema: "REGULAGEM", abertoEm: "2026-04-15" });
    expect(trinta).toMatchObject({ classificacao: "FORA_DA_GARANTIA", garantiaAte: "2026-04-01" });
  });

  it("sem obra ou com a instalação ainda não concluída: fora, para o gestor confirmar", () => {
    const semObra = classificarChamado({ ...base, temObra: false, marcoConcluidoEm: null, tipoProblema: "REGULAGEM", abertoEm: "2026-04-15" });
    expect(semObra).toMatchObject({ classificacao: "FORA_DA_GARANTIA", cobrarVisita: true, garantiaAte: null });
    const semMarco = classificarChamado({ ...base, marcoConcluidoEm: null, tipoProblema: "REGULAGEM", abertoEm: "2026-04-15" });
    expect(semMarco.classificacao).toBe("FORA_DA_GARANTIA");
    expect(semMarco.motivo).toContain("instalação");
  });
});

describe("etapas: geração a partir do modelo", () => {
  it("o modelo padrão tem as 9 etapas da R7, sem nenhuma duração", () => {
    expect(MODELO_PADRAO_DE_ETAPAS.map((i) => i.tipo)).toEqual([
      "MEDICAO_EXATA",
      "PEDIDO_MATERIAL",
      "FABRICACAO",
      "INSTALACAO_ESQUADRIAS",
      "MEDICAO_VIDROS",
      "PEDIDO_VIDROS",
      "INSTALACAO_VIDROS",
      "ACABAMENTO",
      "ENTREGA",
    ]);
    expect(MODELO_PADRAO_DE_ETAPAS.every((i) => !("dias" in i) && !("duracaoDias" in i))).toBe(true);
  });

  it("segue os grupos e o mapa gatilho → etapa da spec (R6/R7/R12)", () => {
    const porTipo = Object.fromEntries(MODELO_PADRAO_DE_ETAPAS.map((i) => [i.tipo, i]));
    expect(porTipo.MEDICAO_EXATA.grupoPrazo).toBeNull();
    expect(porTipo.PEDIDO_MATERIAL.grupoPrazo).toBe("MATERIAL");
    expect(porTipo.FABRICACAO.grupoPrazo).toBe("MATERIAL");
    expect(porTipo.INSTALACAO_ESQUADRIAS.grupoPrazo).toBe("EXECUCAO");
    for (const t of ["MEDICAO_VIDROS", "PEDIDO_VIDROS", "INSTALACAO_VIDROS", "ACABAMENTO", "ENTREGA"]) {
      expect(porTipo[t].grupoPrazo, t).toBe("VIDROS_FINALIZACAO");
    }
    expect(MODELO_PADRAO_DE_ETAPAS.filter((i) => i.liberaGatilho).map((i) => [i.tipo, i.liberaGatilho])).toEqual([
      ["FABRICACAO", "ENTREGA_MATERIAL"],
      ["INSTALACAO_VIDROS", "ENTREGA_E_INSTALACAO"],
    ]);
    expect(MODELO_PADRAO_DE_ETAPAS.filter((i) => i.marcoGarantia).map((i) => i.tipo)).toEqual(["INSTALACAO_VIDROS"]);
  });

  it("com esquadria, todas nascem pendentes; ordem de 1 a 9", () => {
    const e = etapasDoModelo(MODELO_PADRAO_DE_ETAPAS, true);
    expect(e.map((x) => x.ordem)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(e.every((x) => x.status === "PENDENTE")).toBe(true);
  });

  it("sem esquadria (só box e guarda-corpo), as etapas de esquadria nascem dispensadas", () => {
    const e = etapasDoModelo(MODELO_PADRAO_DE_ETAPAS, false);
    expect(e.filter((x) => x.status === "DISPENSADA").map((x) => x.tipo)).toEqual(["PEDIDO_MATERIAL", "FABRICACAO", "INSTALACAO_ESQUADRIAS"]);
  });

  it("ignora itens inativos, ordena e renumera", () => {
    const itens: ItemDoModelo[] = [
      { ...MODELO_PADRAO_DE_ETAPAS[8], ordem: 30 },
      { ...MODELO_PADRAO_DE_ETAPAS[0], ordem: 10 },
      { ...MODELO_PADRAO_DE_ETAPAS[3], ordem: 20, ativo: false },
    ];
    const e = etapasDoModelo(itens, true);
    expect(e.map((x) => [x.tipo, x.ordem])).toEqual([
      ["MEDICAO_EXATA", 1],
      ["ENTREGA", 2],
    ]);
  });
});

describe("etapas: transições e andamento da obra", () => {
  it("transições permitidas e proibidas", () => {
    expect(transicaoPermitida("PENDENTE", "EM_ANDAMENTO")).toBe(true);
    expect(transicaoPermitida("PENDENTE", "CONCLUIDA")).toBe(true);
    expect(transicaoPermitida("EM_ANDAMENTO", "BLOQUEADA")).toBe(true);
    expect(transicaoPermitida("BLOQUEADA", "EM_ANDAMENTO")).toBe(true);
    expect(transicaoPermitida("CONCLUIDA", "EM_ANDAMENTO")).toBe(true); // reabrir
    expect(transicaoPermitida("DISPENSADA", "PENDENTE")).toBe(true); // reativar
    expect(transicaoPermitida("BLOQUEADA", "CONCLUIDA")).toBe(false); // desbloquear antes
    expect(transicaoPermitida("CONCLUIDA", "PENDENTE")).toBe(false);
    expect(transicaoPermitida("CONCLUIDA", "BLOQUEADA")).toBe(false);
    expect(transicaoPermitida("DISPENSADA", "CONCLUIDA")).toBe(false);
    expect(transicaoPermitida("PENDENTE", "PENDENTE")).toBe(false);
  });

  const et = (tipo: string, ordem: number, status: StatusDeEtapa) => ({ tipo, ordem, status });

  it("etapa atual: a primeira que ainda não terminou", () => {
    const lista = [et("A", 1, "CONCLUIDA"), et("B", 2, "DISPENSADA"), et("C", 3, "EM_ANDAMENTO"), et("D", 4, "PENDENTE")];
    expect(etapaAtual(lista)?.tipo).toBe("C");
    expect(etapaAtual([et("A", 1, "CONCLUIDA"), et("B", 2, "DISPENSADA")])).toBeNull();
  });

  it("a obra termina com a ENTREGA concluída; sem ENTREGA, com a última etapa ativa", () => {
    expect(entregaConcluida([et("FABRICACAO", 1, "CONCLUIDA"), et("ENTREGA", 2, "PENDENTE")])).toBe(false);
    expect(entregaConcluida([et("FABRICACAO", 1, "PENDENTE"), et("ENTREGA", 2, "CONCLUIDA")])).toBe(true);
    expect(entregaConcluida([et("X", 1, "CONCLUIDA"), et("Y", 2, "CONCLUIDA"), et("Z", 3, "DISPENSADA")])).toBe(true);
    expect(entregaConcluida([et("X", 1, "CONCLUIDA"), et("Y", 2, "PENDENTE")])).toBe(false);
  });

  it("status do projeto: aprovado → em execução → concluído, e volta se a entrega for reaberta", () => {
    const todasPendentes = [et("MEDICAO_EXATA", 1, "PENDENTE"), et("ENTREGA", 2, "PENDENTE")];
    expect(statusDoProjetoPelasEtapas("APROVADO", todasPendentes)).toBeNull();
    expect(statusDoProjetoPelasEtapas("APROVADO", [et("MEDICAO_EXATA", 1, "EM_ANDAMENTO"), et("ENTREGA", 2, "PENDENTE")])).toBe("EM_EXECUCAO");
    expect(statusDoProjetoPelasEtapas("APROVADO", [et("MEDICAO_EXATA", 1, "CONCLUIDA"), et("ENTREGA", 2, "PENDENTE")])).toBe("EM_EXECUCAO");
    expect(statusDoProjetoPelasEtapas("EM_EXECUCAO", [et("MEDICAO_EXATA", 1, "CONCLUIDA"), et("ENTREGA", 2, "CONCLUIDA")])).toBe("CONCLUIDO");
    expect(statusDoProjetoPelasEtapas("CONCLUIDO", [et("MEDICAO_EXATA", 1, "CONCLUIDA"), et("ENTREGA", 2, "EM_ANDAMENTO")])).toBe("EM_EXECUCAO");
  });

  it("não muda quando já está certo, nem volta a APROVADO sozinho, nem mexe em projeto fora da obra", () => {
    expect(statusDoProjetoPelasEtapas("EM_EXECUCAO", [et("MEDICAO_EXATA", 1, "CONCLUIDA"), et("ENTREGA", 2, "PENDENTE")])).toBeNull();
    expect(statusDoProjetoPelasEtapas("EM_EXECUCAO", [et("MEDICAO_EXATA", 1, "PENDENTE"), et("ENTREGA", 2, "PENDENTE")])).toBeNull();
    expect(statusDoProjetoPelasEtapas("PERDIDO", [et("ENTREGA", 1, "CONCLUIDA")])).toBeNull();
    expect(statusDoProjetoPelasEtapas("PROPOSTA_ENVIADA", [et("ENTREGA", 1, "CONCLUIDA")])).toBeNull();
  });
});
