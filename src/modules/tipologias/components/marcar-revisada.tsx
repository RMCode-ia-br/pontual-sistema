"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { marcarTipologiaRevisadaAcao } from "../actions/desenho";

/** Aviso de tipologia criada a partir de uma proposta + ação "Marcar como revisada" (tira o selo; auditado no servidor). */
export function AvisoCriadaDeProposta({ tipologiaId }: { tipologiaId: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  function marcar() {
    iniciar(async () => {
      const r = await marcarTipologiaRevisadaAcao({ tipologiaId });
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success(r.mensagem ?? "Tipologia marcada como revisada.");
      router.refresh();
    });
  }

  return (
    <div className="mb-4 grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center" role="note" data-testid="aviso-criada-de-proposta">
      <p>
        <strong>Criada de uma proposta — revisar.</strong> O desenho veio do item. Falta cadastrar a composição de custo e a tabela de preços; até lá, o item que usar esta tipologia fica com preço manual. Confira também o modelo da descrição.
      </p>
      <Button type="button" variant="outline" className="min-h-11 sm:min-h-8" disabled={pendente} onClick={marcar}>
        Marcar como revisada
      </Button>
    </div>
  );
}
