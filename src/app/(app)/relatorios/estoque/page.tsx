import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { ComoECalculado } from "@/components/relatorios/como-e-calculado";
import { lerVisao, NavegacaoDeVisoes, type Visao } from "@/components/relatorios/navegacao-de-visoes";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { exigirModulo } from "@/lib/auth/modulo";
import { permissoesDe } from "@/lib/permissoes";
import { CORTES_ABC_PADRAO, lerCortesAbc, type CortesAbc } from "@/lib/dominio/relatorio-estoque";
import { formatarMoeda } from "@/lib/formatadores";
import { montarConsulta } from "@/lib/listas/parametros";
import { SIGLA_UNIDADE, type UNIDADES } from "@/modules/produtos/schemas";
import { BotaoImprimir } from "@/modules/relatorios/components/botao-imprimir";
import { carregarRelatorioDeEstoque, LIMITE_DE_FORNECEDORES, lerPeriodoDoRelatorioDeEstoque, type PeriodoDeCompras } from "@/modules/relatorios/estoque";
import { curvaAbcDeSaidas, LIMITE_DE_LINHAS_DE_ESTOQUE, variacaoDeCustoDosInsumos } from "@/modules/relatorios/estoque-analises";

export const metadata: Metadata = { title: "Estoque e compras" };

const VISOES = [
  { valor: "posicao", titulo: "Posição do estoque" },
  { valor: "fornecedores", titulo: "Compras por fornecedor" },
  { valor: "abc", titulo: "Curva ABC das saídas" },
  { valor: "custos", titulo: "Variação de custo" },
] as const satisfies readonly Visao[];

const DESCRICAO: Record<string, string> = {
  posicao: "Posição do estoque hoje, retalhos e sucata. Produto sem custo fica fora do valor: nunca entra como zero.",
  fornecedores: "O que se recebeu de cada fornecedor no período.",
  abc: "Quais produtos concentram o valor que saiu do estoque para as obras no período.",
  custos: "Quais insumos mudaram de custo no período e quanto.",
};

