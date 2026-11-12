import { Download, Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { FiltroSelect, FiltrosDaLista } from "@/components/lista/filtros-da-lista";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { ROTULO_STATUS_PROJETO, type StatusProjeto } from "@/lib/dominio/funil";
import { formatarMoeda } from "@/lib/formatadores";
import { BotaoImprimir } from "@/modules/relatorios/components/botao-imprimir";
import { carregarMargemDasObras, lerFiltroDeMargem } from "@/modules/relatorios/margem-obras";

export const metadata: Metadata = { title: "Margem por obra" };

const pct = (pb: number) => `${(pb / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export default async function PaginaMargemPorObra({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSessao();
  const filtro = lerFiltroDeMargem(await searchParams);
  const r = await carregarMargemDasObras(filtro);
  const consulta = `?situacao=${filtro.situacao}${filtro.busca ? `&busca=${encodeURIComponent(filtro.busca)}` : ""}`;

  return (
    <>
      <CabecalhoPagina
        titulo="Margem por obra"
        descricao="Receita da margem (valor fechado menos o acréscimo de nota) menos o custo real de cada obra: compras para a obra, material do estoque, despesas da obra e mão de obra rateada."
        acoes={
          <>
            <BotaoImprimir />
            <a href={`/api/exportar/relatorios/margem-obras${consulta}`} className={buttonVariants({ variant: "outline" })}>
              <Download aria-hidden /> Exportar CSV
            </a>
          </>
        }
      />
      <div className="mb-4">
        <FiltrosDaLista base="/relatorios/margem-obras" busca={filtro.busca ?? ""} placeholderBusca="Código, obra ou cliente" filtrado={filtro.situacao !== "andamento" || !!filtro.busca}>
          <FiltroSelect nome="situacao" rotulo="Obras" valor={filtro.situacao === "andamento" ? undefined : filtro.situacao} todos="Em andamento" opcoes={[{ valor: "concluidas", rotulo: "Concluídas" }, { valor: "todas", rotulo: "Todas" }]} />
        </FiltrosDaLista>
      </div>

      <section aria-label="Resumo" className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">Margem das obras completas</p>
          <p className="text-2xl font-semibold tabular-nums">{formatarMoeda(r.totalCompletoCentavos)}</p>
          <p className="text-muted-foreground text-xs">
            {r.completas} obra(s){r.receitaCompletaCentavos > 0 ? ` · ${pct(Math.round((r.totalCompletoCentavos * 10000) / r.receitaCompletaCentavos))} da receita da margem` : ""}
          </p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">Obras com margem incompleta</p>
          <p className="text-2xl font-semibold tabular-nums">{r.incompletas}</p>
          <p className="text-muted-foreground text-xs">Faltam preço, custo ou mão de obra por m²: ficam fora da soma, nunca como zero.</p>
        </div>
        <div className="rounded-xl border p-4 sm:col-span-1">
          <p className="text-muted-foreground text-sm">Como é calculado</p>
          <p className="text-xs">Receita da margem = valor fechado − acréscimo de nota (repasse de imposto). Custo = recebimentos das compras para a obra + saídas do estoque (ao custo da época) + contas e lançamentos da obra sem compra + mão de obra × m². A conta a pagar de uma compra não entra: a compra já conta.</p>
        </div>
      </section>

      {r.linhas.length === 0 ? (
        <EstadoVazio icone={Printer} titulo="Nenhuma obra nesse filtro" descricao="Só obras aprovadas, em execução ou concluídas entram. Troque a situação ou a busca." acao={<Link href="/relatorios/margem-obras?situacao=todas" className={buttonVariants({ variant: "outline" })}>Ver todas</Link>} />
      ) : (
        <ul className="grid gap-2">
          {r.linhas.map((l) => (
            <li key={l.id} className="grid gap-1 rounded-xl border p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
              <div className="grid gap-0.5">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <Link href={`/obras/${l.id}?aba=custo`} className="hover:underline">
                    {l.codigo} · {l.titulo}
                  </Link>
                  <Badge variant="outline">{ROTULO_STATUS_PROJETO[l.status as StatusProjeto]}</Badge>
                </p>
                <p className="text-muted-foreground text-xs">
                  {l.cliente} · receita da margem {l.receitaDaMargemCentavos !== null ? formatarMoeda(l.receitaDaMargemCentavos) : "—"} · custo conhecido {formatarMoeda(l.custoConhecidoCentavos)}
                  {l.repasseDeImpostoCentavos > 0 ? ` · repasse de imposto ${formatarMoeda(l.repasseDeImpostoCentavos)}` : ""}
                </p>
                {l.incompleto ? <p className="text-xs text-amber-700 dark:text-amber-400">Falta: {l.faltando.slice(0, 3).join("; ")}{l.faltando.length > 3 ? `; e mais ${l.faltando.length - 3}` : ""}</p> : null}
              </div>
              <div className="text-right">
                {l.margemCentavos !== null ? (
                  <p className="font-medium tabular-nums">
                    {formatarMoeda(l.margemCentavos)}
                    {l.margemPb !== null ? <span className="text-muted-foreground ml-1 text-xs font-normal">({pct(l.margemPb)})</span> : null}
                  </p>
                ) : (
                  <Badge variant="outline">Incompleta</Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {r.truncado ? <p className="text-muted-foreground mt-3 text-xs">Mostrando as 150 primeiras obras. Use a busca para achar as demais.</p> : null}
    </>
  );
}
