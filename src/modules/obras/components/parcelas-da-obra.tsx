import { Badge } from "@/components/ui/badge";
import { ROTULO_GATILHO } from "@/lib/dominio/parcelas";
import { formatarDataCalendario, formatarMoeda } from "@/lib/formatadores";

import type { ParcelaDaObra } from "../queries";

function situacao(p: ParcelaDaObra): { texto: string; variante: "default" | "secondary" | "outline" | "destructive" } {
  if (p.status === "AGUARDANDO_GATILHO") return { texto: p.etapa ? `Aguarda a etapa “${p.etapa}”` : "Aguarda a etapa", variante: "outline" };
  if (p.status === "ABERTA") return p.atrasada ? { texto: "Atrasada", variante: "destructive" } : { texto: "Em aberto", variante: "default" };
  if (p.status === "PARCIAL") return { texto: "Pago em parte", variante: "secondary" };
  if (p.status === "PAGA") return { texto: "Paga", variante: "secondary" };
  return { texto: "Cancelada", variante: "outline" };
}

/** Parcelas a receber da obra (só leitura; o financeiro completo, com pagamentos, chega na Fase 5). */
export function ParcelasDaObra({ parcelas }: { parcelas: ParcelaDaObra[] }) {
  if (parcelas.length === 0) {
    return <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">Esta obra não tem parcelas a receber (a condição de pagamento era “a combinar”).</p>;
  }
  const total = parcelas.filter((p) => p.status !== "CANCELADA").reduce((s, p) => s + p.valorCentavos, 0);
  return (
    <section aria-labelledby="titulo-parcelas" className="grid gap-3">
      <h2 id="titulo-parcelas" className="font-medium">
        Parcelas a receber
      </h2>
      <p className="text-muted-foreground text-sm">
        As parcelas ligadas a uma etapa ficam aguardando e passam a ser cobradas quando a etapa é concluída. O registro de pagamentos e a cobrança chegam com o Financeiro.
      </p>
      <ul className="grid gap-2">
        {parcelas.map((p) => {
          const s = situacao(p);
          return (
            <li key={p.id} className="grid gap-1 rounded-xl border p-3 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
              <div className="grid gap-0.5">
                <p className="font-medium">{p.descricao}</p>
                <p className="text-muted-foreground text-xs">
                  {p.gatilho ? ROTULO_GATILHO[p.gatilho as keyof typeof ROTULO_GATILHO] : "Sem gatilho"}
                  {p.vencimento ? ` · vence em ${formatarDataCalendario(p.vencimento)}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <span className="font-medium tabular-nums">{formatarMoeda(p.valorCentavos)}</span>
                <Badge variant={s.variante}>{s.texto}</Badge>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-sm">
        Total das parcelas: <strong className="tabular-nums">{formatarMoeda(total)}</strong>
      </p>
    </section>
  );
}
