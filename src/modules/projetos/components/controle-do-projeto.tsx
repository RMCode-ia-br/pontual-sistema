"use client";

import { Loader2, ThumbsDown, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmarAcao } from "@/components/confirmar-acao";
import { Selecao } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { avaliarMovimento, FASES_ABERTAS, ROTULO_STATUS_PROJETO, type StatusProjeto } from "@/lib/dominio/funil";

import { moverProjeto } from "../actions/funil";
import { excluirProjetos } from "../actions/projetos";
import { DialogoPerda } from "./dialogo-perda";

type Props = {
  projeto: { id: string; titulo: string; status: StatusProjeto };
  motivos: { id: string; nome: string }[];
};

/** Mudar de fase, marcar como perdido, reabrir e enviar à lixeira, direto da ficha do projeto. */
export function ControleDoProjeto({ projeto, motivos }: Props) {
  const router = useRouter();
  const [perdendo, setPerdendo] = useState(false);
  const [lixeira, setLixeira] = useState(false);
  const [pendente, iniciar] = useTransition();

  const aberto = (FASES_ABERTAS as readonly string[]).includes(projeto.status);
  const perdido = projeto.status === "PERDIDO";

  function mover(para: StatusProjeto) {
    const r = avaliarMovimento(projeto.status, para);
    if (!r.ok) {
      toast.error(r.motivo);
      return;
    }
    iniciar(async () => {
      const res = await moverProjeto({ id: projeto.id, para });
      if (res.ok) {
        toast.success(res.mensagem ?? "Projeto movido.");
        router.refresh();
      } else toast.error(res.erro);
    });
  }

  function enviarALixeira() {
    iniciar(async () => {
      const r = await excluirProjetos([projeto.id]);
      setLixeira(false);
      if (r.ok) {
        toast.success(r.mensagem ?? "Projeto enviado para a lixeira.");
        router.push("/projetos");
      } else toast.error(r.erro);
    });
  }

  return (
    <>
      {aberto || perdido ? (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground sr-only sm:not-sr-only">{perdido ? "Reabrir como" : "Mover para"}</span>
          <Selecao
            aria-label={perdido ? "Reabrir o projeto em uma fase" : "Mover o projeto para outra fase"}
            value=""
            disabled={pendente}
            onChange={(e) => e.target.value && mover(e.target.value as StatusProjeto)}
            className="w-44"
          >
            <option value="">{perdido ? "Reabrir como…" : "Mover para…"}</option>
            {FASES_ABERTAS.filter((s) => s !== projeto.status).map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS_PROJETO[s]}
              </option>
            ))}
          </Selecao>
        </label>
      ) : null}
      {aberto ? (
        <Button type="button" variant="outline" onClick={() => setPerdendo(true)} disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : <ThumbsDown aria-hidden />} Marcar como perdido
        </Button>
      ) : null}
      <Button type="button" variant="destructive" onClick={() => setLixeira(true)}>
        <Trash2 aria-hidden /> Enviar à lixeira
      </Button>

      <DialogoPerda
        projeto={perdendo ? { id: projeto.id, titulo: projeto.titulo } : null}
        motivos={motivos}
        aoFechar={() => setPerdendo(false)}
        aoConcluir={() => {
          setPerdendo(false);
          toast.success("Projeto marcado como perdido.");
          router.refresh();
        }}
      />
      <ConfirmarAcao
        aberto={lixeira}
        aoFechar={() => setLixeira(false)}
        titulo={`Enviar ${projeto.titulo} para a lixeira?`}
        descricao="O projeto sai das listas, do funil e da busca, e pode ser restaurado depois na Lixeira. Tarefas, visitas e histórico são preservados."
        botao="Enviar à lixeira"
        pendente={pendente}
        aoConfirmar={enviarALixeira}
      />
    </>
  );
}
