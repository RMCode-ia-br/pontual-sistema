"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  id: string;
  name: string;
  rotulo: string;
  autoComplete: "current-password" | "new-password";
  autoFocus?: boolean;
  dica?: string;
};

/** Campo de senha com botão de mostrar/ocultar, acessível por teclado e leitor de tela. */
export function CampoSenha({ id, name, rotulo, autoComplete, autoFocus, dica }: Props) {
  const [visivel, setVisivel] = useState(false);
  const idDica = dica ? `${id}-dica` : undefined;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visivel ? "text" : "password"}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required
          maxLength={200}
          aria-describedby={idDica}
          className="pr-11"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-1/2 right-1 -translate-y-1/2"
          onClick={() => setVisivel((v) => !v)}
          aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visivel}
        >
          {visivel ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </Button>
      </div>
      {dica ? (
        <p id={idDica} className="text-muted-foreground text-xs">
          {dica}
        </p>
      ) : null}
    </div>
  );
}
