"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ABAS = [
  { titulo: "Empresa", href: "/configuracoes/empresa" },
  { titulo: "Usuários", href: "/configuracoes/usuarios" },
  { titulo: "Catálogos", href: "/configuracoes/catalogos" },
  { titulo: "Feriados e férias", href: "/configuracoes/feriados" },
  { titulo: "Modelos de texto", href: "/configuracoes/modelos-texto" },
  { titulo: "Importação", href: "/configuracoes/importacao" },
  { titulo: "Auditoria", href: "/configuracoes/auditoria" },
  { titulo: "Backup e saúde", href: "/configuracoes/backup" },
];

/** Abas de Configurações; rolam na horizontal no celular. */
export function SubmenuConfiguracoes() {
  const caminho = usePathname();
  return (
    <nav aria-label="Seções de configurações" className="-mx-4 mb-6 overflow-x-auto border-b px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1">
        {ABAS.map((aba) => {
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
