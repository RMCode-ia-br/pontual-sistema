"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import type { PermissoesDoMenu } from "./menu";

const ABAS = [
  { titulo: "Empresa", href: "/configuracoes/empresa", modulo: "CONFIGURACOES" },
  { titulo: "Usuários", href: "/configuracoes/usuarios", modulo: "CONFIGURACOES" },
  { titulo: "Catálogos", href: "/configuracoes/catalogos", modulo: "CADASTROS" },
  { titulo: "Feriados e férias", href: "/configuracoes/feriados", modulo: "CONFIGURACOES" },
  { titulo: "Modelo de etapas", href: "/configuracoes/modelo-etapas", modulo: "CONFIGURACOES" },
  { titulo: "Modelos de texto", href: "/configuracoes/modelos-texto", modulo: "CONFIGURACOES" },
  { titulo: "Importação", href: "/configuracoes/importacao", modulo: "CONFIGURACOES" },
  { titulo: "Auditoria", href: "/configuracoes/auditoria", modulo: "CONFIGURACOES" },
  { titulo: "Backup e saúde", href: "/configuracoes/backup", modulo: "CONFIGURACOES" },
] as const;

/** Abas de Configurações; rolam na horizontal no celular. */
export function SubmenuConfiguracoes({ permissoes }: { permissoes: PermissoesDoMenu }) {
  const caminho = usePathname();
  const abas = ABAS.filter((a) => permissoes.modulos[a.modulo].nivel !== "SEM_ACESSO");
  return (
    <nav aria-label="Seções de configurações" className="-mx-4 mb-6 overflow-x-auto border-b px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1">
        {abas.map((aba) => {
          const ativa = caminho === aba.href || caminho.startsWith(`${aba.href}/`);
          return (
            <li key={aba.href}>
              <Link
                href={aba.href}
                aria-current={ativa ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-10 items-center border-b-2 px-3 text-sm whitespace-nowrap",
                  ativa ? "border-primary text-primary font-medium" : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {aba.titulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
