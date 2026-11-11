import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { hrefDaLista, TAMANHOS_DE_PAGINA, type Paginacao } from "@/lib/listas/parametros";
import { cn } from "@/lib/utils";

type Props = {
  base: string;
  atuais: Record<string, string | number | undefined>;
  paginacao: Paginacao;
  tamanho: number;
};

const estiloBotao = "inline-flex min-h-9 items-center gap-1 rounded-lg border px-3 text-sm hover:bg-accent";

/** Rodapé das listas: "Mostrando 26–50 de 60", anterior/próxima e tamanho da página. */
export function PaginacaoLista({ base, atuais, paginacao, tamanho }: Props) {
  if (paginacao.total === 0) return null;
  const anterior = paginacao.pagina > 1;
  const proxima = paginacao.pagina < paginacao.paginas;
  return (
    <nav aria-label="Paginação" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground" aria-live="polite">
        Mostrando {paginacao.de}–{paginacao.ate} de {paginacao.total}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">Por página:</span>
        {TAMANHOS_DE_PAGINA.map((t) => (
          <Link
            key={t}
            href={hrefDaLista(base, atuais, { tamanho: t, pagina: 1 })}
            aria-current={t === tamanho ? "true" : undefined}
            className={cn("inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm", t === tamanho ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent")}
          >
            {t}
          </Link>
        ))}
        {anterior ? (
          <Link href={hrefDaLista(base, atuais, { pagina: paginacao.pagina - 1 })} className={estiloBotao} rel="prev">
            <ChevronLeft className="size-4" aria-hidden /> Anterior
          </Link>
        ) : (
          <span className={cn(estiloBotao, "pointer-events-none opacity-40")} aria-disabled="true">
            <ChevronLeft className="size-4" aria-hidden /> Anterior
          </span>
        )}
        <span className="tabular-nums">
          {paginacao.pagina} / {paginacao.paginas}
        </span>
        {proxima ? (
          <Link href={hrefDaLista(base, atuais, { pagina: paginacao.pagina + 1 })} className={estiloBotao} rel="next">
            Próxima <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <span className={cn(estiloBotao, "pointer-events-none opacity-40")} aria-disabled="true">
            Próxima <ChevronRight className="size-4" aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}
