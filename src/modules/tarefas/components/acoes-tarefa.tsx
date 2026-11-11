"use client";

import { CheckCircle2, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import { concluirTarefa, excluirTarefa, reabrirTarefa } from "../actions";

export function AcoesTarefa({ id, concluida, titulo }: { id: string; concluida: boolean; titulo: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, iniciar] = useTransition();

  function alternar() {
    iniciar(async () => {
      const r = concluida ? await reabrirTarefa(id) : await concluirTarefa(id);
      if (r.ok) {
        toast.success(r.mensagem ?? "Pronto.");
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  function excluir() {
    iniciar(async () => {
      const r = await excluirTarefa(id);
      setConfirmando(false);
      if (r.ok) {
        toast.success("Tarefa removida.");
        router.push("/tarefas");
      } else toast.error(r.erro);
    });
  }

  return (
    <>
      <Button type="button" variant={concluida ? "outline" : "default"} onClick={alternar} disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" aria-hidden /> : concluida ? <RotateCcw aria-hidden /> : <CheckCircle2 aria-hidden />}
        {concluida ? "Reabrir" : "Concluir"}
      </Button>
      <Button type="button" variant="outline" onClick={() => setConfirmando(true)} disabled={pendente}>
        <Trash2 aria-hidden /> Remover
      </Button>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover “{titulo}”?</AlertDialogTitle>
            <AlertDialogDescription>A tarefa deixa de aparecer na lista. A remoção fica registrada na auditoria.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pendente}
              onClick={(e) => {
                e.preventDefault();
                excluir();
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
