import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";

import { ROTULO_SEMAFORO, type Semaforo } from "@/lib/dominio/semaforo";
import { cn } from "@/lib/utils";

const ESTILO: Record<Semaforo, string> = {
  VERDE: "border-emerald-600/40 bg-emerald-600/10 text-emerald-900 dark:text-emerald-200",
  AMARELO: "border-amber-500/50 bg-amber-500/15 text-amber-900 dark:text-amber-200",
  VERMELHO: "border-destructive/50 bg-destructive/10 text-destructive",
};
const ICONE = { VERDE: CheckCircle2, AMARELO: Clock, VERMELHO: AlertTriangle } as const;

/** Semáforo de prazo: sempre texto + ícone (a cor sozinha não basta para quem não distingue cores). */
export function SemaforoTag({ semaforo, rotulo, className }: { semaforo: Semaforo; rotulo?: string; className?: string }) {
  const Icone = ICONE[semaforo];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", ESTILO[semaforo], className)}>
      <Icone className="size-3.5" aria-hidden />
      {rotulo ?? ROTULO_SEMAFORO[semaforo]}
    </span>
  );
}
