import "server-only";

import { prisma } from "@/lib/db";
import { faixaDeVencimento, montarAging, type ItemDeAging, type ResultadoDeAging } from "@/lib/dominio/aging";
import { situacaoDoTitulo } from "@/lib/dominio/titulos";

const comoTexto = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export type AgingAReceber = { porCliente: ResultadoDeAging; semVencimentoCentavos: number };

/** Contas a receber em aberto por idade do atraso e faixa de vencimento, por cliente (inadimplência). Aguardando etapa não entra. */
export async function agingDoReceber(hoje: string): Promise<AgingAReceber> {
  const contas = await prisma.contaReceber.findMany({
    where: { deletadoEm: null, status: { in: ["ABERTA", "PARCIAL"] } },
    select: { clienteId: true, status: true, vencimento: true, valorCentavos: true, valorPagoCentavos: true, cliente: { select: { nome: true } } },
  });
  const itens: ItemDeAging[] = [];
  let semVencimento = 0;
  for (const c of contas) {
    const r = situacaoDoTitulo({ status: c.status, vencimento: comoTexto(c.vencimento), valorCentavos: c.valorCentavos, valorPagoCentavos: c.valorPagoCentavos }, hoje);
    const faixa = faixaDeVencimento(r);
    if (!faixa) {
      semVencimento += r.saldoCentavos;
      continue;
    }
    itens.push({ chave: c.clienteId, rotulo: c.cliente.nome, faixa, saldoCentavos: r.saldoCentavos });
  }
  return { porCliente: montarAging(itens), semVencimentoCentavos: semVencimento };
}

export type AgingAPagar = { porFornecedor: ResultadoDeAging; porCategoria: ResultadoDeAging };

/** Contas a pagar em aberto por faixa de vencimento, por fornecedor (ou favorecido) e por categoria. */
export async function agingDoPagar(hoje: string): Promise<AgingAPagar> {
  const contas = await prisma.contaPagar.findMany({
    where: { deletadoEm: null, status: { in: ["ABERTA", "PARCIAL"] } },
    select: {
      fornecedorId: true,
      funcionarioId: true,
      favorecido: true,
      categoriaId: true,
      status: true,
      vencimento: true,
      valorCentavos: true,
      valorPagoCentavos: true,
      fornecedor: { select: { razaoSocial: true, nomeFantasia: true } },
      funcionario: { select: { nome: true } },
      categoria: { select: { nome: true } },
    },
  });
  const porFornecedor: ItemDeAging[] = [];
  const porCategoria: ItemDeAging[] = [];
  for (const c of contas) {
    const r = situacaoDoTitulo({ status: c.status, vencimento: comoTexto(c.vencimento), valorCentavos: c.valorCentavos, valorPagoCentavos: c.valorPagoCentavos }, hoje);
    const faixa = faixaDeVencimento(r);
    if (!faixa) continue;
    const quem = c.fornecedor ? { chave: `f:${c.fornecedorId}`, rotulo: c.fornecedor.nomeFantasia?.trim() || c.fornecedor.razaoSocial } : c.funcionario ? { chave: `p:${c.funcionarioId}`, rotulo: c.funcionario.nome } : c.favorecido ? { chave: `o:${c.favorecido}`, rotulo: c.favorecido } : { chave: "-", rotulo: "Sem favorecido" };
    porFornecedor.push({ ...quem, faixa, saldoCentavos: r.saldoCentavos });
    porCategoria.push({ chave: c.categoriaId ?? "-", rotulo: c.categoria?.nome ?? "Sem categoria", faixa, saldoCentavos: r.saldoCentavos });
  }
  return { porFornecedor: montarAging(porFornecedor), porCategoria: montarAging(porCategoria) };
}
