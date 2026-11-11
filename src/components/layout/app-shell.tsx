"use client";

import { KeyRound, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { sair } from "@/modules/usuarios/actions/sessao";

import { AlternarTema } from "./alternar-tema";
import { BuscaGlobal } from "./busca-global";
import { MENU_CELULAR, rotaAtiva } from "./menu";
import { Navegacao } from "./navegacao";
import { Sino } from "./sino";

type Props = {
  usuario: { nome: string; login: string };
  marca: { nome: string; logoUrl: string | null };
  naoLidas: number;
  children: React.ReactNode;
};

function Marca({ nome, logoUrl, compacta = false }: { nome: string; logoUrl: string | null; compacta?: boolean }) {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2" aria-label={`${nome}: ir para o painel`}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage
        <img src={logoUrl} alt="" className="size-8 shrink-0 rounded-md object-contain" />
      ) : (
        <span
          className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
          aria-hidden
        >
          {nome.trim().charAt(0).toUpperCase() || "P"}
        </span>
      )}
      {compacta ? null : <span className="truncate text-sm font-semibold">{nome}</span>}
    </Link>
  );
}

export function AppShell({ usuario, marca, naoLidas, children }: Props) {
  const caminho = usePathname();
  const router = useRouter();
  const [recolhida, setRecolhida] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);

  return (
    <div className="flex min-h-dvh">
      {/* Menu lateral (computador) */}
      <aside
        className={cn(
          "bg-sidebar text-sidebar-foreground sticky top-0 hidden h-dvh shrink-0 flex-col border-r transition-[width] md:flex",
          recolhida ? "w-16" : "w-64",
        )}
      >
        <div className={cn("flex h-14 items-center border-b px-3", recolhida && "justify-center")}>
          <Marca nome={marca.nome} logoUrl={marca.logoUrl} compacta={recolhida} />
        </div>
        <div className="flex-1 overflow-y-auto">
          <Navegacao recolhida={recolhida} />
        </div>
        <div className="border-t p-2">
          <Button
            type="button"
            variant="ghost"
            className={cn("w-full", recolhida ? "justify-center" : "justify-start")}
            onClick={() => setRecolhida((r) => !r)}
            aria-label={recolhida ? "Expandir menu" : "Recolher menu"}
            aria-pressed={recolhida}
          >
            {recolhida ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
            {recolhida ? null : "Recolher menu"}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior */}
        <header className="bg-background/95 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-3 backdrop-blur md:px-6">
          <div className="md:hidden">
            <Marca nome={marca.nome} logoUrl={marca.logoUrl} compacta />
          </div>
          <div className="flex-1" />

          <BuscaGlobal />

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" className="h-9" aria-label="Criar novo" />}>
              <Plus aria-hidden />
              <span className="hidden sm:inline">Novo</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push("/tarefas/nova")}>Nova tarefa</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Sino naoLidasInicial={naoLidas} />
          <AlternarTema />

          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button type="button" variant="ghost" className="h-9 gap-2 px-2" aria-label={`Menu de ${usuario.nome}`} />}
            >
              <span
                className="bg-primary/10 text-primary flex size-7 items-center justify-center rounded-full text-xs font-semibold"
                aria-hidden
              >
                {usuario.nome.trim().charAt(0).toUpperCase()}
              </span>
              <span className="hidden max-w-32 truncate text-sm lg:inline">{usuario.nome}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <span className="block text-sm font-medium">{usuario.nome}</span>
                  <span className="text-muted-foreground block text-xs font-normal">{usuario.login}</span>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/trocar-senha")}>
                <KeyRound aria-hidden /> Trocar senha
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void sair()}>
                <LogOut aria-hidden /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main id="conteudo" className="mx-auto w-full max-w-7xl flex-1 p-4 pb-24 md:p-6 md:pb-8">
          {children}
        </main>
      </div>

      {/* Barra inferior (celular) */}
      <nav
        aria-label="Atalhos"
        className="bg-background fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {MENU_CELULAR.map((item) => {
          const Icone = item.icone;
          const ativo = rotaAtiva(caminho, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={ativo ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]",
                ativo ? "text-primary font-medium" : "text-muted-foreground",
              )}
            >
              <Icone className="size-5" aria-hidden />
              {item.titulo}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMenuAberto(true)}
          className="text-muted-foreground flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]"
        >
          <Menu className="size-5" aria-hidden />
          Mais
        </button>
      </nav>

      <Sheet open={menuAberto} onOpenChange={setMenuAberto}>
        <SheetContent side="left" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{marca.nome}</SheetTitle>
          </SheetHeader>
          <Navegacao aoNavegar={() => setMenuAberto(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
