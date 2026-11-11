"use client";

import { CheckCircle2, Circle, ClipboardList } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { EstadoVazio } from "@/components/layout/estado-vazio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatarDataCalendario } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

import { concluirTarefa, reabrirTarefa } from "../actions";
import type { TarefaLista } from "../queries";

export function ListaTarefas({ tarefas, vazioPorFiltro }: { tarefas: TarefaLista[]; vazioPorFiltro: boolean }) {
  const [pendente, iniciar] = useTransition();

  function alternar(t: TarefaLista) {
    iniciar(async () => {
      const r = t.status === "CONCLUIDA" ? await reabrirTarefa(t.id) : await concluirTarefa(t.id);
      if (r.ok) toast.success(r.mensagem ?? "Pronto.");
      else toast.error(r.erro);
    });
  }

  if (tarefas.length === 0) {
    return (
      <EstadoVazio
        icone={ClipboardList}
        titulo={vazioPorFiltro ? "Nenhuma tarefa nesse filtro" : "Nenhuma tarefa por aqui"}
        descricao={
          vazioPorFiltro
            ? "Mude o filtro para ver outras tarefas."
            : "Anote o que precisa ser feito acima. Tarefas automáticas (acompanhar proposta, cobrar parcela) aparecem aqui nas próximas fases."
        }
      />
    );
  }

  return (
    <ul className="divide-y rounded-xl border">
      {tarefas.map((t) => {
        const concluida = t.status === "CONCLUIDA";
        return (
          <li key={t.id} className={cn("flex items-start gap-3 p-3", t.vencida && "bg-destructive/5")}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={pendente}
              onClick={() => alternar(t)}
              aria-label={concluida ? `Reabrir: ${t.titulo}` : `Concluir: ${t.titulo}`}
              className="mt-0.5 shrink-0"
            >
              {concluida ? <CheckCircle2 className="text-primary" aria-hidden /> : <Circle aria-hidden />}
            </Button>
            <div className="min-w-0 flex-1">
              <Link href={`/tarefas/${t.id}`} className={cn("text-sm font-medium hover:underline", concluida && "text-muted-foreground line-through")}>
                {t.titulo}
              </Link>
              <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {t.vencimento ? (
                  <span className={cn("tabular-nums", t.vencida && "text-destructive font-medium")}>
                    Vence em {formatarDataCalendario(t.vencimento)}
                  </span>
                ) : (
                  <span>Sem vencimento</span>
                )}
                {t.responsavelNome ? <span>{t.responsavelNome}</span> : null}
                {t.vencida ? <Badge variant="destructive">Vencida</Badge> : null}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
