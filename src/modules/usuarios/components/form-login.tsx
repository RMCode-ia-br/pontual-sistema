"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";

import { CampoSenha } from "@/components/campo-senha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { entrar, type EstadoFormulario } from "@/modules/usuarios/actions/sessao";

export function FormLogin({ destino }: { destino?: string }) {
  const [estado, acao, pendente] = useActionState<EstadoFormulario, FormData>(entrar, {});

  return (
    <form action={acao} className="grid gap-4" noValidate={false}>
      {destino ? <input type="hidden" name="destino" value={destino} /> : null}

      <div className="grid gap-1.5">
        <Label htmlFor="login">Usuário</Label>
        <Input
          id="login"
          name="login"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          required
          maxLength={254}
          defaultValue={estado.campos?.login ?? ""}
          key={estado.campos?.login ?? "vazio"}
        />
      </div>

      <CampoSenha id="senha" name="senha" rotulo="Senha" autoComplete="current-password" />

      {estado.erro ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.erro}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pendente} className="w-full">
        {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pendente ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
