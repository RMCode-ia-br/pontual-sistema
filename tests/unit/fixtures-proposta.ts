import { calcularTotais, quantidadeTotal } from "@/lib/dominio/preco";
import type { ConteudoProposta, ItemConteudo } from "@/modules/propostas/conteudo";

type ItemEntrada = { descricao: string; valorCentavos: number; tipoDesenho?: string; larguraMm?: number; alturaMm?: number; folhas?: number | null; quantidade?: number; grupo?: string | null; local?: string | null };

/** Conteúdo de impressão de exemplo (dados fictícios) para testar o PDF. */
export function conteudoDeExemplo(itens: ItemEntrada[], opcoes: { nome: string; descontoCentavos?: number }[] = [{ nome: "Opção 1" }], extra: Partial<ConteudoProposta> = {}): ConteudoProposta {
  const comNota = extra.comNotaFiscal ?? false;
  const acrescimoNotaPb = extra.acrescimoNotaPb ?? 500;
  const ids = opcoes.map((_, i) => `op${i + 1}`);
  const base = itens.map((i, k) => ({ opcaoId: "op1", precoTotalCentavos: i.valorCentavos, medidas: [{ larguraMm: i.larguraMm ?? 2000, alturaMm: i.alturaMm ?? 1200, quantidade: i.quantidade ?? 1 }], k }));
  const totais = calcularTotais(
    ids.flatMap((id) => base.map((b) => ({ ...b, opcaoId: id }))),
    opcoes.map((o, i) => ({ id: ids[i], descontoCentavos: o.descontoCentavos ?? 0 })),
    comNota,
    acrescimoNotaPb,
  );
  const grupos = [...new Set(itens.map((i) => i.grupo ?? null))];
  return {
    versao: 1,
    numero: "1157-26",
    revisao: 0,
    parte: "Parte 02",
    data: "2026-11-13",
    geradoEm: "2026-11-13T12:00:00.000Z",
    empresa: {
      nomeFantasia: "Pontual Soluções em Esquadrias e Vidros",
      razaoSocial: "Empresa de Teste",
      cnpj: "00.000.000/0001-00",
      endereco: "Rua de Teste, s/n",
      cidade: "Macaé",
      uf: "RJ",
      cep: "27940-050",
      telefone: "(22) 90000-0000",
      email: "teste@exemplo.com",
      logoCaminho: null,
      corPrimaria: "#1d4ed8",
    },
    cliente: { nome: "Cliente Fictício", documento: null, contato: "Contato Teste", telefone: "(22) 98888-7777", email: "cliente@exemplo.com", enderecoObra: "Rua da Obra, 10 — Bairro — Macaé/RJ" },
    tituloEscopo: "ESCOPO DO SERVIÇO",
    consultor: { nome: "Consultor Teste", cargo: "Gerente Comercial" },
    comNotaFiscal: comNota,
    acrescimoNotaPb,
    exibirValorPorItem: true,
    descricoesMaiusculas: true,
    opcoes: opcoes.map((o, oi) => {
      const t = totais.find((x) => x.opcaoId === ids[oi])!;
      let numero = 0;
      return {
        id: ids[oi],
        nome: o.nome,
        secoes: grupos.map((g) => ({
          grupo: g,
          itens: itens
            .filter((i) => (i.grupo ?? null) === g)
            .map((i): ItemConteudo => ({
              numero: ++numero,
              descricao: i.descricao,
              local: i.local ?? null,
              observacoes: null,
              tipoDesenho: i.tipoDesenho ?? "JANELA_CORRER",
              folhas: i.folhas ?? 2,
              medidas: [{ larguraMm: i.larguraMm ?? 2000, alturaMm: i.alturaMm ?? 1200, quantidade: i.quantidade ?? 1, local: null }],
              quantidade: quantidadeTotal([{ larguraMm: 1, alturaMm: 1, quantidade: i.quantidade ?? 1 }]),
              precoTotalCentavos: i.valorCentavos,
            })),
        })),
        totais: { itensCentavos: t.itensCentavos, descontoCentavos: t.descontoCentavos, acrescimoNotaCentavos: t.acrescimoNotaCentavos, totalCentavos: t.totalCentavos, areaM2: t.areaM2 },
      };
    }),
    prazo: { modo: "POR_ETAPA", totalMinDias: null, totalMaxDias: null, materialDias: 30, execucaoDias: 40, vidrosDias: 20, tipoDias: "UTEIS" },
    validade: { texto: "Até alteração dos fornecedores", ate: null, encerradaPorReajuste: false },
    pagamento: {
      condicaoNome: "50% sinal + 25% + 25%",
      textoLivre: null,
      dadosPagamento: "PIX: dados de teste",
      parcelas: [
        { descricao: "Sinal na confirmação do pedido", percentualPb: 5000, gatilho: "CONFIRMACAO", forma: "PIX", diasApos: null, dataFixa: null, parcelasCartao: null },
        { descricao: "Entrega do material", percentualPb: 2500, gatilho: "ENTREGA_MATERIAL", forma: null, diasApos: null, dataFixa: null, parcelasCartao: null },
        { descricao: "Entrega dos vidros e instalação", percentualPb: 2500, gatilho: "ENTREGA_E_INSTALACAO", forma: null, diasApos: null, dataFixa: null, parcelasCartao: null },
      ],
    },
    notas: ["Este serviço está sob os termos e condições da empresa.", "Não nos responsabilizamos por serviços de alvenaria ou de terceiros.", "Confirmando o pedido, a contratante concorda com os termos desta proposta."],
    ...extra,
  };
}
