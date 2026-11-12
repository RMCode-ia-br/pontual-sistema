import { TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ROTULO_GRUPO_DE_CUSTO, type GrupoDeCusto } from "@/lib/dominio/custo-obra";
import { formatarMoeda } from "@/lib/formatadores";

import type { CustoDaObra } from "../queries-custo";
import { SugestaoDeMaoDeObraPorM2 } from "./sugestao-de-mao-de-obra";

const ORDEM: GrupoDeCusto[] = ["COMPRAS_DA_OBRA", "ESTOQUE", "RETALHOS", "OUTRAS_DESPESAS", "MAO_DE_OBRA"];
const pct = (pb: number) => `${(pb / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/**
 * Aba "Custo e margem" da obra (R15). Mostra de ONDE vem cada parcela do custo (com link), a receita da margem (valor fechado menos o
 * acréscimo de nota, que é repasse de imposto e fica de fora) e a margem, que é "Incompleta" (nunca zero) quando falta algum custo.
 */
export function CustoDaObraAba({ c }: { c: CustoDaObra }) {
  const r = c.resultado;
  const faltaMaoDeObra = c.custoMaoDeObraPorM2Centavos === null;

  return (
    <div className="grid max-w-4xl gap-6">
      {r.incompleto ? (
        <section role="alert" className="grid gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm" aria-label="Margem incompleta">
          <p className="flex items-center gap-2 font-medium">
            <TriangleAlert className="size-4" aria-hidden /> Margem incompleta: falta custo para calcular
          </p>
          <ul className="list-disc pl-5">
            {r.faltando.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">O sistema não completa o que não sabe: o que falta fica de fora da conta e a margem não é mostrada como se estivesse certa.</p>
        </section>
      ) : null}

      <section aria-labelledby="titulo-margem" className="grid gap-3 rounded-xl border p-4">
        <h2 id="titulo-margem" className="font-medium">
          Margem da obra
        </h2>
        {c.propostas.length === 0 ? (
          <p className="text-muted-foreground text-sm">A obra ainda não tem proposta aprovada: sem valor fechado não há receita nem margem.</p>
        ) : (
          <dl className="grid gap-2 text-sm">
            <Linha rotulo={`Valor fechado (${c.propostas.join(", ")})`} valor={c.receitaFechadaCentavos !== null ? formatarMoeda(c.receitaFechadaCentavos) : "—"} />
            {r.repasseDeImpostoCentavos > 0 ? <Linha rotulo="(−) Repasse de imposto: acréscimo de nota, fora da margem" valor={`− ${formatarMoeda(r.repasseDeImpostoCentavos)}`} suave /> : null}
            <Linha rotulo="Receita da margem" valor={r.receitaDaMargemCentavos !== null ? formatarMoeda(r.receitaDaMargemCentavos) : "—"} forte />
            <Linha rotulo={r.incompleto ? "(−) Custo conhecido até agora" : "(−) Custo real"} valor={`− ${formatarMoeda(r.custoConhecidoCentavos)}`} />
            <div className="flex items-baseline justify-between gap-2 border-t pt-2 text-base font-semibold">
              <dt>Margem</dt>
              <dd className="tabular-nums">
                {r.margemCentavos !== null ? (
                  <>
                    {formatarMoeda(r.margemCentavos)}
                    {r.margemPb !== null ? <span className="text-muted-foreground ml-2 text-sm font-normal">({pct(r.margemPb)})</span> : null}
                  </>
                ) : (
                  <Badge variant="outline">Incompleta</Badge>
                )}
              </dd>
            </div>
            {r.incompleto && r.margemComOQueSeSabeCentavos !== null ? <p className="text-muted-foreground text-xs">Só como referência, com o custo conhecido até agora: {formatarMoeda(r.margemComOQueSeSabeCentavos)}.</p> : null}
            {r.estimadoCentavos !== null ? (
              <p className="text-muted-foreground text-xs">
                Estimado na proposta (material): {formatarMoeda(r.estimadoCentavos)}
                {r.diferencaParaEstimadoCentavos !== null ? ` · material real ${r.diferencaParaEstimadoCentavos >= 0 ? "acima" : "abaixo"} do estimado em ${formatarMoeda(Math.abs(r.diferencaParaEstimadoCentavos))}` : ""}.
              </p>
            ) : null}
          </dl>
        )}
        <p className="text-muted-foreground text-xs">Nenhuma alíquota entra aqui: o acréscimo de nota é repasse de imposto e sai da receita da margem. O imposto pago (DAS) é despesa da empresa, no financeiro.</p>
      </section>

      <section aria-labelledby="titulo-origem" className="grid gap-4">
        <h2 id="titulo-origem" className="font-medium">
          De onde vem cada custo
        </h2>
        {ORDEM.map((g) => {
          const linhas = c.linhas.filter((l) => l.grupo === g);
          if (linhas.length === 0) return null;
          const soma = linhas.filter((l) => !l.informativo).reduce((s, l) => s + (l.valorCentavos ?? 0), 0);
          return (
            <div key={g} className="grid gap-2">
              <p className="flex items-baseline justify-between gap-2 text-sm font-medium">
                <span>{ROTULO_GRUPO_DE_CUSTO[g]}</span>
                {g !== "RETALHOS" ? <span className="tabular-nums">{formatarMoeda(soma)}</span> : null}
              </p>
              <ul className="grid gap-1.5">
                {linhas.map((l, n) => (
                  <li key={`${g}-${n}`} className="grid gap-0.5 rounded-lg border px-3 py-2 text-sm sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-4">
                    <div>
                      <p>{l.href ? <Link href={l.href} className="hover:underline">{l.descricao}</Link> : l.descricao}</p>
                      <p className="text-muted-foreground text-xs">{l.origem}</p>
                    </div>
                    <p className="tabular-nums sm:text-right">{l.informativo ? <span className="text-muted-foreground">R$ 0,00 (informativo)</span> : l.valorCentavos === null ? <Badge variant="outline">Sem custo</Badge> : formatarMoeda(l.valorCentavos)}</p>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {c.linhas.every((l) => l.grupo === "MAO_DE_OBRA") ? <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">Nenhuma compra, saída de estoque ou despesa registrada para esta obra ainda.</p> : null}
      </section>

      {c.contasDeComprasIgnoradas.quantidade > 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-xs">
          {c.contasDeComprasIgnoradas.quantidade} conta(s) a pagar ({formatarMoeda(c.contasDeComprasIgnoradas.valorCentavos)}) nasceram de compras desta obra. Elas <strong>não entram</strong> no custo: a compra recebida já conta, e somar as duas seria contar o mesmo custo duas vezes.
        </p>
      ) : null}

      {faltaMaoDeObra ? (
        <section aria-labelledby="titulo-mao" className="grid gap-2 rounded-xl border p-4">
          <h2 id="titulo-mao" className="font-medium">
            Mão de obra: custo por m² não informado
          </h2>
          <p className="text-muted-foreground text-sm">
            Sem o custo de mão de obra por m², a margem de toda obra fica incompleta. Defina em <Link href="/configuracoes/empresa" className="underline">Configurações → Empresa</Link> ou peça uma sugestão pelos salários.
          </p>
          <SugestaoDeMaoDeObraPorM2 />
        </section>
      ) : null}
    </div>
  );
}

function Linha({ rotulo, valor, forte = false, suave = false }: { rotulo: string; valor: string; forte?: boolean; suave?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${forte ? "font-medium" : ""} ${suave ? "text-muted-foreground" : ""}`}>
      <dt>{rotulo}</dt>
      <dd className="tabular-nums">{valor}</dd>
    </div>
  );
}