const br = (d: string) => d.split("-").reverse().join("/");
const qtd = (milesimos: number) => (milesimos / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const estiloData = "border-input bg-background h-9 rounded-lg border px-2.5 text-sm";
const th = "px-3 py-2";
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PaginaRelatorioDeEstoque({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sessao = await exigirModulo(["RELATORIOS", "ESTOQUE"]);
  // Fase 7C: sem "ver custo e margem" só a posição (quantidades, mínimo, retalhos e sucata). Valor do estoque, custo, compras por
  // fornecedor, curva ABC e variação de custo ficam escondidos (a visão pedida pelo endereço cai na posição).
  const verCusto = permissoesDe(sessao).verCustoMargem;
  const visoesVisiveis = verCusto ? VISOES : VISOES.filter((v) => v.valor === "posicao");
  const brutos = await searchParams;
  const periodo = lerPeriodoDoRelatorioDeEstoque(brutos);
  const visao = lerVisao(brutos.visao, visoesVisiveis);
  const cortes = lerCortesAbc(um(brutos.a), um(brutos.b));
  const doPeriodo = { de: periodo.de, ate: periodo.ate };
  const extras: Record<string, string> = visao === "abc" ? { a: String(cortes.a), b: String(cortes.b) } : {};
  const consulta = montarConsulta({ ...doPeriodo, ...extras, visao });

  return (
    <>
      <p className="mb-2 text-sm print:hidden">
        <Link href="/relatorios" className="text-muted-foreground hover:underline">
          ← Relatórios
        </Link>
      </p>
      <CabecalhoPagina
        titulo="Estoque e compras"
        descricao={DESCRICAO[visao]}
        acoes={
          <>
            <BotaoImprimir />
            <a href={`/api/exportar/relatorios/estoque${consulta}`} className={buttonVariants({ variant: "outline" })}>
              <Download aria-hidden /> Exportar CSV
            </a>
          </>
        }
      />
      {visoesVisiveis.length > 1 ? <NavegacaoDeVisoes visoes={visoesVisiveis} atual={visao} parametros={{ ...doPeriodo, ...extras }} rotulo="Visões do relatório de estoque" /> : null}
      {visao === "posicao" ? <VisaoPosicao periodo={periodo} verCusto={verCusto} /> : null}
      {visao === "fornecedores" ? <VisaoFornecedores periodo={periodo} /> : null}
      {visao === "abc" ? <VisaoAbc periodo={periodo} cortes={cortes} /> : null}
      {visao === "custos" ? <VisaoCustos periodo={periodo} /> : null}
    </>
  );
}

function FiltroDePeriodo({ periodo, visao, extras }: { periodo: PeriodoDeCompras; visao: string; extras?: React.ReactNode }) {
  return (
    <form method="get" action="/relatorios/estoque" role="search" className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
      <input type="hidden" name="visao" value={visao} />
      <label className="grid gap-1 text-xs">
        <span className="text-muted-foreground">De</span>
        <input type="date" name="de" defaultValue={periodo.de} className={estiloData} />
      </label>
      <label className="grid gap-1 text-xs">
        <span className="text-muted-foreground">Até</span>
        <input type="date" name="ate" defaultValue={periodo.ate} className={estiloData} />
      </label>
      {extras}
      <Button type="submit" variant="secondary" className="h-9">
        Aplicar
      </Button>
    </form>
  );
}

async function VisaoPosicao({ periodo, verCusto }: { periodo: PeriodoDeCompras; verCusto: boolean }) {
  const r = await carregarRelatorioDeEstoque(periodo);
  const comSaldo = r.linhas.filter((l) => l.saldoMilesimos !== 0);
  const abaixoSemSaldo = r.linhas.filter((l) => l.abaixoDoMinimo && l.saldoMilesimos === 0);
  return (
    <>
      {r.truncado ? (
        <p role="alert" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Há produtos demais: o relatório mostra só os primeiros. Use a lista de produtos para o restante.
        </p>
      ) : null}

      <section aria-label="Resumo do estoque" className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {verCusto ? (
          <>
        <div className="rounded-xl border p-4" title="Como é calculado: soma de saldo × custo unitário (último custo) dos produtos com saldo positivo E custo informado. Produto inativo que ainda tem saldo entra, marcado “Inativo”.">
          <p className="text-muted-foreground text-sm">Estoque valorizado</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatarMoeda(r.posicao.valorCentavos)}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {r.posicao.comSaldo - r.posicao.semCusto} produto(s) com saldo e custo{r.inativosComSaldo > 0 ? ` · ${r.inativosComSaldo} inativo(s) com saldo incluído(s)` : ""}
          </p>
        </div>
        <div className="rounded-xl border p-4" title="Produtos com saldo positivo e sem custo informado: ficam fora do valor ao lado, nunca como zero.">
          <p className="text-muted-foreground text-sm">Com saldo e sem custo</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{r.posicao.semCusto}</p>
          <p className="text-muted-foreground mt-1 text-xs">{r.posicao.semCusto > 0 ? "O valor do estoque está incompleto" : "Todos com custo"}</p>
        </div>
          </>
        ) : null}
        <div className="rounded-xl border p-4" title="Só conta produto ativo que tem estoque mínimo definido; campo vazio = sem alerta.">
          <p className="text-muted-foreground text-sm">Abaixo do mínimo</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{r.posicao.abaixoDoMinimo}</p>
          <p className="text-muted-foreground mt-1 text-xs">Só produtos ativos com mínimo definido</p>
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
                    {l.estoqueMinimoMilesimos !== null && l.ativo ? ` · mínimo ${qtd(l.estoqueMinimoMilesimos)}` : ""}
                    {verCusto && l.custoUnitarioCentavos !== null ? ` · custo ${formatarMoeda(l.custoUnitarioCentavos)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 sm:justify-end">
                  {!l.ativo ? <Badge variant="outline">Inativo</Badge> : null}
                  {l.abaixoDoMinimo ? <Badge variant="destructive">Abaixo do mínimo</Badge> : null}
                  {l.saldoMilesimos < 0 ? <Badge variant="outline">Saldo negativo</Badge> : null}
                  {!verCusto ? null : l.valorCentavos !== null ? <span className="font-medium tabular-nums">{formatarMoeda(l.valorCentavos)}</span> : l.saldoMilesimos > 0 ? <Badge variant="outline">Sem custo</Badge> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {abaixoSemSaldo.length > 0 ? (
          <p className="text-muted-foreground text-xs">Também abaixo do mínimo, sem saldo: {abaixoSemSaldo.map((l) => `${l.codigo} ${l.descricao}`).join("; ")}.</p>
        ) : null}
      </section>
      {verCusto ? (
      <ComoECalculado texto="Estoque valorizado = saldo × último custo de cada produto com saldo positivo e custo informado. Produto sem custo fica fora do valor e é contado à parte; produto inativo que ainda tem saldo entra, marcado “Inativo”, e não gera alerta de mínimo." />
      ) : null}
    </>
  );
}

async function VisaoFornecedores({ periodo }: { periodo: PeriodoDeCompras }) {
  const r = await carregarRelatorioDeEstoque(periodo);
  return (
    <>
      <FiltroDePeriodo periodo={periodo} visao="fornecedores" />
      <p className="text-muted-foreground mb-3 text-xs">
        Recebido de {br(periodo.de)} a {br(periodo.ate)} · {r.comprasNoPeriodo} compra(s)
      </p>
      {r.fornecedoresTruncado ? (
        <p role="alert" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          A lista mostra só os {LIMITE_DE_FORNECEDORES} fornecedores com mais valor. Escolha um período menor para ver os outros.
        </p>
      ) : null}
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
      <ComoECalculado className="mt-3" texto="Valor congelado dos itens recebidos no período (pela data do recebimento), somado por fornecedor da compra. Item recebido sem preço conta à parte, nunca como zero. Não é o que foi pago: a conta a pagar não entra." />
    </>
  );
}

async function VisaoAbc({ periodo, cortes }: { periodo: PeriodoDeCompras; cortes: CortesAbc }) {
  const curva = await curvaAbcDeSaidas(periodo, cortes);
  const resumo = (c: "A" | "B" | "C") => curva.linhas.filter((l) => l.classe === c);
  const fora = periodo.de > periodo.ate;
  return (
    <>
      <FiltroDePeriodo
        periodo={periodo}
        visao="abc"
        extras={
          <>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">Classe A cobre (%)</span>
              <input type="number" name="a" min={1} max={98} defaultValue={cortes.a} className={`${estiloData} w-24`} />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">Classe B cobre (%)</span>
              <input type="number" name="b" min={1} max={98} defaultValue={cortes.b} className={`${estiloData} w-24`} />
            </label>
          </>
        }
      />
      <p className="text-muted-foreground mb-3 text-xs">
        Saídas de {br(periodo.de)} a {br(periodo.ate)} · cortes {cortes.a}% / {cortes.b}% / {100 - cortes.a - cortes.b}% — a confirmar com o Marcelo
        {cortes.a !== CORTES_ABC_PADRAO.a || cortes.b !== CORTES_ABC_PADRAO.b ? (
          <>
            {" "}
            · <Link href={`?${montarConsulta({ de: periodo.de, ate: periodo.ate, visao: "abc" }).slice(1)}`} className="underline">voltar ao padrão (80 / 15 / 5)</Link>
          </>
        ) : null}
      </p>
      {curva.semCusto > 0 ? (
        <p role="status" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {curva.semCusto} saída(s) de {curva.semCustoProdutos} produto(s) não têm custo informado e ficaram fora do valor (não entram como zero).
        </p>
      ) : null}
      {curva.linhas.length === 0 && !fora ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">Nenhuma saída de estoque com valor neste período</p>
          <p className="text-muted-foreground mt-1 text-sm">Quando material sair do estoque para uma obra, ele aparece aqui.</p>
        </div>
      ) : (
        <>
          <section aria-label="Resumo da curva" className="mb-4 grid grid-cols-3 gap-3">
            {(["A", "B", "C"] as const).map((c) => (
              <div key={c} className="rounded-xl border p-3">
                <p className="text-muted-foreground text-xs">Classe {c}</p>
                <p className="text-xl font-semibold tabular-nums">{resumo(c).length}</p>
                <p className="text-muted-foreground text-xs">produto(s) · {formatarMoeda(resumo(c).reduce((s, l) => s + l.valorCentavos, 0))}</p>
              </div>
            ))}
          </section>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <caption className="sr-only">Curva ABC das saídas de estoque</caption>
              <thead className="bg-muted/50 text-left text-xs">
                <tr>
                  <th scope="col" className={th}>Classe</th>
                  <th scope="col" className={th}>Produto</th>
                  <th scope="col" className={`${th} text-right`}>Quantidade</th>
                  <th scope="col" className={`${th} text-right`}>Valor</th>
                  <th scope="col" className={`${th} text-right`}>% do total</th>
                  <th scope="col" className={`${th} text-right`}>Acumulado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {curva.linhas.map((l) => (
                  <tr key={l.produtoId}>
                    <td className="px-3 py-2 font-medium">{l.classe}</td>
                    <td className="px-3 py-2">
                      <Link href={`/produtos/${l.produtoId}`} className="hover:underline">
                        {l.codigo} · {l.descricao}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {qtd(l.quantidadeMilesimos)} {SIGLA_UNIDADE[l.unidade as (typeof UNIDADES)[number]] ?? ""}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(l.valorCentavos)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.percentual.toLocaleString("pt-BR")}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.acumulado.toLocaleString("pt-BR")}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <ComoECalculado className="mt-3" texto={`Valor que saiu do estoque para obras no período = saídas − devoluções (estornos incluídos), pelo custo de cada movimento na época. Os produtos são ordenados do maior valor para o menor; é A enquanto o acumulado antes do produto for menor que ${cortes.a}% (quem atravessa o corte fica em A), B até ${cortes.a + cortes.b}% e C no resto. Os cortes ${CORTES_ABC_PADRAO.a}/${CORTES_ABC_PADRAO.b}/5 são o padrão, a confirmar com o Marcelo; mude nos campos acima.`} />
    </>
  );
}

async function VisaoCustos({ periodo }: { periodo: PeriodoDeCompras }) {
  const { linhas, truncado } = await variacaoDeCustoDosInsumos(periodo);
  return (
    <>
      <FiltroDePeriodo periodo={periodo} visao="custos" />
      {truncado ? (
        <p role="alert" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          A lista mostra só os {LIMITE_DE_LINHAS_DE_ESTOQUE} primeiros produtos. Escolha um período menor para ver os outros.
        </p>
      ) : null}
      {linhas.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">Nenhum custo mudou neste período</p>
          <p className="text-muted-foreground mt-1 text-sm">Quando um custo for alterado (compra, reajuste, importação ou à mão), ele aparece aqui.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <caption className="sr-only">Variação de custo dos produtos no período</caption>
            <thead className="bg-muted/50 text-left text-xs">
              <tr>
                <th scope="col" className={th}>Produto</th>
                <th scope="col" className={`${th} text-right`}>Custo no começo</th>
                <th scope="col" className={`${th} text-right`}>Custo no fim</th>
                <th scope="col" className={`${th} text-right`}>Variação</th>
                <th scope="col" className={`${th} text-right`}>Mudanças</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {linhas.map((l) => (
                <tr key={l.produtoId}>
                  <td className="px-3 py-2">
                    <Link href={`/produtos/${l.produtoId}`} className="hover:underline">
                      {l.codigo} · {l.descricao}
                    </Link>
                    {!l.ativo ? <Badge variant="outline" className="ml-2">Inativo</Badge> : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.custoInicialCentavos === null ? "sem custo antes" : formatarMoeda(l.custoInicialCentavos)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(l.custoFinalCentavos)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.variacaoPercentual === null ? "sem base" : `${l.variacaoPercentual > 0 ? "+" : l.variacaoPercentual < 0 ? "−" : ""}${Math.abs(l.variacaoPercentual).toLocaleString("pt-BR")}%`}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.mudancas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ComoECalculado className="mt-3" texto="Para cada produto que teve o custo alterado no período (pela data da alteração, horário de São Paulo): custo no começo = o custo anterior da primeira alteração; custo no fim = o novo custo da última. A variação é (fim − começo) ÷ começo. Quando o produto não tinha custo antes, aparece “sem base” (nunca um percentual inventado)." />
    </>
  );
}
