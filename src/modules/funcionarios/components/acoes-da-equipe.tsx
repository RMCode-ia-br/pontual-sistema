"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmarAcao } from "@/components/confirmar-acao";
import { Button } from "@/components/ui/button";

import { excluirEquipe } from "../actions/equipes";

export function AcoesDaEquipe({ id, nome }: { id: string; nome: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();

  function excluir() {
    iniciar(async () => {
      const r = await excluirEquipe(id);
      setAberto(false);
      if (r.ok) {
        toast.success(r.mensagem ?? "Pronto.");
        router.push("/funcionarios/equipes");
      } else toast.error(r.erro);
    });
  }

  return (
    <>
      <Button type="button" variant="destructive" onClick={() => setAberto(true)}>
        <Trash2 aria-hidden /> Enviar à lixeira
      </Button>
      <ConfirmarAcao
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={`Enviar a equipe ${nome} para a lixeira?`}
        descricao="A equipe sai das listas e pode ser restaurada depois na Lixeira. As pessoas continuam cadastradas como funcionários."
        botao="Enviar à lixeira"
        pendente={pendente}
        aoConfirmar={excluir}
      />
    </>
  );
}
