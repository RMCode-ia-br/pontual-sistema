"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

type Props = {
  titulo?: string;
  descricao?: string;
  /** Identificador seguro do erro (hash do Next), útil para a RM Code achar o log. Nunca mostra detalhes. */
  codigo?: string;
  aoTentarDeNovo?: () => void;
};

/** Página de erro amigável: nunca mostra mensagem técnica nem stack trace. */
export function PaginaDeErro({
  titulo = "Algo deu errado",
  descricao = "Não foi possível concluir esta ação. Tente de novo; se continuar, avise a RM Code informando o código abaixo.",
  codigo,
  aoTentarDeNovo,
}: Props) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
      <span className="bg-destructive/10 text-destructive mb-4 flex size-14 items-center justify-center rounded-full">
        <TriangleAlert className="size-7" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold">{titulo}</h1>
      <p className="text-muted-foreground mt-2 text-sm">{descricao}</p>
      {codigo ? <p className="text-muted-foreground mt-3 font-mono text-xs">Código: {codigo}</p> : null}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {aoTentarDeNovo ? (
          <Button type="button" onClick={aoTentarDeNovo}>
            <RotateCcw aria-hidden /> Tentar de novo
          </Button>
        ) : null}
        <Link href="/" className="border-border hover:bg-muted inline-flex h-8 items-center rounded-lg border px-3 text-sm font-medium">
          Ir para o início
        </Link>
      </div>
    </div>
  );
}
