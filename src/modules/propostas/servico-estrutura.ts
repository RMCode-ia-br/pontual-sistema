import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { gerarDescricao, valoresDoTemplate } from "@/lib/dominio/descricao-item";
import { MAXIMO_CENTAVOS } from "@/lib/dominio/preco";

import type { DuplicarOpcaoEntrada } from "./schemas";
import { calcularPrecoDoItem, exigirRascunho } from "./servico";
import { configParaCopia } from "./servico-desenho";

type Tx = Prisma.TransactionClient;

/** Confere que cada ID de catálogo vindo do navegador existe (nunca confiar no cliente). */
export async function conferirCatalogos(tx: Tx, v: { tipologiaId: string | null; linhaId: string | null; acabamentoId: string | null; tipoVidroId: string | null }) {
  const [tipologia, linha, acabamento, vidro] = await Promise.all([
    v.tipologiaId ? tx.tipologia.count({ where: { id: v.tipologiaId, deletadoEm: null } }) : 1,
    v.linhaId ? tx.linhaAluminio.count({ where: { id: v.linhaId, deletadoEm: null } }) : 1,
    v.acabamentoId ? tx.acabamentoAluminio.count({ where: { id: v.acabamentoId, deletadoEm: null } }) : 1,
    v.tipoVidroId ? tx.tipoVidro.count({ where: { id: v.tipoVidroId, deletadoEm: null } }) : 1,
  ]);
  if (!tipologia || !linha || !acabamento || !vidro) throw new ErroNegocio("Um dos itens escolhidos (tipologia, linha, acabamento ou vidro) não foi encontrado. Atualize a página.");
}

export async function conferirTeto(tx: Tx, propostaId: string) {
  const soma = await tx.itemProposta.groupBy({ by: ["opcaoId"], where: { propostaId, deletadoEm: null }, _sum: { precoTotalCentavos: true } });
  if (soma.some((s) => (s._sum.precoTotalCentavos ?? 0) > MAXIMO_CENTAVOS)) throw new ErroNegocio("A soma dos itens passa do valor máximo aceito (R$ 21.474.836,47).");
}

/**
 * Duplica uma opção da proposta (itens, medidas e desenho personalizado), podendo trocar linha, acabamento, vidro e
 * espessura, e regerando a descrição dos itens. Tudo na transação recebida; a ação só cuida de sessão e revalidação.
 */
