"use client";

import { Loader2 } from "lucide-react";

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

type Props = {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao: string;
  /** Texto do botão que confirma ("Remover", "Enviar para a lixeira"). */
  botao: string;
  pendente?: boolean;
  aoConfirmar: () => void;
};

/** Confirmação de ação destrutiva (spec seção 11): o botão só age depois do clique explícito. */
export function ConfirmarAcao({ aberto, aoFechar, titulo, descricao, botao, pendente = false, aoConfirmar }: Props) {
  return (
    <AlertDialog open={aberto} onOpenChange={(a) => !a && aoFechar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={pendente}
            onClick={(e) => {
              e.preventDefault();
              aoConfirmar();
            }}
          >
            {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} {botao}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
