"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SugestaoDeData } from "@/lib/dominio/prazo-obra";
import { formatarDataCalendario } from "@/lib/formatadores";

import { aplicarDatas } from "../actions/obra";

export type SugestaoDaObra = { tipo: "RELOGIO" | "DESVIO" | "CALCULO"; itens: SugestaoDeData[] };

const TEXTO: Record<SugestaoDaObra["tipo"], { titulo: string; descricao: string }> = {
  RELOGIO: {
    titulo: "O prazo começou a contar",
    descricao: "A medição exata foi concluída. Estas são as datas definitivas que o sistema calculou a partir dela. Nada muda até você aplicar.",
  },
  DESVIO: {
    titulo: "Reprogramar as próximas etapas?",
    descricao: "A etapa terminou fora da data prevista. O sistema sugere deslocar as seguintes pelo mesmo desvio. O prazo prometido ao cliente não muda.",
  },
  CALCULO: {
    titulo: "Datas sugeridas",
    descricao: "Calculadas com o prazo e as pausas de agora. Nada muda até você aplicar.",
  },
};

const intervalo = (inicio: string | null, fim: string | null) => (inicio && fim ? (inicio === fim ? formatarDataCalendario(inicio) : `${formatarDataCalendario(inicio)} a ${formatarDataCalendario(fim)}`) : "sem data");

type Props = {
  projetoId: string;
  sugestao: SugestaoDaObra | null;
  /** Para mostrar o nome de cada etapa. */
  nomes: Record<string, string>;
  aoFechar: () => void;
};

/** O sistema SUGERE datas e o gestor decide: nunca altera sozinho (R7/R8). */
export function DialogoDatasSugeridas({ projetoId, sugestao, nomes, aoFechar }: Props) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  function aplicar() {
    if (!sugestao) return;
    iniciar(async () => {
      const r = await aplicarDatas({ projetoId, itens: sugestao.itens.map((s) => ({ etapaId: s.id, inicio: s.novoInicio!, fim: s.novoFim! })) });
      if (r.ok) {
        toast.success(r.mensagem ?? "Datas atualizadas.");
        aoFechar();
        router.refresh();
      } else {
        toast.error(r.erro);
      }
    });
  }

  const texto = sugestao ? TEXTO[sugestao.tipo] : null;
  return (
    <Dialog open={!!sugestao} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{texto?.titulo}</DialogTitle>
          <DialogDescription>{texto?.descricao}</DialogDescription>
        </DialogHeader>
        {sugestao && sugestao.itens.length === 0 ? <p className="text-muted-foreground text-sm">As datas já estão como o sistema calcularia. Nada a mudar.</p> : null}
        {sugestao && sugestao.itens.length > 0 ? (
          <ul className="grid max-h-80 gap-2 overflow-y-auto text-sm">
            {sugestao.itens.map((s) => (
              <li key={s.id} className="grid gap-0.5 rounded-lg border p-2 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-3">
                <span className="font-medium">{nomes[s.id] ?? "Etapa"}</span>
                <span className="text-muted-foreground tabular-nums">
                  {intervalo(s.inicioPrevisto, s.fimPrevisto)} <span aria-hidden>→</span> <span className="sr-only">para</span>
                  <strong className="text-foreground font-medium">{intervalo(s.novoInicio, s.novoFim)}</strong>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={aoFechar} disabled={pendente}>
            Manter como está
          </Button>
          {sugestao && sugestao.itens.length > 0 ? (
            <Button type="button" onClick={aplicar} disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Aplicar datas
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
