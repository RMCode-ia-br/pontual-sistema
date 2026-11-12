"use client";

import { Info } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * "Como é calculado": a definição de um número em linguagem simples. Funciona no computador (passar o mouse mostra a
 * dica do navegador; clicar ou Enter abre) e no celular (tocar abre e fecha), sem depender de hover. O texto aparece
 * dentro do próprio cartão, então leitor de tela e impressão também o leem.
 */
export function ComoECalculado({ texto, className }: { texto: string; className?: string }) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  return (
    <span className={cn("inline-flex flex-col items-start", className)}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls={id}
        title={`Como é calculado: ${texto}`}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring relative z-10 inline-flex min-h-8 items-center gap-1 rounded-md px-1 text-xs underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
      >
        <Info className="size-3.5" aria-hidden />
        Como é calculado
      </button>
      <span id={id} hidden={!aberto} className="text-muted-foreground mt-1 block text-xs leading-relaxed print:block">
        {texto}
      </span>
    </span>
  );
}
