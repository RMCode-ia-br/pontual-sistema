"use client";

import { Input } from "@/components/ui/input";
import { colarMoeda, mascararMoeda } from "@/lib/formatadores/mascaras";

type Props = Omit<React.ComponentProps<"input">, "onInput"> & {
  /** Função de máscara (ex.: mascararTelefone). Aplicada a cada digitação. */
  mascara: (texto: string) => string;
  /** Lê o texto COLADO e devolve o valor do campo, ou null para seguir a máscara comum. Padrão: `colarMoeda` nos campos de dinheiro. */
  colar?: (textoColado: string) => string | null;
};

/** Campo de texto que se formata enquanto a pessoa digita; continua não controlado (funciona com FormData). */
export function CampoMascarado({ mascara, colar, onChange, onPaste, defaultValue, ...props }: Props) {
  const lerColado = colar ?? (mascara === mascararMoeda ? colarMoeda : undefined);
  return (
    <Input
      {...props}
      onPaste={(e) => {
        onPaste?.(e);
        if (!lerColado) return;
        const pronto = lerColado(e.clipboardData.getData("text"));
        if (pronto === null) return;
        e.preventDefault();
        // Campo não controlado: grava pelo "setter" nativo e dispara o evento de entrada para o onChange (e a máscara) rodarem.
        const campo = e.currentTarget;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(campo, pronto);
        campo.dispatchEvent(new Event("input", { bubbles: true }));
      }}
      defaultValue={typeof defaultValue === "string" ? mascara(defaultValue) : defaultValue}
      onChange={(e) => {
        const formatado = mascara(e.currentTarget.value);
        if (formatado !== e.currentTarget.value) e.currentTarget.value = formatado;
        onChange?.(e);
      }}
    />
  );
}
