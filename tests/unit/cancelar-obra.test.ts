import { describe, expect, it } from "vitest";

import { bloqueiosDoCancelamento, planoDoCancelamento, textoDoCancelamento, type FatosDoCancelamento } from "@/lib/dominio/cancelar-obra";

const fatos = (extra: Partial<FatosDoCancelamento> = {}): FatosDoCancelamento => ({
  projetoStatus: "EM_EXECUCAO",
  temPropostaAprovada: true,
  parcelas: [],
  tarefasAbertas: 0,
  agendamentos: [],
  compras: 0,
  saidasDeEstoque: 0,
  retalhos: 0,
  sucata: 0,
  contasAPagar: 0,
  despesasDaObra: 0,
  chamadosEmAberto: 0,
  ...extra,
});

describe("bloqueios do cancelamento", () => {
  it("obra aprovada ou em execução, com proposta aprovada, pode ser cancelada", () => {
    expect(bloqueiosDoCancelamento(fatos({ projetoStatus: "APROVADO" }))).toEqual([]);
    expect(bloqueiosDoCancelamento(fatos())).toEqual([]);
  });

  it("obra concluída não: manda abrir chamado de assistência", () => {
    const b = bloqueiosDoCancelamento(fatos({ projetoStatus: "CONCLUIDO" }));
    expect(b.map((x) => x.codigo)).toEqual(["CONCLUIDA"]);
    expect(b[0]!.texto).toMatch(/assistência/);
  });

  it("já cancelada (duplo clique) é o único motivo", () => {
    expect(bloqueiosDoCancelamento(fatos({ projetoStatus: "CANCELADO", temPropostaAprovada: false })).map((x) => x.codigo)).toEqual(["JA_CANCELADA"]);
  });

  it("projeto sem aprovação aponta para 'perdido' no funil, dizendo a fase em português", () => {
    const b = bloqueiosDoCancelamento(fatos({ projetoStatus: "PROPOSTA_ENVIADA" }));
    expect(b.map((x) => x.codigo)).toEqual(["NAO_APROVADA"]);
    expect(b[0]!.texto).toContain("proposta enviada");
    expect(b[0]!.texto).toMatch(/perdido/);
  });

  it("sem proposta aprovada não há o que cancelar", () => {
    expect(bloqueiosDoCancelamento(fatos({ temPropostaAprovada: false })).map((x) => x.codigo)).toEqual(["SEM_PROPOSTA_APROVADA"]);
  });
});

describe("plano do cancelamento", () => {
  const parcelas = [
    { ordem: 1, status: "PAGA" as const, valorCentavos: 500000, valorPagoCentavos: 500000, lancamentosAtivos: 1 },
    { ordem: 2, status: "PARCIAL" as const, valorCentavos: 300000, valorPagoCentavos: 100000, lancamentosAtivos: 1 },
    { ordem: 3, status: "ABERTA" as const, valorCentavos: 200000, valorPagoCentavos: 0, lancamentosAtivos: 0 },
    { ordem: 4, status: "AGUARDANDO_GATILHO" as const, valorCentavos: 100000, valorPagoCentavos: 0, lancamentosAtivos: 0 },
    { ordem: 5, status: "CANCELADA" as const, valorCentavos: 999, valorPagoCentavos: 0, lancamentosAtivos: 0 },
  ];

  it("cancela só as parcelas sem recebimento; as com recebimento ficam; a já cancelada nem entra", () => {
    const p = planoDoCancelamento(fatos({ parcelas }));
    expect(p.parcelasACancelar.map((x) => x.ordem)).toEqual([3, 4]);
    expect(p.valorACancelarCentavos).toBe(300000);
    expect(p.parcelasQueFicam.map((x) => x.ordem)).toEqual([1, 2]);
    expect(p.valorRecebidoCentavos).toBe(600000);
  });

  it("parcela aberta com pagamento ativo (lançamento) também fica, mesmo com cache zerado", () => {
    const p = planoDoCancelamento(fatos({ parcelas: [{ ordem: 1, status: "ABERTA", valorCentavos: 100, valorPagoCentavos: 0, lancamentosAtivos: 1 }] }));
    expect(p.parcelasACancelar).toEqual([]);
    expect(p.parcelasQueFicam).toHaveLength(1);
  });

  it("dinheiro recebido vira aviso de estorno manual separado, nunca devolução automática", () => {
    const avisos = planoDoCancelamento(fatos({ parcelas })).avisos;
    const recebido = avisos.find((a) => a.codigo === "RECEBIDO")!;
    expect(recebido.texto).toMatch(/NÃO devolve dinheiro/);
    expect(recebido.texto).toMatch(/estorno em Financeiro/);
  });

  it("compras, saídas de estoque e o resto NÃO são desfeitos: só avisados, em português simples", () => {
    const avisos = planoDoCancelamento(
      fatos({ compras: 2, saidasDeEstoque: 3, retalhos: 1, sucata: 1, contasAPagar: 1, despesasDaObra: 2, chamadosEmAberto: 1, agendamentos: [{ rotulo: "instalação", dataBr: "10/12/2026" }] }),
    ).avisos;
    expect(avisos.map((a) => a.codigo)).toEqual(["AGENDAMENTO", "COMPRA", "ESTOQUE", "RETALHO", "SUCATA", "CONTA_A_PAGAR", "DESPESA", "CHAMADO"]);
    expect(avisos.find((a) => a.codigo === "COMPRA")!.texto).toMatch(/NÃO são canceladas/);
    expect(avisos.find((a) => a.codigo === "ESTOQUE")!.texto).toMatch(/NÃO é estornada/);
  });

  it("sem parcelas nem pendências o plano é vazio", () => {
    const p = planoDoCancelamento(fatos());
    expect(p).toMatchObject({ parcelasACancelar: [], parcelasQueFicam: [], valorACancelarCentavos: 0, valorRecebidoCentavos: 0, tarefasACancelar: 0, avisos: [] });
  });

  it("texto da linha do tempo leva o motivo e o que mudou", () => {
    const plano = planoDoCancelamento(fatos({ parcelas, tarefasAbertas: 2 }));
    const t = textoDoCancelamento({ codigo: "P-2026-0001", motivo: "Cliente desistiu", plano });
    expect(t).toContain("P-2026-0001 cancelada");
    expect(t).toContain("Motivo: Cliente desistiu.");
    expect(t).toContain("2 parcelas a receber canceladas");
    expect(t).toContain("já recebido");
    expect(t).toContain("2 tarefas abertas canceladas");
  });
});
