"use client";

import { useState, useTransition, type FormEvent } from "react";

import type { ResultadoAcao } from "@/lib/acoes";

/**
 * Envia um formulário a uma Server Action SEM o reset automático do React 19.
 *
 * Com `<form action={fn}>`, o React limpa os campos não controlados quando a ação termina, mesmo que
 * ela devolva erro de validação: a pessoa perderia tudo o que digitou. Aqui o envio é por `onSubmit`
 * dentro de uma transição, então os campos permanecem como estão. Para limpar após um sucesso (ex.:
 * cadastro em série), troque a `key` do formulário no `aoConcluir`.
 *
 * A validação nativa do navegador (`required`, `type=email`) continua rodando antes do envio.
 */
export function useAcaoDeFormulario<T = undefined>(
  acao: (formData: FormData) => Promise<ResultadoAcao<T>>,
  aoConcluir?: (resultado: ResultadoAcao<T>) => void,
) {
  const [estado, setEstado] = useState<ResultadoAcao<T> | null>(null);
  const [pendente, iniciar] = useTransition();

  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    iniciar(async () => {
      const resultado = await acao(dados);
      setEstado(resultado);
      aoConcluir?.(resultado);
    });
  }

  return { estado, pendente, aoEnviar };
}
