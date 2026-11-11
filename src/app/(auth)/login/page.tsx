import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { obterUsuarioAtual } from "@/lib/auth/sessao";
import { FormLogin } from "@/modules/usuarios/components/form-login";

export const metadata: Metadata = { title: "Entrar" };

export default async function PaginaLogin({ searchParams }: { searchParams: Promise<{ senha?: string; de?: string }> }) {
  const { senha, de } = await searchParams;

  // Quem já tem sessão válida não precisa ver o login de novo.
  const usuario = await obterUsuarioAtual();
  if (usuario) redirect(usuario.precisaTrocarSenha ? "/trocar-senha" : "/");

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Entrar
        </CardTitle>
        <CardDescription>Use seu usuário e senha para acessar o sistema.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {senha === "alterada" ? (
          <p role="status" className="text-primary bg-primary/10 flex items-center gap-2 rounded-lg p-3 text-sm">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            Senha alterada. Entre novamente com a nova senha.
          </p>
        ) : null}
        <FormLogin destino={de} />
      </CardContent>
    </Card>
  );
}
