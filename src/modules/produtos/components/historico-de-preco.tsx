import { History } from "lucide-react";

import { EstadoVazio } from "@/components/layout/estado-vazio";
import { formatarDataHora, formatarMoeda } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

import type { ItemDoHistorico } from "../queries";

const ROTULO_ORIGEM = { MANUAL: "Digitado", REAJUSTE_LOTE: "Reajuste em lote", IMPORTACAO: "Importação", COMPRA: "Compra recebida", PRECO_KG: "Preço do kg" } as const;

/** Variação em % entre dois custos, só para leitura rápida ("+5,0%"); o valor exato está nas colunas. */
function variacao(anterior: number | null, novo: number): { texto: string; sobe: boolean } | null {
  if (anterior === null || anterior === 0) return null;
  const pct = ((novo - anterior) / anterior) * 100;
  return { texto: `${pct > 0 ? "+" : ""}${pct.toFixed(1).replace(".", ",")}%`, sobe: pct > 0 };
}

export function HistoricoDePreco({ itens }: { itens: ItemDoHistorico[] }) {
  if (itens.length === 0) {
    return (
      <EstadoVazio
        icone={History}
        titulo="Nenhuma mudança de custo registrada"
        descricao="Quando o custo for informado ou alterado (à mão, por reajuste em lote ou por importação), cada mudança aparece aqui com quem fez e quando."
      />
    );
  }
  return (
    <section aria-labelledby="titulo-historico" className="grid gap-3">
      <h2 id="titulo-historico" className="font-medium">
        Histórico de preço
      </h2>
      <ol className="divide-y rounded-xl border">
        {itens.map((i) => {
          const v = variacao(i.anteriorCentavos, i.novoCentavos);
          return (
            <li key={i.id} className="grid gap-1 p-3 sm:grid-cols-[11rem_1fr_auto] sm:items-center sm:gap-4">
              <span className="text-muted-foreground text-xs tabular-nums">{formatarDataHora(i.quando)}</span>
              <div className="min-w-0 text-sm">
                <p className="tabular-nums">
                  <span className="text-muted-foreground">{i.anteriorCentavos === null ? "sem custo" : formatarMoeda(i.anteriorCentavos)}</span> → <strong>{formatarMoeda(i.novoCentavos)}</strong>
                  {v ? <span className={cn("ml-2 text-xs", v.sobe ? "text-destructive" : "text-emerald-700 dark:text-emerald-400")}>{v.texto}</span> : null}
                </p>
                <p className="text-muted-foreground text-xs">
                  {ROTULO_ORIGEM[i.origem]}
                  {i.observacao ? ` · ${i.observacao}` : ""}
                  {i.autor ? ` · ${i.autor}` : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
