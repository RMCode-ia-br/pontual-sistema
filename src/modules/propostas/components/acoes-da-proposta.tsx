"use client";

import { Copy, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmarAcao } from "@/components/confirmar-acao";
import { Button } from "@/components/ui/button";

import { duplicarProposta, excluirProposta } from "../actions/propostas";

type Props = { propostaId: string; numero: string; rascunho: boolean };

export function AcoesDaProposta({ propostaId, numero, rascunho }: Props) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [excluindo, setExcluindo] = useState(false);

  function duplicar() {
    iniciar(async () => {
      const r = await duplicarProposta(propostaId);
      if (r.ok && r.dados) {
        toast.success(r.mensagem ?? "Proposta duplicada.");
        router.push(`/propostas/${r.dados.id}`);
      } else if (!r.ok) {
        toast.error(r.erro);
      }
    });
  }

  function excluir() {
    iniciar(async () => {
      const r = await excluirProposta(propostaId);
      setExcluindo(false);
      if (r.ok && r.dados) {
        toast.success(r.mensagem ?? "Rascunho excluído.");
        router.push(`/projetos/${r.dados.projetoId}?aba=propostas`);
      } else if (!r.ok) {
        toast.error(r.erro);
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" disabled={pendente} onClick={duplicar}>
        <Copy aria-hidden /> Duplicar como base
      </Button>
      {rascunho ? (
        <Button type="button" variant="destructive" onClick={() => setExcluindo(true)}>
          <Trash2 aria-hidden /> Excluir rascunho
        </Button>
      ) : null}
      <ConfirmarAcao aberto={excluindo} aoFechar={() => setExcluindo(false)} titulo={`Excluir o rascunho ${numero}?`} descricao="O rascunho vai para a lixeira lógica e o número não é reaproveitado." botao="Excluir" pendente={pendente} aoConfirmar={excluir} />
    </>
  );
}
