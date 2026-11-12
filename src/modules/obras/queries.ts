import "server-only";

import { prisma } from "@/lib/db";
import type { GatilhoDeEtapa, ItemDoModelo, TipoDeEtapa } from "@/lib/dominio/etapas";
import { linkWhatsApp, preencherModelo, primeiroNome } from "@/lib/dominio/modelos-texto";
import type { GrupoDePrazo, StatusDeEtapa } from "@/lib/dominio/prazo-obra";
import { etapaAtrasada, semaforoDaEtapa, semaforoDaObra, type Semaforo } from "@/lib/dominio/semaforo";
import { dataLocalDoInstante } from "@/lib/formatadores";

import { avisosDaObra, visaoDoPrazo, type PrazoDaObraVisao } from "./visao";
import { carregarPeriodosDeFeriado } from "./servico";

export type ModeloDeEtapas = { id: string; nome: string; itens: ItemDoModelo[] };

/** O modelo de etapas padrão com seus itens, na ordem; `null` se a seed ainda não criou. */
export async function obterModeloPadrao(): Promise<ModeloDeEtapas | null> {
  const m = await prisma.modeloEtapas.findFirst({
    where: { padrao: true, deletadoEm: null },
    select: {
      id: true,
      nome: true,
      itens: {
        where: { deletadoEm: null },
        orderBy: { ordem: "asc" },
        select: { tipo: true, nome: true, ordem: true, grupoPrazo: true, peso: true, liberaGatilho: true, marcoGarantia: true, exigeEsquadria: true, ativo: true },
      },
    },
  });
  // O CHECK do banco só deixa os dois gatilhos de etapa gravados.
  return m as ModeloDeEtapas | null;
}

// ---------------------------------------------------------------------------------------------------------
// A obra (Bloco 3)
// ---------------------------------------------------------------------------------------------------------

const dia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export type EtapaDaObra = {
  id: string;
  tipo: TipoDeEtapa;
  nome: string;
  ordem: number;
  grupoPrazo: GrupoDePrazo | null;
  status: StatusDeEtapa;
  liberaGatilho: GatilhoDeEtapa | null;
  marcoGarantia: boolean;
  responsavel: { id: string; nome: string } | null;
  equipe: { id: string; nome: string } | null;
  inicioPrevisto: string | null;
  fimPrevisto: string | null;
  /** Data calculada antes de a medição exata ser concluída. */
  provisoria: boolean;
  inicioReal: string | null;
  fimReal: string | null;
  motivoBloqueio: string | null;
  detalheBloqueio: string | null;
  observacao: string | null;
  /** Derivados na consulta (nunca gravados). */
  semaforo: Semaforo | null;
  atrasada: boolean;
};

export type PausaDaObra = { id: string; inicio: string; fim: string | null; motivo: string; justificada: boolean; observacao: string | null; emCurso: boolean };

export type ParcelaDaObra = {
  id: string;
  ordem: number;
  descricao: string;
  valorCentavos: number;
  vencimento: string | null;
  status: "AGUARDANDO_GATILHO" | "ABERTA" | "PARCIAL" | "PAGA" | "CANCELADA";
  gatilho: string | null;
  /** Vencimento passado e ainda não paga (derivado). */
  atrasada: boolean;
  /** Nome da etapa que a liberou, ou da que ela aguarda. */
  etapa: string | null;
};

export type ObraDetalhe = {
  id: string;
  codigo: string;
  titulo: string;
  status: string;
  cliente: { id: string; nome: string; telefone: string | null; whatsapp: string | null };
  responsavel: { id: string; nome: string } | null;
  enderecoTexto: string | null;
  condominio: { nome: string | null; exigeAprovacaoFachada: boolean; fachadaAprovada: boolean; horariosPermitidos: string | null; sindicoNome: string | null; sindicoTelefone: string | null } | null;
  valorFechadoCentavos: number | null;
  dataConclusao: string | null;
  autorizaPortfolio: boolean;
  prazo: PrazoDaObraVisao;
  semaforo: Semaforo | null;
  etapas: EtapaDaObra[];
  pausas: PausaDaObra[];
  parcelas: ParcelaDaObra[];
  avisos: string[];
  /** Dia de hoje em São Paulo (aaaa-mm-dd), o mesmo usado nos cálculos. */
  hoje: string;
  /** Link de avaliação do Google (Configurações) e nome da empresa, para a mensagem de pedido de avaliação. */
  linkAvaliacaoGoogle: string | null;
  nomeFantasia: string | null;
  /** Garantia de regulagem em dias (Configurações, padrão 90), contada da conclusão da etapa-marco. */
  garantiaDias: number;
};

