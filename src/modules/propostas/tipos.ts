/** Formas simples (só dados, sem Date) que o servidor entrega aos componentes do editor. */
import type { PropostaDoEditor } from "./queries";

export type MedidaSer = { larguraMm: number; alturaMm: number; quantidade: number; local: string | null };

export type ItemSer = {
  id: string;
  opcaoId: string;
  grupoId: string | null;
  ordem: number;
  tipologiaId: string | null;
  tipologiaNome: string | null;
  tipoDesenho: string;
  linhaId: string | null;
  acabamentoId: string | null;
  tipoVidroId: string | null;
  espessuraVidroMm: number | null;
  folhas: number | null;
  faces: number | null;
  torresCm: number | null;
  descricao: string;
  descricaoEditada: boolean;
  local: string | null;
  observacoes: string | null;
  modoPreco: "MANUAL" | "TABELA" | "COMPOSICAO";
  valorManualCentavos: number | null;
  markupPb: number | null;
  precoTotalCentavos: number;
  custoEstimadoCentavos: number | null;
  avisoPreco: string | null;
  calculadoEm: string | null;
  medidas: MedidaSer[];
};

export type ParcelaSer = { descricao: string; percentualPb: number; gatilho: string; forma: string | null; diasApos: number | null; dataFixa: string | null; parcelasCartao: number | null };

export type PropostaSer = {
  id: string;
  numero: string;
  revisao: number;
  parte: string | null;
  status: string;
  data: string;
  consultorNome: string | null;
  consultorCargo: string | null;
  clienteNome: string;
  clienteDocumento: string | null;
  clienteContato: string | null;
  clienteTelefone: string | null;
  clienteEmail: string | null;
  enderecoObra: string | null;
  tituloEscopo: string;
  comNotaFiscal: boolean;
  acrescimoNotaPb: number;
  comissaoArquitetoPb: number;
  comissaoIndicacaoPb: number;
  markupPb: number | null;
  modoPrazo: "NENHUM" | "TOTAL" | "POR_ETAPA";
  prazoTotalMinDias: number | null;
  prazoTotalMaxDias: number | null;
  prazoMaterialDias: number | null;
  prazoExecucaoDias: number | null;
  prazoVidrosDias: number | null;
  validadeTexto: string | null;
  validadeAte: string | null;
  validadeEncerradaPorReajuste: boolean;
  condicaoId: string | null;
  condicaoTextoLivre: string | null;
  dadosPagamento: string | null;
  notas: string[];
  exibirValorPorItem: boolean;
  descricoesMaiusculas: boolean;
  observacoesInternas: string | null;
  enviadaEm: string | null;
  opcoes: { id: string; nome: string; descontoCentavos: number }[];
  grupos: { id: string; nome: string; ordem: number }[];
  itens: ItemSer[];
  parcelas: ParcelaSer[];
  projeto: { id: string; codigo: string; titulo: string; clienteNome: string };
};

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export function serializarProposta(p: PropostaDoEditor): PropostaSer {
  return {
    id: p.id,
    numero: p.numero,
    revisao: p.revisao,
    parte: p.parte,
    status: p.status,
    data: dia(p.data) as string,
    consultorNome: p.consultorNome,
    consultorCargo: p.consultorCargo,
    clienteNome: p.clienteNome,
    clienteDocumento: p.clienteDocumento,
    clienteContato: p.clienteContato,
    clienteTelefone: p.clienteTelefone,
    clienteEmail: p.clienteEmail,
    enderecoObra: p.enderecoObra,
    tituloEscopo: p.tituloEscopo,
    comNotaFiscal: p.comNotaFiscal,
    acrescimoNotaPb: p.acrescimoNotaPb,
    comissaoArquitetoPb: p.comissaoArquitetoPb,
    comissaoIndicacaoPb: p.comissaoIndicacaoPb,
    markupPb: p.markupPb,
    modoPrazo: p.modoPrazo,
    prazoTotalMinDias: p.prazoTotalMinDias,
    prazoTotalMaxDias: p.prazoTotalMaxDias,
    prazoMaterialDias: p.prazoMaterialDias,
    prazoExecucaoDias: p.prazoExecucaoDias,
    prazoVidrosDias: p.prazoVidrosDias,
    validadeTexto: p.validadeTexto,
    validadeAte: dia(p.validadeAte),
    validadeEncerradaPorReajuste: p.validadeEncerradaPorReajuste,
    condicaoId: p.condicaoId,
    condicaoTextoLivre: p.condicaoTextoLivre,
    dadosPagamento: p.dadosPagamento,
    notas: p.notas,
    exibirValorPorItem: p.exibirValorPorItem,
    descricoesMaiusculas: p.descricoesMaiusculas,
    observacoesInternas: p.observacoesInternas,
    enviadaEm: p.enviadaEm ? p.enviadaEm.toISOString() : null,
    opcoes: p.opcoes.map((o) => ({ id: o.id, nome: o.nome, descontoCentavos: o.descontoCentavos })),
    grupos: p.grupos.map((g) => ({ id: g.id, nome: g.nome, ordem: g.ordem })),
    itens: p.itens.map((i) => ({
      id: i.id,
      opcaoId: i.opcaoId,
      grupoId: i.grupoId,
      ordem: i.ordem,
      tipologiaId: i.tipologiaId,
      tipologiaNome: i.tipologia?.nome ?? null,
      tipoDesenho: i.tipologia?.tipoDesenho ?? "GENERICO",
      linhaId: i.linhaId,
      acabamentoId: i.acabamentoId,
      tipoVidroId: i.tipoVidroId,
      espessuraVidroMm: i.espessuraVidroMm,
      folhas: i.folhas,
      faces: i.faces,
      torresCm: i.torresCm,
      descricao: i.descricao,
      descricaoEditada: i.descricaoEditada,
      local: i.local,
      observacoes: i.observacoes,
      modoPreco: i.modoPreco,
      valorManualCentavos: i.valorManualCentavos,
      markupPb: i.markupPb,
      precoTotalCentavos: i.precoTotalCentavos,
      custoEstimadoCentavos: i.custoEstimadoCentavos,
      avisoPreco: i.avisoPreco,
      calculadoEm: i.calculadoEm ? i.calculadoEm.toISOString() : null,
      medidas: i.medidas.map((m) => ({ larguraMm: m.larguraMm, alturaMm: m.alturaMm, quantidade: m.quantidade, local: m.local })),
    })),
    parcelas: p.parcelas.map((x) => ({ descricao: x.descricao, percentualPb: x.percentualPb, gatilho: x.gatilho, forma: x.forma, diasApos: x.diasApos, dataFixa: dia(x.dataFixa), parcelasCartao: x.parcelasCartao })),
    projeto: { id: p.projeto.id, codigo: p.projeto.codigo, titulo: p.projeto.titulo, clienteNome: p.projeto.cliente.nome },
  };
}

export type OpcoesEditor = {
  tipologias: { id: string; nome: string; tipoDesenho: string; opcoesFolhas: number[]; templateDescricao: string; cobrancaPadrao: string; categoriaMarkup: string; exigeEsquadria: boolean }[];
  linhas: { id: string; nome: string }[];
  acabamentos: { id: string; nome: string }[];
  tiposVidro: { id: string; nome: string }[];
  espessuras: number[];
  condicoes: { id: string; nome: string; textoLivre: string | null; parcelas: { descricao: string; percentualPb: number; gatilho: string; forma: string | null; diasApos: number | null; parcelasCartao: number | null }[] }[];
  config: { markupPadraoPb: number; markupVidroTemperadoPb: number; acrescimoNotaPb: number; margemMinimaAlerta: number | null };
};
