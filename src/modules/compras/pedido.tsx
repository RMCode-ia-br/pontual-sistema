import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";

import { prisma } from "@/lib/db";
import { formatarQuantidade } from "@/lib/dominio/estoque";
import { linkWhatsApp } from "@/lib/dominio/modelos-texto";
import { montarTextoDoPedido } from "@/lib/dominio/texto-pedido-compra";
import { formatarDataCalendario, formatarMoeda } from "@/lib/formatadores";
import { carregarLogo } from "@/modules/propostas/pdf/gerar";

import { PedidoPdf, type DadosDoPedidoPdf } from "./pdf/pedido-pdf";
import type { CompraDetalhe } from "./queries";

const unidade = (u: string) => u.toLowerCase();

function detalheDoItem(i: CompraDetalhe["itens"][number]): string | null {
  const partes = [i.larguraMm && i.alturaMm ? `${i.larguraMm} × ${i.alturaMm} mm` : null, i.espessuraMm ? `${i.espessuraMm} mm` : null, i.tipoVidro, i.beneficiamentos, i.produtoId && i.descricao ? i.descricao : null].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : null;
}

/** Dados do pedido para o PDF, com o nome e os dados da empresa lidos de Configurações (nada fixo no código). */
export async function dadosDoPedidoPdf(c: CompraDetalhe): Promise<{ dados: DadosDoPedidoPdf; logoCaminho: string | null }> {
  const cfg = await prisma.configuracaoEmpresa.findUnique({ where: { id: "singleton" } });
  const itens = c.itens.map((i) => ({
    ordem: i.ordem,
    descricao: i.produto ?? i.descricao ?? "Item",
    detalhe: detalheDoItem(i),
    quantidade: formatarQuantidade(i.quantidadeMilesimos),
    unidade: unidade(i.unidadeCompra),
    precoCentavos: i.precoUnitarioCentavos,
    subtotalCentavos: i.precoUnitarioCentavos === null ? null : Math.round((i.quantidadeMilesimos * i.precoUnitarioCentavos) / 1000),
  }));
  return {
    logoCaminho: cfg?.logoCaminho ?? null,
    dados: {
      numero: c.numero,
      data: (c.dataPedido ?? new Date().toISOString().slice(0, 10)),
      fornecedor: c.fornecedor,
      empresa: { nomeFantasia: cfg?.nomeFantasia ?? null, razaoSocial: cfg?.razaoSocial ?? null, corPrimaria: cfg?.corPrimaria ?? null, cnpj: cfg?.cnpj ?? null, endereco: cfg?.endereco ?? null, cidade: cfg?.cidade ?? null, uf: cfg?.uf ?? null, cep: cfg?.cep ?? null, telefone: cfg?.telefone ?? null, email: cfg?.emailContato ?? null },
      previsaoEntrega: c.previsaoEntrega,
      condicoes: c.condicoes,
      observacao: c.observacao,
      itens,
      totalCentavos: c.totalCentavos,
      itensSemPreco: c.itensSemPreco,
    },
  };
}

export async function gerarPdfDoPedido(c: CompraDetalhe): Promise<Buffer> {
  const { dados, logoCaminho } = await dadosDoPedidoPdf(c);
  const logo = await carregarLogo(logoCaminho);
  return renderToBuffer(<PedidoPdf d={dados} logo={logo} />);
}

/** Texto e link do WhatsApp do pedido (o link só existe se o fornecedor tem telefone válido). */
export async function mensagemDoPedido(c: CompraDetalhe): Promise<{ texto: string; link: string | null }> {
  const cfg = await prisma.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { nomeFantasia: true } });
  const texto = montarTextoDoPedido({
    empresa: cfg?.nomeFantasia ?? null,
    fornecedor: c.fornecedor,
    numero: c.numero,
    itens: c.itens.map((i) => ({
      descricao: i.produto ?? i.descricao ?? "Item",
      quantidade: formatarQuantidade(i.quantidadeMilesimos),
      unidade: unidade(i.unidadeCompra),
      detalhe: detalheDoItem(i),
      preco: i.precoUnitarioCentavos === null ? null : formatarMoeda(i.precoUnitarioCentavos),
    })),
    previsaoEntrega: c.previsaoEntrega ? formatarDataCalendario(c.previsaoEntrega) : null,
    condicoes: c.condicoes,
    observacao: c.observacao,
  });
  return { texto, link: c.fornecedorTelefone ? linkWhatsApp(c.fornecedorTelefone, texto) : null };
}
