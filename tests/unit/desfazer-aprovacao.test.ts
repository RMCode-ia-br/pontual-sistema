import { describe, expect, it } from "vitest";

import {
  avisoDeMesDoAceite,
  bloqueiosDoDesfazer,
  chaveDeTarefaDesfeita,
  planoDeDesfazer,
  planoDeReabertura,
  reabrirPadrao,
  revisaoMaisNovaEmAberto,
  situacaoDasRevisoes,
  textoDoAvisoDeRevisaoMaisNova,
  textoDoPrazo,
  type FatosDoDesfazer,
  type RevisaoBasica,
} from "@/lib/dominio/desfazer-aprovacao";
import { ACOES_DESTRUTIVAS, can } from "@/lib/permissoes";
import { dataLocalDoInstante, formatarMoeda } from "@/lib/formatadores";

const limpo: FatosDoDesfazer = {
  propostaStatus: "APROVADA",
  projetoStatus: "APROVADO",
  parcelas: [
    { ordem: 1, status: "ABERTA", valorPagoCentavos: 0, lancamentosAtivos: 0 },
    { ordem: 2, status: "AGUARDANDO_GATILHO", valorPagoCentavos: 0, lancamentosAtivos: 0 },
  ],
  etapas: [
    { nome: "Medição exata", status: "PENDENTE", temDataReal: false },
    { nome: "Entrega", status: "DISPENSADA", temDataReal: false },
  ],
  pausasAtivas: 0,
  fotosDeObra: 0,
  agendamentos: [],
  compras: 0,
  saidasDeEstoque: 0,
  retalhos: 0,
  sucata: 0,
  contasAPagar: 0,
  despesasDaObra: 0,
  chamados: 0,
};
const codigos = (f: Partial<FatosDoDesfazer>) => bloqueiosDoDesfazer({ ...limpo, ...f }).map((b) => b.codigo);

describe("bloqueiosDoDesfazer", () => {
  it("o caso real (nada andou) não tem bloqueio", () => expect(bloqueiosDoDesfazer(limpo)).toEqual([]));

  it("proposta que não está aprovada: só esse motivo (duplo clique), o resto não importa", () => {
    expect(codigos({ propostaStatus: "ENVIADA", projetoStatus: "EM_EXECUCAO", compras: 3 })).toEqual(["NAO_APROVADA"]);
  });

  it.each([
    ["EM_EXECUCAO", "OBRA_EM_EXECUCAO"],
    ["CONCLUIDO", "OBRA_CONCLUIDA"],
    ["CANCELADO", "PROJETO_CANCELADO"],
  ])("projeto %s bloqueia", (status, codigo) => expect(codigos({ projetoStatus: status })).toEqual([codigo]));

  it("recebimento: parcela paga, parcial, com valor pago ou com lançamento ativo, dizendo qual parcela", () => {
    const parcela = (o: Partial<FatosDoDesfazer["parcelas"][number]>) => ({ ordem: 2, status: "ABERTA" as const, valorPagoCentavos: 0, lancamentosAtivos: 0, ...o });
    for (const p of [parcela({ status: "PAGA" }), parcela({ status: "PARCIAL" }), parcela({ valorPagoCentavos: 100 }), parcela({ lancamentosAtivos: 1 })]) {
      const r = bloqueiosDoDesfazer({ ...limpo, parcelas: [p] });
      expect(r.map((b) => b.codigo)).toEqual(["RECEBIMENTO"]);
      expect(r[0].texto).toContain("parcela 2");
      expect(r[0].texto).toContain("Estorne");
    }
  });

  it("parcela cancelada ou aguardando gatilho sem pagamento não bloqueia", () => {
    expect(codigos({ parcelas: [{ ordem: 1, status: "CANCELADA", valorPagoCentavos: 0, lancamentosAtivos: 0 }, { ordem: 2, status: "AGUARDANDO_GATILHO", valorPagoCentavos: 0, lancamentosAtivos: 0 }] })).toEqual([]);
  });

  it("etapa que andou (em andamento, concluída, bloqueada) ou com data real bloqueia, com o nome da etapa", () => {
    for (const status of ["EM_ANDAMENTO", "CONCLUIDA", "BLOQUEADA"] as const) {
      const r = bloqueiosDoDesfazer({ ...limpo, etapas: [{ nome: "Fabricação", status, temDataReal: false }] });
      expect(r.map((b) => b.codigo)).toEqual(["ETAPA_ANDOU"]);
      expect(r[0].texto).toContain("Fabricação");
    }
    expect(codigos({ etapas: [{ nome: "Fabricação", status: "PENDENTE", temDataReal: true }] })).toEqual(["ETAPA_ANDOU"]);
  });

  it("pausa, foto de obra e agendamento bloqueiam (o agendamento diz o dia)", () => {
    expect(codigos({ pausasAtivas: 1 })).toEqual(["PAUSA"]);
    expect(codigos({ fotosDeObra: 2 })).toEqual(["FOTOS"]);
    const r = bloqueiosDoDesfazer({ ...limpo, agendamentos: [{ rotulo: "medição exata", dataBr: "20/11/2026" }] });
    expect(r.map((b) => b.codigo)).toEqual(["AGENDAMENTO"]);
    expect(r[0].texto).toContain("20/11/2026");
  });

  it.each([
    ["compras", "COMPRA"],
    ["saidasDeEstoque", "ESTOQUE"],
    ["retalhos", "RETALHO"],
    ["sucata", "SUCATA"],
    ["contasAPagar", "CONTA_A_PAGAR"],
    ["despesasDaObra", "DESPESA"],
    ["chamados", "CHAMADO"],
  ] as const)("%s ligado à obra bloqueia", (campo, codigo) => expect(codigos({ [campo]: 1 })).toEqual([codigo]));

  it("várias coisas juntas: lista TUDO, para o usuário saber o que desfazer antes", () => {
    const r = codigos({ projetoStatus: "EM_EXECUCAO", compras: 1, saidasDeEstoque: 2, pausasAtivas: 1 });
    expect(r).toEqual(expect.arrayContaining(["OBRA_EM_EXECUCAO", "COMPRA", "ESTOQUE", "PAUSA"]));
    expect(r).toHaveLength(4);
  });
});

