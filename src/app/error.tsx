"use client";

import { useEffect } from "react";

import { PaginaDeErro } from "@/components/layout/pagina-de-erro";

export default function ErroGlobalDaRota({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Só o identificador vai para o log do navegador; a mensagem do erro pode conter detalhes internos.
    console.error(JSON.stringify({ evento: "ui.erro", digest: error.digest }));
  }, [error]);

  return <PaginaDeErro codigo={error.digest} aoTentarDeNovo={reset} />;
}
