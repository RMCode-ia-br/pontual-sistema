import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirSessao } from "@/lib/auth/sessao";
import { FormTrocarSenha } from "@/modules/usuarios/components/form-trocar-senha";

export const metadata: Metadata = { title: "Trocar senha" };

export default async function PaginaTrocarSenha() {
  const usuario = await exigirSessao({ permitirTrocaPendente: true });

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          {usuario.precisaTrocarSenha ? "Defina sua senha" : "Trocar senha"}
        </CardTitle>
        <CardDescription>
          {usuario.precisaTrocarSenha
            ? "Por segurança, troque a senha provisória antes de continuar."
            : "Depois de trocar, você entrará novamente com a nova senha."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FormTrocarSenha />
      </CardContent>
    </Card>
  );
}
