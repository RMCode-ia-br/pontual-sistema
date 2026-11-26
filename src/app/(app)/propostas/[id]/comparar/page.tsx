import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { compararRevisoes, type ConteudoComparavel, type DiferencaItem } from "@/lib/dominio/ciclo-proposta";
import { marcaDoDesenho } from "@/lib/dominio/desenho-item";
import { formatarRevisao } from "@/lib/dominio/numeracao-proposta";
import { formatarMoeda } from "@/lib/formatadores";
import type { ConteudoProposta } from "@/modules/propostas/conteudo";
import { construirConteudo } from "@/modules/propostas/servico-ciclo";

export const metadata: Metadata = { title: "Comparar revisões" };

async function conteudoDe(id: string): Promise<ConteudoProposta | null> {
  const p = await prisma.proposta.findFirst({ where: { id, deletadoEm: null, projeto: { deletadoEm: null } }, select: { status: true, snapshot: true } });
  if (!p) return null;
  // Enviada: o que foi congelado. Rascunho: o estado atual.
  if (p.status !== "RASCUNHO" && p.snapshot) return p.snapshot as unknown as ConteudoProposta;
  return construirConteudo(prisma, id);
}

function paraComparavel(c: ConteudoProposta): ConteudoComparavel {
  return {
    numero: c.numero,
    revisao: c.revisao,
    comNotaFiscal: c.comNotaFiscal,
    formas: (c.formasPagamento ?? []).map((f) => ({ nome: f.nome, totais: f.porOpcao.map((t) => ({ opcaoNome: c.opcoes.find((o) => o.id === t.opcaoId)?.nome ?? "", totalCentavos: t.totalCentavos })) })),
    opcoes: c.opcoes.map((o) => ({
      nome: o.nome,
      totalCentavos: o.totais.totalCentavos,
      itens: o.secoes.flatMap((s) => s.itens).map((i) => ({ descricao: i.descricao, medidas: i.medidas.map((m) => `${m.larguraMm} X ${m.alturaMm}`).join(" / "), precoTotalCentavos: i.precoTotalCentavos, desenho: marcaDoDesenho(i) })),
    })),
  };
}

const ROTULO_DO_DESENHO = { ADICIONADO: "Desenho personalizado adicionado", TROCADO: "Desenho personalizado trocado", REMOVIDO: "Desenho personalizado removido" } as const;

/** Rótulo do item: só o preço mudou ("Preço alterado", como sempre), só o desenho, ou os dois. */
function rotuloDoItem(i: DiferencaItem): string {
  if (i.tipo === "ADICIONADO") return "Novo";
  if (i.tipo === "REMOVIDO") return "Removido";
  const preco = i.antesCentavos !== i.depoisCentavos;
  if (i.desenho && preco) return `Preço alterado · ${ROTULO_DO_DESENHO[i.desenho].toLowerCase()}`;
  return i.desenho ? ROTULO_DO_DESENHO[i.desenho] : "Preço alterado";
}

export default async function PaginaComparar({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ com?: string }> }) {
  await exigirSessao();
  const { id } = await params;
  const { com } = await searchParams;
  if (!com) notFound();
  const [depois, antes] = await Promise.all([conteudoDe(id), conteudoDe(com)]);
  if (!depois || !antes || depois.numero !== antes.numero) notFound();
  const r = compararRevisoes(paraComparavel(antes), paraComparavel(depois));
  const nome = (c: ConteudoProposta) => (c.revisao === 0 ? "original" : formatarRevisao(c.revisao));

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/propostas/${id}`} className="text-muted-foreground hover:underline">
          ← Voltar para a proposta {depois.numero}
        </Link>
      </p>
      <CabecalhoPagina titulo={`Comparar revisões da ${depois.numero}`} descricao={`${nome(antes)} → ${nome(depois)}`} />
      {r.semMudancas ? <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">Nenhuma diferença nos itens, nos totais, nas formas de pagamento nem na nota fiscal.</p> : null}
      {r.notaFiscalMudou ? <p className="mb-4 text-sm">Nota fiscal: <strong>{antes.comNotaFiscal ? "com nota" : "sem nota"}</strong> → <strong>{depois.comNotaFiscal ? "com nota" : "sem nota"}</strong>.</p> : null}
      <div className="grid max-w-3xl gap-4">
        {r.formas.some((f) => f.situacao !== "MANTIDA" || f.mudancas.length > 0) ? (
          <section className="grid gap-2 rounded-xl border p-4" aria-label="Formas de pagamento">
            <h2 className="font-medium">Formas de pagamento</h2>
            <ul className="grid gap-1 text-sm">
              {r.formas
                .filter((f) => f.situacao !== "MANTIDA" || f.mudancas.length > 0)
                .map((f) => (
                  <li key={f.nome} className="flex flex-wrap items-baseline justify-between gap-2 border-t pt-1 first:border-t-0 first:pt-0">
                    <span>
                      <Badge variant={f.situacao === "REMOVIDA" ? "destructive" : "secondary"}>{f.situacao === "NOVA" ? "Nova forma" : f.situacao === "REMOVIDA" ? "Forma removida" : "Total alterado"}</Badge> {f.nome}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {f.mudancas.map((m, k) => (
                        <span key={k} className="ml-2">
                          {r.opcoes.length > 1 && m.opcaoNome ? `${m.opcaoNome}: ` : ""}
                          {m.antesCentavos === null ? "" : formatarMoeda(m.antesCentavos)}
                          {m.antesCentavos !== null && m.depoisCentavos !== null ? " → " : ""}
                          {m.depoisCentavos === null ? "" : formatarMoeda(m.depoisCentavos)}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        ) : null}
        {r.opcoes.map((o) => (
          <section key={o.nome} className="grid gap-2 rounded-xl border p-4" aria-label={`Opção ${o.nome}`}>
            <h2 className="flex flex-wrap items-center gap-2 font-medium">
              {o.nome}
              {o.situacao !== "MANTIDA" ? <Badge variant={o.situacao === "NOVA" ? "default" : "destructive"}>{o.situacao === "NOVA" ? "Opção nova" : "Opção removida"}</Badge> : null}
            </h2>
            <p className="text-sm">
              Total: {o.totalAntesCentavos === null ? "—" : formatarMoeda(o.totalAntesCentavos)} → <strong>{o.totalDepoisCentavos === null ? "—" : formatarMoeda(o.totalDepoisCentavos)}</strong>
              {o.totalAntesCentavos !== null && o.totalDepoisCentavos !== null && o.totalAntesCentavos !== o.totalDepoisCentavos ? ` (${o.totalDepoisCentavos > o.totalAntesCentavos ? "+" : "−"}${formatarMoeda(Math.abs(o.totalDepoisCentavos - o.totalAntesCentavos))})` : ""}
            </p>
            {o.itens.length > 0 ? (
              <ul className="grid gap-1 text-sm">
                {o.itens.map((i, k) => (
                  <li key={k} className="flex flex-wrap items-baseline justify-between gap-2 border-t pt-1">
                    <span>
                      <Badge variant={i.tipo === "REMOVIDO" ? "destructive" : "secondary"}>{rotuloDoItem(i)}</Badge> {i.descricao}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {i.antesCentavos === null ? "" : formatarMoeda(i.antesCentavos)}
                      {i.antesCentavos !== null && i.depoisCentavos !== null && i.antesCentavos !== i.depoisCentavos ? " → " : ""}
                      {i.depoisCentavos === null || i.antesCentavos === i.depoisCentavos ? "" : formatarMoeda(i.depoisCentavos)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </>
  );
}
