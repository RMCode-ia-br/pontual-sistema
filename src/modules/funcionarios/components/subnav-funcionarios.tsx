import Link from "next/link";

import { cn } from "@/lib/utils";

const ITENS = [
  { valor: "funcionarios", titulo: "Funcionários", href: "/funcionarios" },
  { valor: "equipes", titulo: "Equipes", href: "/funcionarios/equipes" },
] as const;

/** Alterna entre a lista de funcionários e a de equipes. */
export function SubnavFuncionarios({ atual }: { atual: (typeof ITENS)[number]["valor"] }) {
  return (
    <nav aria-label="Funcionários e equipes" className="mb-6 flex gap-1 border-b">
      {ITENS.map((i) => (
        <Link
          key={i.valor}
          href={i.href}
          aria-current={atual === i.valor ? "page" : undefined}
          className={cn(
            "inline-flex min-h-10 items-center border-b-2 px-3 text-sm",
            atual === i.valor ? "border-primary text-primary font-medium" : "text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          {i.titulo}
        </Link>
      ))}
    </nav>
  );
}
