import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { buttonVariants } from "@/components/ui/button";
import { BotaoImprimir } from "@/modules/relatorios/components/botao-imprimir";
import { Input } from "@/components/ui/input";
import { exigirSessao } from "@/lib/auth/sessao";
import { detalharPorCategoria, linhasDaDemonstracao, montarDre, ROTULO_GRUPO_DRE, TODOS_OS_GRUPOS_DRE } from "@/lib/dominio/dre";
import { dataLocalDoInstante, formatarMoeda } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { AvisoDeSaldoNaoInformado } from "@/modules/financeiro/components/painel-de-contas";
import { listarContasFinanceiras } from "@/modules/financeiro/queries";
import { carregarMovimentosDoDre, lerPeriodoDoDre } from "@/modules/financeiro/queries-dre";
import { contasSemSaldoInformado } from "@/lib/dominio/saldo";

export const metadata: Metadata = { title: "DRE gerencial" };

const NOMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloDoMes = (m: string) => `${NOMES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

export default async function PaginaDoDre({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSessao();
  const hoje = dataLocalDoInstante(new Date());
  const periodo = lerPeriodoDoDre(await searchParams, hoje);
  const [movimentos, contas] = await Promise.all([carregarMovimentosDoDre(periodo), listarContasFinanceiras(hoje)]);
  const dre = montarDre(movimentos, periodo.meses);
  const linhas = linhasDaDemonstracao(dre);
  const detalhe = detalharPorCategoria(movimentos, periodo.meses);
  const semSaldo = contasSemSaldoInformado(contas).map((c) => c.nome);
  const consulta = new URLSearchParams({ de: periodo.de, ate: periodo.ate, regime: periodo.regime }).toString();

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/financeiro" className="text-muted-foreground hover:underline">
          ← Visão geral e fluxo de caixa
        </Link>
      </p>
      <CabecalhoPagina
        titulo="DRE gerencial"
        descricao="Resultado por mês, simplificado. Não é contábil: imposto não é calculado, é a despesa “Impostos (DAS)” lançada à mão."
        acoes={
          <>
            <BotaoImprimir />
            <a href={`/api/exportar/financeiro/dre?${consulta}`} className={buttonVariants({ variant: "outline" })}>
              <Download aria-hidden /> Exportar CSV
            </a>
          </>
        }
      />

      <div className="grid gap-6">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs">
            De
            <Input type="month" name="de" defaultValue={periodo.de} className="w-40" />
          </label>
          <label className="grid gap-1 text-xs">
            Até
            <Input type="month" name="ate" defaultValue={periodo.ate} className="w-40" />
          </label>
          <label className="grid gap-1 text-xs">
            Regime
            <select name="regime" defaultValue={periodo.regime} className="border-input bg-background h-9 rounded-lg border px-2.5 text-sm">
              <option value="caixa">Caixa (pelo que entrou e saiu)</option>
              <option value="competencia">Competência (pelo mês a que se refere)</option>
            </select>
          </label>
          <button type="submit" className={buttonVariants({ variant: "outline" })}>
            Atualizar
          </button>
        </form>

        <AvisoDeSaldoNaoInformado nomes={semSaldo} />
        {semSaldo.length > 0 ? <p className="text-muted-foreground -mt-4 text-sm">O DRE não depende do saldo das contas; o aviso lembra que o caixa ainda não está completo.</p> : null}

        <section aria-labelledby="titulo-dre" className="grid gap-2">
          <h2 id="titulo-dre" className="font-medium">
            {periodo.regime === "caixa" ? "Regime de caixa" : "Regime de competência"}: {rotuloDoMes(periodo.de)} a {rotuloDoMes(periodo.ate)}
          </h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-max text-sm">
              <caption className="sr-only">DRE gerencial por mês</caption>
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th scope="col" className="bg-background sticky left-0 py-2 pr-3 pl-3 font-medium">Linha</th>
                  {periodo.meses.map((m) => (
                    <th key={m} scope="col" className="py-2 pr-3 text-right font-medium">
                      {rotuloDoMes(m)}
                    </th>
                  ))}
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} className={cn("border-b", l.tipo !== "item" && "bg-muted/40 font-medium", l.tipo === "resultado" && "border-t-2")}>
                    <th scope="row" className={cn("sticky left-0 py-2 pr-3 pl-3 text-left font-normal", l.tipo !== "item" ? "bg-muted font-medium" : "bg-background")}>
                      {l.marca ? <span aria-hidden className="text-muted-foreground mr-1">{l.marca}</span> : null}
                      {l.rotulo}
                    </th>
                    {l.porMesCentavos.map((v, i) => (
                      <td key={periodo.meses[i]} className={cn("py-2 pr-3 text-right whitespace-nowrap tabular-nums", v < 0 && l.tipo !== "item" && "text-destructive")}>
                        {formatarMoeda(v)}
                      </td>
                    ))}
                    <td className={cn("py-2 pr-3 text-right font-medium whitespace-nowrap tabular-nums", l.totalCentavos < 0 && l.tipo !== "item" && "text-destructive")}>{formatarMoeda(l.totalCentavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground text-xs">
            Deduções e despesas aparecem como número positivo; o resultado é receitas − impostos − custos − despesas + outras receitas ± o que está sem categoria. Resultado negativo aparece em vermelho com o sinal de menos.
          </p>
        </section>

        <section aria-labelledby="titulo-detalhe" className="grid gap-2">
          <h2 id="titulo-detalhe" className="font-medium">
            Por categoria
          </h2>
          {detalhe.length === 0 ? <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">Nenhum movimento neste período. Registre recebimentos, pagamentos e lançamentos para o DRE aparecer.</p> : null}
          {TODOS_OS_GRUPOS_DRE.map((g) => {
            const itens = detalhe.filter((d) => d.grupo === g);
            if (itens.length === 0) return null;
            return (
              <details key={g} className="rounded-xl border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  {ROTULO_GRUPO_DRE[g]} <span className="text-muted-foreground font-normal">· {formatarMoeda(itens.reduce((s, i) => s + i.totalCentavos, 0))}</span>
                </summary>
                <ul className="mt-2 grid gap-1 text-sm">
                  {itens.map((i) => (
                    <li key={i.categoriaId ?? i.nome} className="flex items-center justify-between gap-2">
                      <span>{i.nome}</span>
                      <span className="tabular-nums">{formatarMoeda(i.totalCentavos)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
          {detalhe.some((d) => d.grupo === null) ? (
            <details className="rounded-xl border p-3" open>
              <summary className="cursor-pointer text-sm font-medium">Sem categoria</summary>
              <p className="text-muted-foreground mt-1 text-xs">Movimentos sem categoria entram no resultado, mas não em nenhum grupo. Categorize-os para o DRE ficar completo.</p>
              <ul className="mt-2 grid gap-1 text-sm">
                {detalhe
                  .filter((d) => d.grupo === null)
                  .map((i) => (
                    <li key={i.categoriaId ?? i.nome} className="flex items-center justify-between gap-2">
                      <span>{i.nome}</span>
                      <span className="tabular-nums">{formatarMoeda(i.totalCentavos)}</span>
                    </li>
                  ))}
              </ul>
            </details>
          ) : null}
        </section>

        <details className="text-muted-foreground text-sm">
          <summary className="cursor-pointer">Como é calculado</summary>
          <div className="mt-2 grid gap-2">
            <p>
              <strong>Caixa (padrão):</strong> soma os lançamentos pela data em que o dinheiro entrou ou saiu. Lançamento estornado e transferência entre contas ficam de fora.
            </p>
            <p>
              <strong>Competência:</strong> soma as contas a receber (pelo vencimento) e a pagar (pelo mês de competência) que não foram canceladas, pelo valor cheio, mais os lançamentos avulsos. Parcelas que ainda aguardam uma etapa (sem vencimento) não entram.
            </p>
            <p>O resultado é sempre entradas − saídas do que foi incluído, então bate com os lançamentos. Os grupos vêm do cadastro de categorias (Configurações → Catálogos).</p>
          </div>
        </details>
      </div>
    </>
  );
}