const STATUS_DE_OBRA = ["APROVADO", "EM_EXECUCAO", "CONCLUIDO"];

export async function obterObra(id: string, agora: Date = new Date()): Promise<ObraDetalhe | null> {
  const [p, cfg, periodos] = await Promise.all([
    prisma.projeto.findFirst({
      where: { id, deletadoEm: null },
      include: {
        cliente: { select: { id: true, nome: true, telefone: true, whatsapp: true } },
        responsavel: { select: { id: true, nome: true } },
        enderecoObra: {
          select: { apelido: true, logradouro: true, numero: true, bairro: true, cidade: true, uf: true, condominio: true, condominioNome: true, exigeAprovacaoFachada: true, fachadaAprovada: true, horariosPermitidos: true, sindicoNome: true, sindicoTelefone: true },
        },
        etapas: {
          where: { deletadoEm: null },
          orderBy: { ordem: "asc" },
          include: { responsavel: { select: { id: true, nome: true } }, equipe: { select: { id: true, nome: true } }, motivoBloqueio: { select: { nome: true } } },
        },
        pausas: { where: { deletadoEm: null }, orderBy: { inicio: "desc" }, include: { motivoBloqueio: { select: { nome: true } } } },
        contasReceber: { where: { deletadoEm: null }, orderBy: [{ propostaId: "asc" }, { ordem: "asc" }] },
      },
    }),
    prisma.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { diasAlertaPrazoAmarelo: true, linkAvaliacaoGoogle: true, nomeFantasia: true, garantiaRegulagemDias: true } }),
    carregarPeriodosDeFeriado(prisma),
  ]);
  if (!p || !STATUS_DE_OBRA.includes(p.status)) return null;

  const hoje = dataLocalDoInstante(agora);
  const diasAlerta = cfg?.diasAlertaPrazoAmarelo ?? 3;
  const concluida = p.status === "CONCLUIDO";

  const prazo = visaoDoPrazo({
    projeto: {
      status: p.status,
      prazoModo: p.prazoModo,
      prazoDias: p.prazoDias,
      prazoMaterialDias: p.prazoMaterialDias,
      prazoExecucaoDias: p.prazoExecucaoDias,
      prazoVidrosDias: p.prazoVidrosDias,
      tipoDiasPrazo: p.tipoDiasPrazo,
      dataInicioPrazo: dia(p.dataInicioPrazo),
      dataConclusao: dia(p.dataConclusao),
    },
    etapas: p.etapas.map((e) => ({ status: e.status, fimPrevisto: dia(e.fimPrevisto) })),
    pausas: p.pausas.map((x) => ({ inicio: dia(x.inicio)!, fim: dia(x.fim), justificada: x.justificada })),
    periodos,
    hoje,
    diasAlerta,
  });

  const etapas: EtapaDaObra[] = p.etapas.map((e) => ({
    id: e.id,
    tipo: e.tipo,
    nome: e.nome,
    ordem: e.ordem,
    grupoPrazo: e.grupoPrazo,
    status: e.status,
    liberaGatilho: e.liberaGatilho as GatilhoDeEtapa | null,
    marcoGarantia: e.marcoGarantia,
    responsavel: e.responsavel,
    equipe: e.equipe,
    inicioPrevisto: dia(e.inicioPrevisto),
    fimPrevisto: dia(e.fimPrevisto),
    provisoria: e.provisoria,
    inicioReal: dia(e.inicioReal),
    fimReal: dia(e.fimReal),
    motivoBloqueio: e.motivoBloqueio?.nome ?? null,
    detalheBloqueio: e.detalheBloqueio,
    observacao: e.observacao,
    semaforo: semaforoDaEtapa({ status: e.status, fimPrevisto: dia(e.fimPrevisto) }, hoje, diasAlerta),
    atrasada: etapaAtrasada({ status: e.status, fimPrevisto: dia(e.fimPrevisto) }, hoje),
  }));

  const nomeDaEtapaPorId = new Map(etapas.map((e) => [e.id, e.nome]));
  const nomeDaEtapaDoGatilho = (g: string | null) => etapas.find((e) => e.liberaGatilho === g)?.nome ?? null;
  const parcelas: ParcelaDaObra[] = p.contasReceber.map((c) => ({
    id: c.id,
    ordem: c.ordem,
    descricao: c.descricao,
    valorCentavos: c.valorCentavos,
    vencimento: dia(c.vencimento),
    status: c.status,
    gatilho: c.gatilho,
    atrasada: c.status === "ABERTA" && c.vencimento !== null && dia(c.vencimento)! < hoje,
    etapa: c.etapaProjetoId ? (nomeDaEtapaPorId.get(c.etapaProjetoId) ?? null) : c.status === "AGUARDANDO_GATILHO" ? nomeDaEtapaDoGatilho(c.gatilho) : null,
  }));

  const end = p.enderecoObra;
  const condominio = end?.condominio
    ? { nome: end.condominioNome, exigeAprovacaoFachada: end.exigeAprovacaoFachada, fachadaAprovada: end.fachadaAprovada, horariosPermitidos: end.horariosPermitidos, sindicoNome: end.sindicoNome, sindicoTelefone: end.sindicoTelefone }
    : null;

  return {
    id: p.id,
    codigo: p.codigo,
    titulo: p.titulo,
    status: p.status,
    cliente: p.cliente,
    responsavel: p.responsavel,
    enderecoTexto: end ? [end.apelido, [[end.logradouro, end.numero].filter(Boolean).join(", "), end.bairro, [end.cidade, end.uf].filter(Boolean).join("/")].filter(Boolean).join(" — ")].filter(Boolean).join(" · ") || "Endereço sem detalhes" : null,
    condominio,
    valorFechadoCentavos: p.valorFechadoCentavos,
    dataConclusao: dia(p.dataConclusao),
    autorizaPortfolio: p.autorizaPortfolio,
    prazo,
    semaforo: semaforoDaObra(etapas.map((e) => ({ status: e.status, fimPrevisto: e.fimPrevisto })), prazo.comPausas, concluida, hoje, diasAlerta),
    etapas,
    pausas: p.pausas.map((x) => ({ id: x.id, inicio: dia(x.inicio)!, fim: dia(x.fim), motivo: x.motivoBloqueio.nome, justificada: x.justificada, observacao: x.observacao, emCurso: x.fim === null })),
    parcelas,
    avisos: avisosDaObra({
      prazo,
      etapas: etapas.map((e) => ({ nome: e.nome, tipo: e.tipo, status: e.status, inicioPrevisto: e.inicioPrevisto, fimPrevisto: e.fimPrevisto })),
      periodos,
      condominio: condominio ? { nome: condominio.nome, exigeAprovacaoFachada: condominio.exigeAprovacaoFachada, fachadaAprovada: condominio.fachadaAprovada } : null,
      concluida,
    }),
    hoje,
    linkAvaliacaoGoogle: cfg?.linkAvaliacaoGoogle ?? null,
    nomeFantasia: cfg?.nomeFantasia ?? null,
    garantiaDias: cfg?.garantiaRegulagemDias ?? 90,
  };
}

