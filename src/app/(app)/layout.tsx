import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { sair } from "@/modules/usuarios/actions/sessao";

// Layout provisório da área logada: o menu lateral, a busca e o sino entram no passo seguinte.
export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  // Toda a área logada exige sessão válida e troca de senha em dia.
  const usuario = await exigirSessao();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <span className="font-semibold">Pontual Gestão</span>
        <form action={sair} className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">{usuario.nome}</span>
          <Button type="submit" variant="outline" size="sm">
            <LogOut aria-hidden /> Sair
          </Button>
        </form>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
