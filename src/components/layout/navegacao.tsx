"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { MENU, rotaAtiva, type GrupoMenu } from "./menu";

type Props = {
  /** Sidebar recolhida: só ícones. */
  recolhida?: boolean;
  aoNavegar?: () => void;
};

function grupoTemRotaAtiva(grupo: GrupoMenu, caminho: string): boolean {
  if (grupo.href) return rotaAtiva(caminho, grupo.href);
  return (grupo.itens ?? []).some((i) => i.href && rotaAtiva(caminho, i.href));
}

export function Navegacao({ recolhida = false, aoNavegar }: Props) {
  const caminho = usePathname();
  // Por padrão, só o grupo da página atual começa aberto.
  const [abertos, setAbertos] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(MENU.filter((g) => grupoTemRotaAtiva(g, caminho)).map((g) => [g.titulo, true])),
  );

  return (
    <nav aria-label="Menu principal" className="flex flex-col gap-0.5 p-2">
      {MENU.map((grupo) => {
        const Icone = grupo.icone;
        const ativoGrupo = grupoTemRotaAtiva(grupo, caminho);

        if (grupo.href) {
          return (
            <Link
              key={grupo.titulo}
              href={grupo.href}
              onClick={aoNavegar}
              aria-current={rotaAtiva(caminho, grupo.href) ? "page" : undefined}
              title={recolhida ? grupo.titulo : undefined}
              className={cn(
                "hover:bg-muted flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium",
                rotaAtiva(caminho, grupo.href) && "bg-accent text-accent-foreground",
                recolhida && "justify-center px-0",
              )}
            >
              <Icone className="size-4 shrink-0" aria-hidden />
              {recolhida ? <span className="sr-only">{grupo.titulo}</span> : grupo.titulo}
            </Link>
          );
        }

        const aberto = !recolhida && (abertos[grupo.titulo] ?? false);
        const idLista = `menu-${grupo.titulo}`.replace(/\s+/g, "-");

        // Grupo sem nenhum item disponível e sem link: item único desabilitado (ex.: Relatórios).
        if (!grupo.itens) {
          return (
            <span
              key={grupo.titulo}
              aria-disabled="true"
              title={recolhida ? `${grupo.titulo} (em breve)` : undefined}
              className={cn(
                "text-muted-foreground/70 flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm",
                recolhida && "justify-center px-0",
              )}
            >
              <Icone className="size-4 shrink-0" aria-hidden />
              {recolhida ? (
                <span className="sr-only">{grupo.titulo} (em breve)</span>
              ) : (
                <>
                  {grupo.titulo}
                  <span className="bg-muted ml-auto rounded px-1.5 py-0.5 text-[10px]">Em breve</span>
                </>
              )}
            </span>
          );
        }

        return (
          <div key={grupo.titulo}>
            <button
              type="button"
              aria-expanded={aberto}
              aria-controls={idLista}
              title={recolhida ? grupo.titulo : undefined}
              onClick={() => setAbertos((a) => ({ ...a, [grupo.titulo]: !a[grupo.titulo] }))}
              className={cn(
                "hover:bg-muted flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium",
                ativoGrupo && "text-primary",
                recolhida && "justify-center px-0",
              )}
            >
              <Icone className="size-4 shrink-0" aria-hidden />
              {recolhida ? (
                <span className="sr-only">{grupo.titulo}</span>
              ) : (
                <>
                  {grupo.titulo}
                  <ChevronDown className={cn("ml-auto size-4 transition-transform", aberto && "rotate-180")} aria-hidden />
                </>
              )}
            </button>
            {aberto ? (
              <ul id={idLista} className="mt-0.5 mb-1 ml-5 flex flex-col gap-0.5 border-l pl-2">
                {grupo.itens.map((item) => (
                  <li key={item.titulo}>
                    {item.href ? (
                      <Link
                        href={item.href}
                        onClick={aoNavegar}
                        aria-current={rotaAtiva(caminho, item.href) ? "page" : undefined}
                        className={cn(
                          "hover:bg-muted flex min-h-9 items-center rounded-md px-2 text-sm",
                          rotaAtiva(caminho, item.href) && "bg-accent text-accent-foreground font-medium",
                        )}
                      >
                        {item.titulo}
                      </Link>
                    ) : (
                      <span
                        aria-disabled="true"
                        className="text-muted-foreground/70 flex min-h-9 items-center gap-2 rounded-md px-2 text-sm"
                      >
                        {item.titulo}
                        <span className="bg-muted ml-auto rounded px-1.5 py-0.5 text-[10px]">Em breve</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
