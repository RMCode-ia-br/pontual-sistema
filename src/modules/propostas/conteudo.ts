import type { FormaPagamentoConteudo } from "@/lib/dominio/alternativas-pagamento";
import type { ImagemDoDesenho } from "@/lib/dominio/desenho-item";

/**
 * Conteúdo "de impressão" da proposta: é o que o PDF mostra e o que é CONGELADO (snapshot) ao enviar (R4).
 * Nunca inclui custo, markup, comissões nem observações internas.
 */
export type ItemConteudo = {
  numero: number;
  descricao: string;
  local: string | null;
  observacoes: string | null;
  tipoDesenho: string;
  folhas: number | null;
  medidas: { larguraMm: number; alturaMm: number; quantidade: number; local: string | null }[];
  quantidade: number;
  precoTotalCentavos: number;
  /** Desenho personalizado (imagem). Só existe quando o item tem imagem: sem ela o snapshot é idêntico ao de antes. Referência imutável (caminho + hash). */
  desenhoImagem?: ImagemDoDesenho;
};

export type OpcaoConteudo = {
  id: string;
  nome: string;
  secoes: { grupo: string | null; itens: ItemConteudo[] }[];
  totais: { itensCentavos: number; descontoCentavos: number; acrescimoNotaCentavos: number; totalCentavos: number; areaM2: number };
};

export type ParcelaConteudo = { descricao: string; percentualPb: number; gatilho: string; forma: string | null; diasApos: number | null; dataFixa: string | null; parcelasCartao: number | null };

export type ConteudoProposta = {
  versao: 1;
  numero: string;
  revisao: number;
  parte: string | null;
  data: string;
  geradoEm: string;
  empresa: {
    nomeFantasia: string | null;
    razaoSocial: string | null;
    cnpj: string | null;
    endereco: string | null;
    cidade: string | null;
    uf: string | null;
    cep: string | null;
    telefone: string | null;
    email: string | null;
    logoCaminho: string | null;
    corPrimaria: string | null;
  };
  cliente: { nome: string; documento: string | null; contato: string | null; telefone: string | null; email: string | null; enderecoObra: string | null };
  tituloEscopo: string;
  consultor: { nome: string | null; cargo: string | null };
  comNotaFiscal: boolean;
  acrescimoNotaPb: number;
  exibirValorPorItem: boolean;
  descricoesMaiusculas: boolean;
  opcoes: OpcaoConteudo[];
  prazo: { modo: "NENHUM" | "TOTAL" | "POR_ETAPA"; totalMinDias: number | null; totalMaxDias: number | null; materialDias: number | null; execucaoDias: number | null; vidrosDias: number | null; tipoDias: "UTEIS" | "CORRIDOS" };
  validade: { texto: string | null; ate: string | null; encerradaPorReajuste: boolean };
  pagamento: { condicaoNome: string | null; textoLivre: string | null; dadosPagamento: string | null; parcelas: ParcelaConteudo[] };
  notas: string[];
  /**
   * Formas de pagamento (principal + extras) com o total de cada uma por opção. SÓ existe quando a proposta tem formas extras;
   * sem elas o conteúdo (e o PDF) é o de antes, e snapshots antigos continuam sendo lidos como sempre.
   */
  formasPagamento?: FormaPagamentoConteudo[];
};
