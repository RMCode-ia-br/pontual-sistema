"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";

import { CampoSenha } from "@/components/campo-senha";
import { Button } from "@/components/ui/button";
import { trocarSenha, type EstadoFormulario } from "@/modules/usuarios/actions/sessao";

export function FormTrocarSenha() {
  const [estado, acao, pendente] = useActionState<EstadoFormulario, FormData>(trocarSenha, {});

  return (
    <form action={acao} className="grid gap-4">
      <CampoSenha id="senhaAtual" name="senhaAtual" rotulo="Senha atual" autoComplete="current-password" autoFocus />
      <CampoSenha
        id="novaSenha"
        name="novaSenha"
        rotulo="Nova senha"
        autoComplete="new-password"
        dica="Mínimo de 8 caracteres. Não use a senha inicial."
      />
      <CampoSenha id="confirmacao" name="confirmacao" rotulo="Repita a nova senha" autoComplete="new-password" />

      {estado.erro ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.erro}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pendente} className="w-full">
        {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pendente ? "Salvando..." : "Salvar nova senha"}
      </Button>
    </form>
  );
}
