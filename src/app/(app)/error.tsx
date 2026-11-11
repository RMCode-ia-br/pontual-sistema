"use client";

import { useEffect } from "react";

import { PaginaDeErro } from "@/components/layout/pagina-de-erro";

// Erro dentro da área logada: o menu e o topo continuam na tela.
export default function ErroDaAreaLogada({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({ evento: "ui.erro", digest: error.digest }));
  }, [error]);

  return <PaginaDeErro codigo={error.digest} aoTentarDeNovo={reset} />;
}
