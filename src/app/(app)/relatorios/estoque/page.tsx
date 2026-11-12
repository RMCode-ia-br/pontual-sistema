import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { formatarMoeda } from "@/lib/formatadores";
import { montarConsulta } from "@/lib/listas/parametros";
import { SIGLA_UNIDADE, type UNIDADES } from "@/modules/produtos/schemas";
import { BotaoImprimir } from "@/modules/relatorios/components/botao-imprimir";
import { carregarRelatorioDeEstoque, lerPeriodoDoRelatorioDeEstoque } from "@/modules/relatorios/estoque";

export const metadata: Metadata = { title: "Estoque e compras" };

const br = (d: string) => d.split("-").reverse().join("/");
const qtd = (milesimos: number) => (milesimos / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const estiloData = "border-input bg-background h-9 rounded-lg border px-2.5 text-sm";

export default async function PaginaRelatorioDeEstoque({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSessao();
  const periodo = lerPeriodoDoRelatorioDeEstoque(await searchParams);
  const r = await carregarRelatorioDeEstoque(periodo);
  const consulta = montarConsulta({ de: periodo.de, ate: periodo.ate });
  const comSaldo = r.linhas.filter((l) => l.saldoMilesimos !== 0);
  const abaixoSemSaldo = r.linhas.filter((l) => l.abaixoDoMinimo && l.saldoMilesimos === 0);

  return (
    <>
      <p className="mb-2 text-sm print:hidden">
        <Link href="/relatorios" className="text-muted-foreground hover:underline">
          ← Relatórios
        </Link>
      </p>
      <CabecalhoPagina
        titulo="Estoque e compras"
        descricao="Posição do estoque hoje, retalhos, sucata e o que se recebeu de cada fornecedor no período. Produto sem custo fica fora do valor: nunca entra como zero."
        acoes={
          <>
            <BotaoImprimir />
            <a href={`/api/exportar/relatorios/estoque${consulta}`} className={buttonVariants({ variant: "outline" })}>
              <Download aria-hidden /> Exportar CSV
            </a>
          </>
        }
      />

      {r.truncado ? (
        <p role="alert" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Há produtos demais: o relatório mostra só os primeiros. Use a lista de produtos para o restante.
        </p>
      ) : null}

      <section aria-label="Resumo do estoque" className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border p-4" title="Como é calculado: soma de saldo × custo unitário (último custo) dos produtos com saldo positivo E custo informado.">
          <p className="text-muted-foreground text-sm">Estoque valorizado</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatarMoeda(r.posicao.valorCentavos)}</p>
          <p className="text-muted-foreground mt-1 text-xs">{r.posicao.comSaldo - r.posicao.semCusto} produto(s) com saldo e custo</p>
        </div>
        <div className="rounded-xl border p-4" title="Produtos com saldo positivo e sem custo informado: ficam fora do valor ao lado, nunca como zero.">
          <p className="text-muted-foreground text-sm">Com saldo e sem custo</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{r.posicao.semCusto}</p>
          <p className="text-muted-foreground mt-1 text-xs">{r.posicao.semCusto > 0 ? "O valor do estoque está incompleto" : "Todos com custo"}</p>
        </div>
        <div className="rounded-xl border p-4" title="Só conta produto que tem estoque mínimo definido; campo vazio = sem alerta.">
          <p className="text-muted-foreground text-sm">Abaixo do mínimo</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{r.posicao.abaixoDoMinimo}</p>
          <p className="text-muted-foreground mt-1 text-xs">Só produtos com mínimo definido</p>
        </div>
        <div className="rounded-xl border p-4" title="Retalhos disponíveis para uso em obras e kg de sucata registrados e ainda não vendidos.">
          <p className="text-muted-foreground text-sm">Retalhos e sucata</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{r.retalhosDisponiveis}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            retalho(s) · sucata {qtd(r.sucataMilesimosKg)} kg
            {r.sucataComprimentoSemPesoMm !== 0 ? ` + ${(r.sucataComprimentoSemPesoMm / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m sem peso por metro` : ""}
          </p>
        </div>
      </section>
      {r.posicao.saldoNegativo > 0 ? (
        <p role="status" className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {r.posicao.saldoNegativo} produto(s) com saldo negativo (saída sem saldo confirmada): ficam fora do valor até o estoque ser corrigido.
        </p>
      ) : null}

      <section aria-labelledby="r-posicao" className="mb-8 grid gap-3">
        <h2 id="r-posicao" className="text-lg font-medium">
          Posição do estoque
        </h2>
        {comSaldo.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhum produto com saldo. O estoque começa vazio, sem nada inventado: registre uma entrada, receba uma compra ou faça a{" "}
            <Link href="/estoque/inventario-inicial" className="underline">
              contagem inicial
            </Link>
            .
          </p>
        ) : (
          <ul className="grid gap-2">
            {comSaldo.map((l) => (
              <li key={l.id} className="grid gap-1 rounded-xl border p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
                <div>
                  <Link href={`/produtos/${l.id}`} className="font-medium hover:underline">
                    {l.codigo} · {l.descricao}
                  </Link>
                  <p className="text-muted-foreground text-xs">
                    Saldo {qtd(l.saldoMilesimos)} {SIGLA_UNIDADE[l.unidade as (typeof UNIDADES)[number]]}
                    {l.estoqueMinimoMilesimos !== null ? ` · mínimo ${qtd(l.estoqueMinimoMilesimos)}` : ""}
                    {l.custoUnitarioCentavos !== null ? ` · custo ${formatarMoeda(l.custoUnitarioCentavos)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 sm:justify-end">
                  {l.abaixoDoMinimo ? <Badge variant="destructive">Abaixo do mínimo</Badge> : null}
                  {l.saldoMilesimos < 0 ? <Badge variant="outline">Saldo negativo</Badge> : null}
                  {l.valorCentavos !== null ? <span className="font-medium tabular-nums">{formatarMoeda(l.valorCentavos)}</span> : l.saldoMilesimos > 0 ? <Badge variant="outline">Sem custo</Badge> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {abaixoSemSaldo.length > 0 ? (
          <p className="text-muted-foreground text-xs">Também abaixo do mínimo, sem saldo: {abaixoSemSaldo.map((l) => `${l.codigo} ${l.descricao}`).join("; ")}.</p>
        ) : null}
      </section>

      <section aria-labelledby="r-fornecedores" className="grid gap-3">
        <h2 id="r-fornecedores" className="text-lg font-medium">
          Compras recebidas por fornecedor
        </h2>
        <form method="get" action="/relatorios/estoque" role="search" className="flex flex-wrap items-end gap-2 print:hidden">
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">De</span>
            <input type="date" name="de" defaultValue={periodo.de} className={estiloData} />
          </label>
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Até</span>
            <input type="date" name="ate" defaultValue={periodo.ate} className={estiloData} />
          </label>
          <Button type="submit" variant="secondary" className="h-9">
            Aplicar
          </Button>
        </form>
        <p className="text-muted-foreground text-xs" title="Como é calculado: valor congelado dos itens recebidos no período, por fornecedor da compra. Item recebido sem preço conta à parte.">
          Recebido de {br(periodo.de)} a {br(periodo.ate)} · {r.comprasNoPeriodo} compra(s)
        </p>
        {r.fornecedores.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum recebimento nesse período.</p>
        ) : (
          <ul className="grid gap-2">
            {r.fornecedores.map((f) => (
              <li key={f.fornecedorId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
                <span className="font-medium">{f.nome}</span>
                <span className="flex items-center gap-2">
                  {f.semValor > 0 ? <Badge variant="outline">{f.semValor} item(ns) sem preço</Badge> : null}
                  <span className="text-muted-foreground text-xs">{f.itens} item(ns)</span>
                  <span className="font-medium tabular-nums">{formatarMoeda(f.valorCentavos)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
