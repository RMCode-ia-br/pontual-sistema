"use client";

import { Input } from "@/components/ui/input";

type Props = Omit<React.ComponentProps<"input">, "onInput"> & {
  /** Função de máscara (ex.: mascararTelefone). Aplicada a cada digitação. */
  mascara: (texto: string) => string;
};

/** Campo de texto que se formata enquanto a pessoa digita; continua não controlado (funciona com FormData). */
export function CampoMascarado({ mascara, onChange, defaultValue, ...props }: Props) {
  return (
    <Input
      {...props}
      defaultValue={typeof defaultValue === "string" ? mascara(defaultValue) : defaultValue}
      onChange={(e) => {
        const formatado = mascara(e.currentTarget.value);
        if (formatado !== e.currentTarget.value) e.currentTarget.value = formatado;
        onChange?.(e);
      }}
    />
  );
}