const rev = (id: string, revisao: number, status: RevisaoBasica["status"], temSnapshot = status !== "RASCUNHO"): RevisaoBasica => ({ id, revisao, status, temSnapshot });

describe("situacaoDasRevisoes", () => {
  it("o caso real: original aprovada e revisão substituída; vigente = a aprovada; a mais recente é a revisão", () => {
    const s = situacaoDasRevisoes([rev("a", 0, "APROVADA"), rev("b", 1, "SUBSTITUIDA", false)]);
    expect(s).toEqual({ vigenteId: "a", maisRecenteId: "b" });
  });
  it("original enviada e revisão em rascunho: vigente = a original (decisão 67), a mais recente = a revisão", () => {
    expect(situacaoDasRevisoes([rev("a", 0, "ENVIADA"), rev("b", 1, "RASCUNHO")])).toEqual({ vigenteId: "a", maisRecenteId: "b" });
  });
  it("revisão enviada vence a original substituída", () => {
    expect(situacaoDasRevisoes([rev("a", 0, "SUBSTITUIDA"), rev("b", 1, "ENVIADA")])).toEqual({ vigenteId: "b", maisRecenteId: "b" });
  });
  it("só rascunho: o rascunho vale; cancelada nunca é a mais recente; sem nada, nulos", () => {
    expect(situacaoDasRevisoes([rev("a", 0, "RASCUNHO")])).toEqual({ vigenteId: "a", maisRecenteId: "a" });
    expect(situacaoDasRevisoes([rev("a", 0, "ENVIADA"), rev("b", 1, "CANCELADA")]).maisRecenteId).toBe("a");
    expect(situacaoDasRevisoes([])).toEqual({ vigenteId: null, maisRecenteId: null });
  });
});

describe("aviso ao aprovar com revisão mais nova", () => {
  it("avisa da revisão em rascunho ou enviada acima da atual, a maior delas", () => {
    const revs = [rev("a", 0, "ENVIADA"), rev("b", 1, "RASCUNHO"), rev("c", 2, "ENVIADA")];
    expect(revisaoMaisNovaEmAberto({ id: "a", revisao: 0 }, revs)?.id).toBe("c");
    expect(revisaoMaisNovaEmAberto({ id: "c", revisao: 2 }, revs)).toBeNull();
  });
  it("ignora revisão mais nova cancelada, recusada, expirada ou substituída", () => {
    expect(revisaoMaisNovaEmAberto({ id: "a", revisao: 0 }, [rev("a", 0, "ENVIADA"), rev("b", 1, "CANCELADA"), rev("c", 2, "RECUSADA"), rev("d", 3, "EXPIRADA"), rev("e", 4, "SUBSTITUIDA")])).toBeNull();
  });
  it("o texto diz qual é mais recente e o que será descartado, em palavras simples", () => {
    expect(textoDoAvisoDeRevisaoMaisNova({ revisao: 0 }, rev("b", 1, "RASCUNHO"))).toBe("A Rev. 1 é mais recente (rascunho). Aprovar esta, a original, vai descartar a Rev. 1.");
    expect(textoDoAvisoDeRevisaoMaisNova({ revisao: 1 }, rev("c", 2, "ENVIADA"))).toBe("A Rev. 2 é mais recente (enviada). Aprovar esta, a Rev. 1, vai descartar a Rev. 2.");
  });
});

