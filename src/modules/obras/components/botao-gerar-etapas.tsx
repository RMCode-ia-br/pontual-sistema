"use client";

import { ListChecks, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { gerarEtapas } from "../actions/obra";

/** Obra aprovada antes de existir o modelo de etapas: gera as etapas a partir da proposta aprovada. */
export function BotaoGerarEtapas({ projetoId }: { projetoId: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function gerar() {
    setErro(null);
    iniciar(async () => {
      const r = await gerarEtapas({ projetoId });
      if (r.ok) {
        toast.success(r.mensagem ?? "Etapas geradas.");
        router.refresh();
      } else setErro(r.erro);
    });
  }

  return (
    <div className="grid justify-items-start gap-2 rounded-xl border border-dashed p-6">
      <ListChecks className="text-muted-foreground size-6" aria-hidden />
      <p className="font-medium">Esta obra ainda não tem etapas</p>
      <p className="text-muted-foreground text-sm">Gere as etapas a partir do modelo (Configurações, Modelo de etapas). O prazo e as datas partem da proposta aprovada.</p>
      <Button type="button" onClick={gerar} disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Gerar etapas
      </Button>
      {erro ? (
        <p role="alert" className="text-destructive text-sm">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