export async function duplicarOpcaoNaTransacao(tx: Tx, { usuario, v, ip }: { usuario: { id: string; nome: string }; v: DuplicarOpcaoEntrada; ip: string | null }) {
    const proposta = await exigirRascunho(tx, v.propostaId);
    const origem = await tx.opcaoProposta.findFirst({ where: { id: v.opcaoId, propostaId: proposta.id, deletadoEm: null } });
    if (!origem) throw new ErroNegocio("Opção não encontrada.");
    await conferirCatalogos(tx, { tipologiaId: null, linhaId: v.linhaId, acabamentoId: v.acabamentoId, tipoVidroId: v.tipoVidroId });
    const ordem = ((await tx.opcaoProposta.aggregate({ where: { propostaId: proposta.id, deletadoEm: null }, _max: { ordem: true } }))._max.ordem ?? -1) + 1;
    const nova = await tx.opcaoProposta.create({ data: { propostaId: proposta.id, nome: v.nome, ordem, descontoCentavos: origem.descontoCentavos, criadoPorId: usuario.id, atualizadoPorId: usuario.id }, select: { id: true } });
    const itens = await tx.itemProposta.findMany({ where: { opcaoId: origem.id, deletadoEm: null }, orderBy: { ordem: "asc" }, include: { medidas: { where: { deletadoEm: null }, orderBy: { ordem: "asc" } } } });
    let avisos = 0;
    // Nomes do catálogo e modelos das tipologias, para REGERAR a descrição dos itens copiados (o texto leva linha,
    // vidro e espessura: copiar sem regerar imprimiria "LINHA SUPREMA" numa opção Gold).
    const [linhasCat, acabCat, vidrosCat, tipologiasCat, cabecalho] = await Promise.all([
      tx.linhaAluminio.findMany({ select: { id: true, nome: true } }),
      tx.acabamentoAluminio.findMany({ select: { id: true, nome: true } }),
      tx.tipoVidro.findMany({ select: { id: true, nome: true } }),
      tx.tipologia.findMany({ where: { id: { in: [...new Set(itens.flatMap((x) => (x.tipologiaId ? [x.tipologiaId] : [])))] } }, select: { id: true, templateDescricao: true } }),
      tx.proposta.findUniqueOrThrow({ where: { id: proposta.id }, select: { descricoesMaiusculas: true } }),
    ]);
    const nomeDe = (lista: { id: string; nome: string }[], id: string | null) => (id ? (lista.find((x) => x.id === id)?.nome ?? null) : null);
    for (const i of itens) {
      const trocas = {
        linhaId: v.linhaId ?? i.linhaId,
        acabamentoId: v.acabamentoId ?? i.acabamentoId,
        tipoVidroId: v.tipoVidroId ?? i.tipoVidroId,
        espessuraVidroMm: v.espessuraVidroMm ?? i.espessuraVidroMm,
      };
      const mudou = trocas.linhaId !== i.linhaId || trocas.acabamentoId !== i.acabamentoId || trocas.tipoVidroId !== i.tipoVidroId || trocas.espessuraVidroMm !== i.espessuraVidroMm;
      let modoPreco = i.modoPreco;
      let preco = i.precoTotalCentavos;
      let custo = i.custoEstimadoCentavos;
      let aviso = i.avisoPreco;
      let cobranca = i.cobranca;
      let descricao = i.descricao;
      if (mudou) {
        const modelo = i.tipologiaId ? tipologiasCat.find((t) => t.id === i.tipologiaId)?.templateDescricao : null;
        if (!i.descricaoEditada && modelo) {
          const g = gerarDescricao(
            modelo,
            valoresDoTemplate({ folhas: i.folhas, faces: i.faces, torresCm: i.torresCm, linha: nomeDe(linhasCat, trocas.linhaId), tipoVidro: nomeDe(vidrosCat, trocas.tipoVidroId), espessuraMm: trocas.espessuraVidroMm, acabamento: nomeDe(acabCat, trocas.acabamentoId) }),
            i.medidas.map((m) => ({ larguraMm: m.larguraMm, alturaMm: m.alturaMm, quantidade: m.quantidade })),
          );
          descricao = cabecalho.descricoesMaiusculas ? g.texto.toUpperCase() : g.texto;
        } else {
          // Descrição editada à mão (ou item livre): não dá para regerar; avisa para conferir.
          avisos++;
          aviso = `Revisar a descrição: ela foi escrita à mão e ainda cita a combinação anterior.${aviso ? ` ${aviso}` : ""}`;
        }
      }
      if (mudou && i.modoPreco !== "MANUAL") {
        const calc = await calcularPrecoDoItem(tx, {
          modoPreco: i.modoPreco,
          tipologiaId: i.tipologiaId,
          ...trocas,
          folhas: i.folhas,
          medidas: i.medidas.map((m) => ({ larguraMm: m.larguraMm, alturaMm: m.alturaMm, quantidade: m.quantidade })),
          valorManualCentavos: i.valorManualCentavos,
          markupItemPb: i.markupPb,
          markupPropostaPb: proposta.markupPb,
        });
        if (calc.ok) {
          modoPreco = calc.modoPreco;
          preco = calc.precoTotalCentavos;
          custo = calc.custoEstimadoCentavos;
          aviso = calc.aviso;
          cobranca = calc.cobranca;
        } else {
          aviso = `Revisar: não foi possível recalcular com a nova combinação (${calc.erro}) Mantido o valor anterior.`;
          avisos++;
        }
      } else if (mudou) {
        aviso = "Combinação trocada: confira o valor manual.";
        avisos++;
      }
      await tx.itemProposta.create({
        data: {
          propostaId: proposta.id,
          opcaoId: nova.id,
          grupoId: i.grupoId,
          ordem: i.ordem,
          tipologiaId: i.tipologiaId,
          ...trocas,
          folhas: i.folhas,
          faces: i.faces,
          torresCm: i.torresCm,
          descricao,
          descricaoEditada: i.descricaoEditada,
          local: i.local,
          observacoes: i.observacoes,
          modoPreco,
          cobranca,
          valorManualCentavos: i.valorManualCentavos,
          precoTotalCentavos: preco,
          custoEstimadoCentavos: custo,
          markupPb: i.markupPb,
          calculadoEm: new Date(),
          avisoPreco: aviso,
          desenhoAnexoId: i.desenhoAnexoId,
          desenhoConfig: configParaCopia(i.desenhoConfig),
          medidas: { create: i.medidas.map((m) => ({ larguraMm: m.larguraMm, alturaMm: m.alturaMm, quantidade: m.quantidade, local: m.local, ordem: m.ordem, criadoPorId: usuario.id, atualizadoPorId: usuario.id })) },
          criadoPorId: usuario.id,
          atualizadoPorId: usuario.id,
        },
      });
    }
    await conferirTeto(tx, proposta.id);
    await registrarAuditoria(tx, { usuario: usuario, entidade: "OpcaoProposta", entidadeId: nova.id, acao: "DUPLICAR", depois: { origem: origem.id, itens: itens.length, trocas: { linhaId: v.linhaId, acabamentoId: v.acabamentoId, tipoVidroId: v.tipoVidroId, espessuraVidroMm: v.espessuraVidroMm } }, ip });
    return { id: nova.id, projetoId: proposta.projetoId, avisos };
}
