import { GraficoDeBarras } from "@/components/relatorios/grafico-de-barras";
import { FAIXAS_DE_VENCIMENTO, type ResultadoDeAging } from "@/lib/dominio/aging";
import { formatarMoeda } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

/** Totais por faixa e, abaixo, uma linha por pessoa/categoria com o que está em cada faixa. Em cartões: cabe no celular. */
export function QuadroDeAging({ titulo, aging, nomeDaColuna }: { titulo: string; aging: ResultadoDeAging; nomeDaColuna: string }) {
  return (
    <section aria-label={titulo} className="grid gap-3">
      <h2 className="font-medium">{titulo}</h2>
      {aging.totalCentavos > 0 ? (
        <GraficoDeBarras
          descricao={`Valor em aberto em cada faixa de ${nomeDaColuna === "Cliente" ? "atraso" : "vencimento"}.`}
          series={[{ chave: "valor", rotulo: "Em aberto (R$)" }]}
          dados={FAIXAS_DE_VENCIMENTO.map((f) => ({ nome: f.rotulo, valor: aging.totaisPorFaixa[f.id] / 100 }))}
          formato="reais"
          rotulosNasBarras
        />
      ) : null}
      <dl className="grid gap-1 rounded-xl border p-4 text-sm">
        {FAIXAS_DE_VENCIMENTO.map((f) => (
          <div key={f.id} className="flex items-center justify-between gap-2">
            <dt className={cn(f.id.startsWith("ATRASO") && "text-destructive")}>{f.rotulo}</dt>
            <dd className="tabular-nums">{formatarMoeda(aging.totaisPorFaixa[f.id])}</dd>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between gap-2 border-t pt-2 font-medium">
          <dt>Total em aberto</dt>
          <dd className="tabular-nums">{formatarMoeda(aging.totalCentavos)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2 font-medium">
          <dt>Total atrasado</dt>
          <dd className={cn("tabular-nums", aging.atrasadoCentavos > 0 && "text-destructive")}>{formatarMoeda(aging.atrasadoCentavos)}</dd>
        </div>
      </dl>

      {aging.linhas.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">Nada em aberto.</p>
      ) : (
        <ul className="grid gap-2">
          {aging.linhas.map((l) => (
            <li key={l.chave} className="grid gap-1 rounded-xl border p-3 text-sm">
              <p className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  <span className="sr-only">{nomeDaColuna}: </span>
                  {l.rotulo}
                </span>
                <span className="font-medium tabular-nums">{formatarMoeda(l.totalCentavos)}</span>
              </p>
              <ul className="text-muted-foreground grid gap-0.5 text-xs sm:grid-cols-2">
                {FAIXAS_DE_VENCIMENTO.filter((f) => l.porFaixa[f.id] > 0).map((f) => (
                  <li key={f.id} className={cn("flex justify-between gap-2", f.id.startsWith("ATRASO") && "text-destructive")}>
                    <span>{f.rotulo}</span>
                    <span className="tabular-nums">{formatarMoeda(l.porFaixa[f.id])}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