describe("planoDeReabertura", () => {
  it("a irmã EXPIRADA também sai de vigor (nunca enviada e expirada valendo juntas)", () => {
    const r = planoDeReabertura([rev("a", 0, "SUBSTITUIDA"), rev("b", 1, "EXPIRADA")], "a");
    expect(r).toEqual({ mudancas: [{ id: "a", de: "SUBSTITUIDA", para: "ENVIADA" }, { id: "b", de: "EXPIRADA", para: "SUBSTITUIDA" }] });
  });
  it("revisão com snapshot volta a ENVIADA e a enviada que valia sai de vigor", () => {
    const r = planoDeReabertura([rev("a", 0, "SUBSTITUIDA"), rev("b", 1, "ENVIADA")], "a");
    expect(r).toEqual({ mudancas: [{ id: "a", de: "SUBSTITUIDA", para: "ENVIADA" }, { id: "b", de: "ENVIADA", para: "SUBSTITUIDA" }] });
  });
  it("revisão sem snapshot volta a RASCUNHO e a enviada continua valendo", () => {
    expect(planoDeReabertura([rev("a", 0, "ENVIADA"), rev("b", 1, "SUBSTITUIDA", false)], "b")).toEqual({ mudancas: [{ id: "b", de: "SUBSTITUIDA", para: "RASCUNHO" }] });
  });
  it("nunca com irmã aprovada", () => {
    const r = planoDeReabertura([rev("a", 0, "APROVADA"), rev("b", 1, "SUBSTITUIDA", false)], "b");
    expect("erro" in r && r.erro).toContain("está aprovada");
  });
  it("nunca dois rascunhos do mesmo número", () => {
    const r = planoDeReabertura([rev("a", 0, "RASCUNHO"), rev("b", 1, "SUBSTITUIDA", false)], "b");
    expect("erro" in r && r.erro).toContain("rascunho");
  });
  it("só reabre substituída; id desconhecido é recusado", () => {
    expect("erro" in planoDeReabertura([rev("a", 0, "ENVIADA")], "a")).toBe(true);
    expect("erro" in planoDeReabertura([rev("a", 0, "ENVIADA")], "x")).toBe(true);
  });
});

describe("planoDeDesfazer", () => {
  const caso = [rev("a", 0, "APROVADA"), rev("b", 1, "SUBSTITUIDA", false)];
  it("o caso real escolhendo a revisão: a original volta a ENVIADA e a revisão a RASCUNHO", () => {
    expect(planoDeDesfazer(caso, "a", "b")).toEqual({ mudancas: [{ id: "a", de: "APROVADA", para: "ENVIADA" }, { id: "b", de: "SUBSTITUIDA", para: "RASCUNHO" }] });
  });
  it("sem reabrir ninguém: só a desfeita volta a ENVIADA", () => {
    expect(planoDeDesfazer(caso, "a", null)).toEqual({ mudancas: [{ id: "a", de: "APROVADA", para: "ENVIADA" }] });
  });
  it("revisão que já tinha sido enviada: ela volta a ENVIADA e a desfeita vira SUBSTITUIDA (fica uma só valendo)", () => {
    const r = planoDeDesfazer([rev("a", 0, "APROVADA"), rev("b", 1, "SUBSTITUIDA", true)], "a", "b");
    expect(r).toEqual({ mudancas: [{ id: "a", de: "APROVADA", para: "SUBSTITUIDA" }, { id: "b", de: "SUBSTITUIDA", para: "ENVIADA" }] });
  });
  it("as outras irmãs substituídas continuam como estão", () => {
    const r = planoDeDesfazer([rev("a", 0, "APROVADA"), rev("b", 1, "SUBSTITUIDA", true), rev("c", 2, "SUBSTITUIDA", false)], "a", "c");
    expect("mudancas" in r && r.mudancas.map((m) => m.id)).toEqual(["a", "c"]);
  });
  it("recusa proposta que não está aprovada, escolher a própria desfeita e revisão que não está substituída", () => {
    expect("erro" in planoDeDesfazer([rev("a", 0, "ENVIADA")], "a", null)).toBe(true);
    expect("erro" in planoDeDesfazer(caso, "a", "a")).toBe(true);
    expect("erro" in planoDeDesfazer([rev("a", 0, "APROVADA"), rev("b", 1, "CANCELADA")], "a", "b")).toBe(true);
  });
  it("padrão da tela: a substituída mais recente", () => {
    expect(reabrirPadrao([rev("a", 0, "APROVADA"), rev("b", 1, "SUBSTITUIDA"), rev("c", 2, "SUBSTITUIDA")], "a")).toBe("c");
    expect(reabrirPadrao([rev("a", 0, "APROVADA")], "a")).toBeNull();
  });
});

