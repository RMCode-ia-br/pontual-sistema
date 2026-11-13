import "server-only";

import { prisma } from "@/lib/db";
import type { Periodo } from "@/lib/periodo";

import { ondeRecebimentos, type FiltroDeNota } from "./recebimentos";

export const TAMANHO_DA_PAGINA_DE_RECEBIMENTOS = 50;
export const LIMITE_DO_CSV_DE_RECEBIMENTOS = 5000;

export type LinhaDeRecebimento = {
  id: string;
  data: Date;
  valorCentavos: number;
  comNotaFiscal: boolean;
  forma: string | null;
  descricao: string;
  contaReceberId: string;
  cliente: string | null;
  obra: string | null;
  obraId: string | null;
  conta: string | null;
};

const selecao = {
  id: true,
  data: true,
  valorCentavos: true,
  comNotaFiscal: true,
  forma: true,
  descricao: true,
  contaReceberId: true,
  cliente: { select: { nome: true } },
  projeto: { select: { id: true, codigo: true, titulo: true } },
  contaFinanceira: { select: { nome: true } },
} as const;

type Encontrado = Awaited<ReturnType<typeof buscar>>[number];
const buscar = (where: ReturnType<typeof ondeRecebimentos>, skip: number, take: number) =>
  prisma.lancamento.findMany({ where, orderBy: [{ data: "desc" }, { criadoEm: "desc" }, { id: "asc" }], skip, take, select: selecao });

const paraLinha = (x: Encontrado): LinhaDeRecebimento => ({
  id: x.id,
  data: x.data,
  valorCentavos: x.valorCentavos,
  comNotaFiscal: x.comNotaFiscal,
  forma: x.forma,
  descricao: x.descricao,
  contaReceberId: x.contaReceberId!,
  cliente: x.cliente?.nome ?? null,
  obra: x.projeto ? `${x.projeto.codigo} · ${x.projeto.titulo}` : null,
  obraId: x.projeto?.id ?? null,
  conta: x.contaFinanceira.nome,
});

/** Uma página dos recebimentos do período (a lista que explica "Recebido" e o faturamento com nota), com o total do filtro. */
export async function listarRecebimentos(p: Periodo, nota: FiltroDeNota | undefined, pagina: number): Promise<{ linhas: LinhaDeRecebimento[]; total: number; somaCentavos: number; paginas: number; pagina: number }> {
  const where = ondeRecebimentos(p, nota);
  const [total, soma] = await Promise.all([prisma.lancamento.count({ where }), prisma.lancamento.aggregate({ where, _sum: { valorCentavos: true } })]);
  const paginas = Math.max(1, Math.ceil(total / TAMANHO_DA_PAGINA_DE_RECEBIMENTOS));
  const atual = Math.min(Math.max(1, pagina), paginas);
  const encontrados = await buscar(where, (atual - 1) * TAMANHO_DA_PAGINA_DE_RECEBIMENTOS, TAMANHO_DA_PAGINA_DE_RECEBIMENTOS);
  return { linhas: encontrados.map(paraLinha), total, somaCentavos: soma._sum.valorCentavos ?? 0, paginas, pagina: atual };
}

/** Os recebimentos para o CSV (até o limite; `truncado` avisa quando passou). */
export async function recebimentosParaCsv(p: Periodo, nota: FiltroDeNota | undefined): Promise<{ linhas: LinhaDeRecebimento[]; truncado: boolean }> {
  const encontrados = await buscar(ondeRecebimentos(p, nota), 0, LIMITE_DO_CSV_DE_RECEBIMENTOS + 1);
  return { linhas: encontrados.slice(0, LIMITE_DO_CSV_DE_RECEBIMENTOS).map(paraLinha), truncado: encontrados.length > LIMITE_DO_CSV_DE_RECEBIMENTOS };
}

/** Lê o filtro de nota da URL. */
export function lerFiltroDeNota(valor: string | string[] | undefined): FiltroDeNota | undefined {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return v === "com" || v === "sem" ? v : undefined;
}
