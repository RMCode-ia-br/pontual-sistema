import { CalendarPlus, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatarDataCalendario } from "@/lib/formatadores";
import { montarConsulta } from "@/lib/listas/parametros";
import { cn } from "@/lib/utils";

import type { EtapaSemAgendamento } from "../queries-lista";

const periodo = (i: string | null, f: string | null) => (i && f ? (i === f ? formatarDataCalendario(i) : `${formatarDataCalendario(i)} a ${formatarDataCalendario(f)}`) : i ? formatarDataCalendario(i) : f ? formatarDataCalendario(f) : null);

/**
 * Etapas de instalação, medição dos vidros e entrega que já têm data prevista mas ainda não têm compromisso na agenda.
 * "Agendar" abre o compromisso já ligado à obra e à etapa, com os avisos de conflito, feriado e férias de sempre.
 */
export function InstalacoesSemAgendamento({ etapas, hoje }: { etapas: EtapaSemAgendamento[]; hoje: string }) {
  return (
    <section aria-labelledby="titulo-sem-agenda" className="grid content-start gap-3 rounded-xl border p-4">
      <h2 id="titulo-sem-agenda" className="font-medium">
        Previstas, sem agendamento
      </h2>
      <p className="text-muted-foreground text-xs">Etapas das obras em andamento que ainda não têm compromisso na agenda.</p>
      {etapas.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">Todas as instalações, medições de vidro e entregas das obras em andamento já estão agendadas.</p>
      ) : (
        <ul className="grid gap-2">
          {etapas.map((e) => {
            const quando = periodo(e.inicioPrevisto, e.fimPrevisto);
            const sugestao = `${e.inicioPrevisto && e.inicioPrevisto >= hoje ? e.inicioPrevisto : hoje}T08:00`;
            return (
              <li key={e.etapaId} className="grid gap-1.5 rounded-lg border p-2.5 text-sm">
                <div>
                  <Link href={`/obras/${e.projetoId}?aba=etapas`} className="font-medium hover:underline">
                    {e.projetoTitulo}
                  </Link>
                  <p className="text-muted-foreground text-xs">
                    {e.clienteNome} · {e.etapaNome}
                  </p>
                </div>
                <p className="text-xs">
                  {quando ? `Previsto ${quando}` : "Sem data prevista"}
                  {e.equipeNome ? ` · ${e.equipeNome}` : ""}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {e.atrasada ? (
                    <Badge variant="destructive">
                      <TriangleAlert aria-hidden /> Atrasada
                    </Badge>
                  ) : null}
                  <Link
                    href={`/agenda/novo${montarConsulta({ projeto: e.projetoId, tipo: e.eventoTipo, etapa: e.etapaId, equipe: e.equipeId ?? undefined, inicio: sugestao })}`}
                    className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                    aria-label={`Agendar ${e.etapaNome}: ${e.projetoTitulo}`}
                  >
                    <CalendarPlus aria-hidden /> Agendar
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