describe("avisoDeMesDoAceite (o Vendido é pelo mês do aceite)", () => {
  it("aceite de mês anterior avisa o mês e o valor", () => {
    expect(avisoDeMesDoAceite({ aceitaEm: "2026-10-20", hoje: "2026-11-16", valorCentavos: 1130000 })).toBe(`A aprovação é de outubro/2026: desfazer tira ${formatarMoeda(1130000)} do Vendido de outubro/2026.`);
  });
  it("mesmo mês, e mês futuro, não avisam", () => {
    expect(avisoDeMesDoAceite({ aceitaEm: "2026-11-01", hoje: "2026-11-30", valorCentavos: 100 })).toBeNull();
    expect(avisoDeMesDoAceite({ aceitaEm: "2026-12-05", hoje: "2026-11-30", valorCentavos: 100 })).toBeNull();
  });
  it("virada de ano: dezembro do ano passado avisa", () => {
    expect(avisoDeMesDoAceite({ aceitaEm: "2025-12-31", hoje: "2026-01-02", valorCentavos: 100 })).toContain("dezembro/2025");
  });
  it("fuso: 22h do último dia (SP) ainda é outubro; 00h30 de 01/11 (SP) já é novembro", () => {
    // 31/10 22:00 em São Paulo = 01/11 01:00 UTC; 01/11 00:30 em São Paulo = 01/11 03:30 UTC.
    const dia31 = dataLocalDoInstante(new Date("2026-11-01T01:00:00Z"));
    const dia1 = dataLocalDoInstante(new Date("2026-11-01T03:30:00Z"));
    expect(dia31).toBe("2026-10-31");
    expect(dia1).toBe("2026-11-01");
    expect(avisoDeMesDoAceite({ aceitaEm: "2026-10-15", hoje: dia31, valorCentavos: 100 })).toBeNull(); // ainda em outubro: nada a avisar
    expect(avisoDeMesDoAceite({ aceitaEm: "2026-10-15", hoje: dia1, valorCentavos: 100 })).toContain("outubro/2026"); // virou novembro
  });
  it("data malformada não quebra", () => expect(avisoDeMesDoAceite({ aceitaEm: "", hoje: "2026-11-16", valorCentavos: 1 })).toBeNull());
});

describe("textoDoPrazo (prévia da troca)", () => {
  const base = { dias: null, material: null, execucao: null, vidros: null, tipoDias: "UTEIS" as const };
  it("total simples, por etapa, corridos, singular e sem prazo", () => {
    expect(textoDoPrazo({ ...base, modo: "TOTAL", dias: 35 })).toBe("35 dias úteis");
    expect(textoDoPrazo({ ...base, modo: "TOTAL", dias: 1 })).toBe("1 dia útil");
    expect(textoDoPrazo({ ...base, modo: "TOTAL", dias: 10, tipoDias: "CORRIDOS" })).toBe("10 dias corridos");
    expect(textoDoPrazo({ ...base, modo: "TOTAL", dias: 1, tipoDias: "CORRIDOS" })).toBe("1 dia corrido");
    expect(textoDoPrazo({ ...base, modo: "POR_ETAPA", dias: 23, material: 10, execucao: 5, vidros: 8 })).toBe("23 dias úteis (material 10 + execução 5 + vidros e acabamento 8)");
    expect(textoDoPrazo({ ...base, modo: "NENHUM" })).toBe("sem prazo definido");
    expect(textoDoPrazo({ ...base, modo: "TOTAL", dias: 0 })).toBe("sem prazo definido");
  });
});

describe("chave de tarefa desfeita e permissão", () => {
  it("a chave antiga é aposentada com o id da tarefa e nunca repete", () => {
    expect(chaveDeTarefaDesfeita("medicao-exata:p1", "t1")).toBe("medicao-exata:p1:desfeita:t1");
    expect(chaveDeTarefaDesfeita("medicao-exata:p1", "t2")).not.toBe(chaveDeTarefaDesfeita("medicao-exata:p1", "t1"));
  });
  it("desfazer a aprovação é ação destrutiva anotada para a Fase 7C e hoje o can libera", () => {
    expect(ACOES_DESTRUTIVAS).toContainEqual(expect.objectContaining({ acao: "desfazer", recurso: "aprovacao" }));
    expect(can({ id: "u", papel: "ADMIN" }, "desfazer", "aprovacao")).toBe(true);
  });
});