/**
 * Mensagem de WhatsApp pedindo a avaliação no Google (modelo editável em Configurações). Variável sem valor não é
 * apagada em silêncio: sem o link de avaliação ou sem telefone, devolve o que falta para a tela avisar.
 */
export async function obterPedidoDeAvaliacao(obra: Pick<ObraDetalhe, "cliente" | "nomeFantasia" | "linkAvaliacaoGoogle">): Promise<{ link: string | null; texto: string | null; faltando: string[] }> {
  const modelo = await prisma.modeloTexto.findFirst({ where: { chave: "whatsapp.pedido_avaliacao_google", ativo: true, deletadoEm: null }, select: { conteudo: true } });
  if (!modelo) return { link: null, texto: null, faltando: ["modelo de texto"] };
  const { texto, faltando } = preencherModelo(modelo.conteudo, {
    cliente: primeiroNome(obra.cliente.nome),
    nomeFantasia: obra.nomeFantasia ?? undefined,
    linkAvaliacao: obra.linkAvaliacaoGoogle ?? undefined,
  });
  const telefone = obra.cliente.whatsapp || obra.cliente.telefone;
  if (!telefone) faltando.push("telefone do cliente");
  return { link: faltando.length === 0 && telefone ? linkWhatsApp(telefone, texto) : null, texto, faltando };
}

export async function listarMotivosDeBloqueio() {
  return prisma.motivoBloqueio.findMany({ where: { ativo: true, deletadoEm: null }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true, justificado: true } });
}

export async function listarEquipesAtivas() {
  return prisma.equipe.findMany({ where: { ativo: true, deletadoEm: null }, orderBy: { nome: "asc" }, select: { id: true, nome: true } });
}
