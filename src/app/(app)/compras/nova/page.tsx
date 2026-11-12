import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { FormCompra, type ItemInicial } from "@/modules/compras/components/form-compra";
import { opcoesDeCompra } from "@/modules/compras/queries";

export const metadata: Metadata = { title: "Nova compra" };

/** "produtoId:quantidade,..." (o que falta, vindo da lista de materiais da obra) → itens iniciais. Só produtos que existem. */
async function itensDeMateriais(texto: string | undefined): Promise<ItemInicial[]> {
  if (!texto) return [];
  const pares = texto
    .split(",")
    .slice(0, 100)
    .map((p) => p.split(":"))
    .filter((p) => p.length === 2 && /^[\w-]{1,64}$/.test(p[0]) && /^\d+(\.\d{1,3})?$/.test(p[1]) && Number(p[1]) > 0);
  if (pares.length === 0) return [];
  const produtos = await prisma.produto.findMany({ where: { id: { in: pares.map((p) => p[0]) }, deletadoEm: null }, select: { id: true, codigo: true, descricao: true, unidade: true, custoPorKg: true } });
  const porId = new Map(produtos.map((p) => [p.id, p]));
  return pares.flatMap(([id, q]) => {
    const p = porId.get(id);
    return p ? [{ produto: { id: p.id, rotulo: `${p.codigo} · ${p.descricao}`, unidade: p.unidade, custoPorKg: p.custoPorKg }, descricao: "", unidadeCompra: p.unidade, quantidade: Number(q).toLocaleString("pt-BR", { maximumFractionDigits: 3 }), preco: "" }] : [];
  });
}

/** Medidas de vidro a pedir (ids das medidas da proposta aprovada da obra) → itens com o vão só como REFERÊNCIA (a medida do vidro é digitada). */
async function itensDeVidro(texto: string | undefined, projetoId: string | null): Promise<{ itens: ItemInicial[]; observacao: string }> {
  const ids = (texto ?? "").split(",").filter((i) => /^[\w-]{1,64}$/.test(i)).slice(0, 100);
  if (ids.length === 0 || !projetoId) return { itens: [], observacao: "" };
  const medidas = await prisma.itemPropostaMedida.findMany({
    where: { id: { in: ids }, deletadoEm: null, item: { deletadoEm: null, proposta: { projetoId, status: "APROVADA", deletadoEm: null } } },
    orderBy: [{ itemId: "asc" }, { ordem: "asc" }],
    select: { id: true, larguraMm: true, alturaMm: true, quantidade: true, local: true, item: { select: { id: true, ordem: true, espessuraVidroMm: true, tipoVidroId: true, tipoVidro: { select: { nome: true } } } } },
  });
  const referencia = medidas.map((m) => `item ${m.item.ordem + 1}${m.local ? ` (${m.local})` : ""}: vão ${m.larguraMm} × ${m.alturaMm} mm`);
  return {
    itens: medidas.map((m) => ({
      descricao: `Vidro ${m.item.tipoVidro?.nome ?? ""}${m.item.espessuraVidroMm ? ` ${m.item.espessuraVidroMm} mm` : ""} — item ${m.item.ordem + 1}${m.local ? ` (${m.local})` : ""}`.replace(/\s+/g, " ").trim(),
      produto: null,
      unidadeCompra: "UN",
      quantidade: String(m.quantidade),
      preco: "",
      // O vão NÃO vira medida do vidro: a pessoa digita a medida conferida depois de instalar as esquadrias.
      larguraMm: "",
      alturaMm: "",
      espessuraMm: m.item.espessuraVidroMm ? String(m.item.espessuraVidroMm) : "",
      tipoVidroId: m.item.tipoVidroId ?? "",
      beneficiamentos: "",
      itemPropostaId: m.item.id,
      itemPropostaMedidaId: m.id,
    })),
    observacao: referencia.length ? `Vãos de referência (a medida do vidro é a conferida depois da instalação das esquadrias): ${referencia.join("; ")}.` : "",
  };
}

export default async function PaginaNovaCompra({ searchParams }: { searchParams: Promise<{ obra?: string; tipo?: string; itens?: string; vidros?: string }> }) {
  await exigirSessao();
  const { obra, tipo, itens: itensTexto, vidros: vidrosTexto } = await searchParams;
  const opcoes = await opcoesDeCompra();
  const projeto = obra ? await prisma.projeto.findFirst({ where: { id: obra.slice(0, 64), deletadoEm: null }, select: { id: true, codigo: true, titulo: true } }) : null;
  const deMateriais = await itensDeMateriais(itensTexto);
  const deVidro = tipo === "VIDRO" ? await itensDeVidro(vidrosTexto, projeto?.id ?? null) : { itens: [] as ItemInicial[], observacao: "" };
  const itensIniciais = [...deMateriais, ...deVidro.itens];

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/compras" className="text-muted-foreground hover:underline">
          ← Compras
        </Link>
      </p>
      <CabecalhoPagina titulo="Nova compra" descricao="Pedido de material ou de vidro ao fornecedor. Fornecedor e produto que não existem se cadastram na hora." />
      <div className="max-w-4xl">
        <FormCompra
          opcoes={opcoes}
          inicial={{
            tipo: tipo === "VIDRO" ? "VIDRO" : "MATERIAL",
            // Vidro sob medida é custo direto da obra; o que falta de material normalmente se compra para o estoque (e se baixa na obra).
            destino: tipo === "VIDRO" ? "OBRA" : projeto && itensIniciais.length === 0 ? "OBRA" : "ESTOQUE",
            projeto: projeto ? { id: projeto.id, rotulo: `${projeto.codigo} · ${projeto.titulo}` } : null,
            itens: itensIniciais.length > 0 ? itensIniciais : undefined,
            observacao: deVidro.observacao || (projeto && deMateriais.length > 0 ? `Materiais que faltam para a obra ${projeto.codigo}.` : undefined),
          }}
        />
      </div>
    </>
  );
}
