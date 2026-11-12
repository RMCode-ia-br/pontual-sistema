"use client";

import { useState } from "react";

import { ariaDoCampo, Campo } from "@/components/formulario";
import { Input } from "@/components/ui/input";
import { normalizarHex } from "@/lib/tema/cores";
import { derivarTemaDaMarca, SUPERFICIES, type TokensDeTema } from "@/lib/tema/derivar";

type Props = { nome: string; rotulo: string; valorInicial: string; erro?: string };

/** Amostra de como o botão primário fica num modo (cores já com contraste AA garantido). */
function Amostra({ titulo, tokens, fundo, texto }: { titulo: string; tokens: TokensDeTema; fundo: string; texto: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-2" style={{ background: fundo, color: texto }}>
      <span className="text-xs">{titulo}</span>
      <span className="rounded-md px-3 py-1 text-xs font-medium" style={{ background: tokens["--primary"], color: tokens["--primary-foreground"] }}>
        Botão
      </span>
      <span className="text-xs font-medium" style={{ color: tokens["--primary"] }}>
        Link
      </span>
    </div>
  );
}

/**
 * Cor da marca: seletor nativo + campo de texto (#rrggbb) e prévia nos dois modos.
 * A prévia usa a mesma função que o sistema aplica (derivarTemaDaMarca), então mostra o resultado real.
 */
export function CampoCor({ nome, rotulo, valorInicial, erro }: Props) {
  const [valor, setValor] = useState(valorInicial);
  const hex = normalizarHex(valor);
  const tema = derivarTemaDaMarca(valor);
  const dica = "Formato #0064b5. Vazio usa o azul padrão do sistema.";

  return (
    <Campo id={nome} rotulo={rotulo} erro={erro} dica={dica} className="sm:col-span-2">
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${rotulo}: escolher no seletor de cores`}
          value={hex ?? "#0064b5"}
          onChange={(e) => setValor(e.target.value)}
          className="border-input bg-background h-9 w-12 shrink-0 cursor-pointer rounded-lg border p-1"
        />
        <Input
          id={nome}
          name={nome}
          maxLength={7}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="max-w-40 font-mono"
          {...ariaDoCampo(nome, erro, dica)}
        />
      </div>
      {tema ? (
        <div className="mt-1 grid gap-2 sm:grid-cols-2" aria-label="Prévia da cor nos modos claro e escuro">
          <Amostra titulo="Claro" tokens={tema.claro} fundo={SUPERFICIES.claro.fundo} texto={SUPERFICIES.claro.texto} />
          <Amostra titulo="Escuro" tokens={tema.escuro} fundo={SUPERFICIES.escuro.fundo} texto={SUPERFICIES.escuro.texto} />
          {tema.ajustadaNoClaro || tema.ajustadaNoEscuro ? (
            <p role="status" className="text-muted-foreground text-xs sm:col-span-2">
              Para manter o texto legível (contraste mínimo 4,5:1),{" "}
              {tema.ajustadaNoClaro && tema.ajustadaNoEscuro
                ? `a cor é escurecida no modo claro (${tema.claro["--primary"]}) e clareada no modo escuro (${tema.escuro["--primary"]})`
                : tema.ajustadaNoClaro
                  ? `a cor é escurecida no modo claro (${tema.claro["--primary"]})`
                  : `a cor é clareada no modo escuro (${tema.escuro["--primary"]})`}
              .
            </p>
          ) : null}
        </div>
      ) : valor.trim() ? (
        <p className="text-muted-foreground text-xs">Digite uma cor completa, como #0064b5.</p>
      ) : null}
    </Campo>
  );
}
