"use client";

import { Ban, CheckCheck, CircleCheck, Loader2, Trash2, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmarAcao } from "@/components/confirmar-acao";
import { Button } from "@/components/ui/button";
import { podeMudarSituacao } from "@/lib/dominio/agenda";
import { ROTULO_STATUS_PROJETO } from "@/lib/dominio/funil";
import { moverProjeto } from "@/modules/projetos/actions/funil";

import { excluirEvento, mudarSituacaoDoEvento } from "../actions/eventos";
import type { StatusEvento } from "../schemas";

type Props = { id: string; status: StatusEvento; tipoVisita: boolean };

/** Confirmar, marcar como realizado, cancelar, "não compareceu" e excluir, direto da ficha do compromisso. */
export function AcoesDoEvento({ id, status, tipoVisita }: Props) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [excluindo, setExcluindo] = useState(false);

  function mudar(novo: "CONFIRMADO" | "REALIZADO" | "CANCELADO" | "NAO_COMPARECEU") {
    iniciar(async () => {
      const r = await mudarSituacaoDoEvento({ id, status: novo });
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      const sugestao = r.dados?.sugestaoDeFase;
      const projetoId = r.dados?.projetoId;
      if (sugestao && projetoId) {
        // O sistema só SUGERE a nova fase do projeto; quem decide é a pessoa.
        toast.success(r.mensagem ?? "Pronto.", {
          description: `Quer mover o projeto para “${ROTULO_STATUS_PROJETO[sugestao]}”?`,
          duration: 12000,
          action: {
            label: "Mover",
            onClick: () => {
              void moverProjeto({ id: projetoId, para: sugestao }).then((m) => (m.ok ? toast.success(m.mensagem ?? "Projeto movido.") : toast.error(m.erro)));
            },
          },
        });
      } else {
        toast.success(r.mensagem ?? "Pronto.");
      }
      router.refresh();
    });
  }

  function excluir() {
    iniciar(async () => {
      const r = await excluirEvento(id);
      setExcluindo(false);
      if (r.ok) {
        toast.success(r.mensagem ?? "Excluído.");
        router.push("/agenda");
      } else toast.error(r.erro);
    });
  }

  const pode = (para: StatusEvento) => podeMudarSituacao(status, para);

  return (
    <>
      {pode("CONFIRMADO") ? (
        <Button type="button" variant="outline" disabled={pendente} onClick={() => mudar("CONFIRMADO")}>
          <CircleCheck aria-hidden /> Confirmar
        </Button>
      ) : null}
      {pode("REALIZADO") ? (
        <Button type="button" disabled={pendente} onClick={() => mudar("REALIZADO")}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCheck aria-hidden />} {tipoVisita ? "Visita realizada" : "Marcar como realizado"}
        </Button>
      ) : null}
      {pode("NAO_COMPARECEU") ? (
        <Button type="button" variant="outline" disabled={pendente} onClick={() => mudar("NAO_COMPARECEU")}>
          <UserX aria-hidden /> Não compareceu
        </Button>
      ) : null}
      {pode("CANCELADO") ? (
        <Button type="button" variant="outline" disabled={pendente} onClick={() => mudar("CANCELADO")}>
          <Ban aria-hidden /> Cancelar
        </Button>
      ) : null}
      <Button type="button" variant="destructive" onClick={() => setExcluindo(true)}>
        <Trash2 aria-hidden /> Excluir
      </Button>
      <ConfirmarAcao
        aberto={excluindo}
        aoFechar={() => setExcluindo(false)}
        titulo="Excluir este compromisso?"
        descricao="Ele some da agenda e do calendário assinado. Se a visita foi marcada mas não aconteceu, prefira “Cancelar” para manter o histórico."
        botao="Excluir"
        pendente={pendente}
        aoConfirmar={excluir}
      />
    </>
  );
}
